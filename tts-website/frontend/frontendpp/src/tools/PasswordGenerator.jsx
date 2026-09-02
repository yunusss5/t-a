// src/tools/PasswordGenerator.jsx
// crypto.getRandomValues-backed passwords and passphrases with an entropy read-out.

import { useMemo, useState } from 'react';
import { KeyRound, RefreshCw } from 'lucide-react';
import { copyText } from '../lib/utils';
import {
  Button, Checkbox, Field, Panel, Range, Segmented, ToolGrid,
} from '../components/ui/Primitives';
import { Stat, StatRow } from '../components/ui/Display';

const SETS = {
  lower: 'abcdefghijkmnopqrstuvwxyz',
  upper: 'ABCDEFGHJKLMNPQRSTUVWXYZ',
  digits: '23456789',
  symbols: '!@#$%^&*-_=+?',
  ambiguous: 'ilLoO01',
};

const WORDS = ('anchor bramble cinder dapple ember fathom gossamer harbor indigo jasper kindle '
  + 'lantern marrow nimbus orchard pebble quarry ripple saffron thistle umber velvet willow '
  + 'yonder zephyr basalt copper drift echo fern glint hollow ivory')
  .split(' ');

const MODES = [
  { value: 'password', label: 'Password' },
  { value: 'passphrase', label: 'Passphrase' },
];

/** Uniform random index without modulo bias for small alphabets. */
function randomInt(max) {
  const limit = Math.floor(0xffffffff / max) * max;
  const buffer = new Uint32Array(1);

  let value;
  do {
    crypto.getRandomValues(buffer);
    [value] = buffer;
  } while (value >= limit);

  return value % max;
}

const pick = (alphabet) => alphabet[randomInt(alphabet.length)];

function strengthOf(bits) {
  if (bits >= 100) return { label: 'Excellent', tone: 'good', pct: 100 };
  if (bits >= 72) return { label: 'Strong', tone: 'good', pct: 80 };
  if (bits >= 56) return { label: 'Reasonable', tone: 'warn', pct: 55 };
  if (bits >= 40) return { label: 'Weak', tone: 'bad', pct: 32 };
  return { label: 'Very weak', tone: 'bad', pct: 14 };
}

export default function PasswordGenerator() {
  const [mode, setMode] = useState('password');
  const [length, setLength] = useState(20);
  const [wordCount, setWordCount] = useState(5);
  const [options, setOptions] = useState({ lower: true, upper: true, digits: true, symbols: true, ambiguous: false });
  // Bumped by the regenerate button so identical settings still yield a new secret.
  const [seed, setSeed] = useState(0);

  const value = useMemo(() => {
    void seed;

    if (mode === 'passphrase') {
      const words = Array.from({ length: wordCount }, () => pick(WORDS));
      words[randomInt(words.length)] += randomInt(90) + 10;
      return words.join('-');
    }

    let alphabet = '';
    if (options.lower) alphabet += SETS.lower;
    if (options.upper) alphabet += SETS.upper;
    if (options.digits) alphabet += SETS.digits;
    if (options.symbols) alphabet += SETS.symbols;
    if (options.ambiguous) alphabet += SETS.ambiguous;

    if (!alphabet) return '';

    return Array.from({ length }, () => pick(alphabet)).join('');
  }, [mode, length, wordCount, options, seed]);

  const regenerate = () => setSeed((n) => n + 1);

  const poolSize =
    mode === 'passphrase'
      ? WORDS.length
      : Object.entries(options).reduce((total, [key, on]) => total + (on ? SETS[key].length : 0), 0);

  const symbols = mode === 'passphrase' ? wordCount : length;
  const bits = poolSize > 1 ? Math.round(symbols * Math.log2(poolSize)) : 0;
  const strength = strengthOf(bits);

  return (
    <ToolGrid>
      <Panel title="Options" hint="Generated locally with the Web Crypto API.">
        <Field label="Type">
          <Segmented value={mode} onChange={setMode} options={MODES} size="sm" label="Type" />
        </Field>

        {mode === 'password' ? (
          <>
            <Field label="Length" hint={`${length} characters`}>
              <Range value={length} onChange={setLength} min={8} max={64} />
            </Field>

            {[
              ['lower', 'Lowercase letters'],
              ['upper', 'Uppercase letters'],
              ['digits', 'Numbers'],
              ['symbols', 'Symbols'],
              ['ambiguous', 'Allow look-alikes (i, l, 1, O, 0)'],
            ].map(([key, label]) => (
              <Checkbox
                key={key}
                label={label}
                checked={options[key]}
                onChange={(next) => setOptions((current) => ({ ...current, [key]: next }))}
              />
            ))}
          </>
        ) : (
          <Field label="Words" hint={`${wordCount} words joined with dashes`}>
            <Range value={wordCount} onChange={setWordCount} min={3} max={10} />
          </Field>
        )}

        <div className="btn-row">
          <Button icon={<RefreshCw size={16} />} onClick={regenerate}>
            Generate
          </Button>
        </div>

        <p className="muted-line">
          Look-alike characters are excluded by default so a password stays readable when it has to
          be typed by hand or read out loud.
        </p>
      </Panel>

      <Panel
        title="Your password"
        actions={
          value && (
            <Button variant="ghost" icon={<KeyRound size={15} />} onClick={() => copyText(value, 'Password copied')}>
              Copy
            </Button>
          )
        }
      >
        <div className="mono-out">{value || 'Enable at least one character set'}</div>

        <div className="meter">
          <div className="meter-fill" style={{ width: `${strength.pct}%` }} />
        </div>

        <StatRow>
          <Stat label="Strength" value={strength.label} tone={strength.tone} />
          <Stat label="Entropy" value={`${bits} bits`} />
          <Stat label="Pool" value={poolSize} hint={mode === 'passphrase' ? 'words' : 'characters'} />
          <Stat label="Length" value={value.length} />
        </StatRow>

        <p className="inline-note">
          72 bits or more is comfortable for anything important. Passphrases reach that with five
          words and are far easier to remember than a random string.
        </p>
      </Panel>
    </ToolGrid>
  );
}
