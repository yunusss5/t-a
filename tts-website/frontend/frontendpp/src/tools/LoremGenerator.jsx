// src/tools/LoremGenerator.jsx
// Placeholder copy by words, sentences or paragraphs.

import { useMemo, useState } from 'react';
import { Download, RefreshCw, Type } from 'lucide-react';
import { copyText, downloadText } from '../lib/utils';
import {
  Button, Checkbox, Field, Input, Panel, Segmented, ToolGrid,
} from '../components/ui/Primitives';
import { Stat, StatRow } from '../components/ui/Display';

const WORDS = ('lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor '
  + 'incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation '
  + 'ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit '
  + 'voluptate velit esse cillum eu fugiat nulla pariatur excepteur sint occaecat cupidatat non '
  + 'proident sunt culpa qui officia deserunt mollit anim id est laborum').split(' ');

const UNITS = [
  { value: 'paragraphs', label: 'Paragraphs' },
  { value: 'sentences', label: 'Sentences' },
  { value: 'words', label: 'Words' },
];

const pick = () => WORDS[Math.floor(Math.random() * WORDS.length)];
const randomInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

function sentence() {
  const body = Array.from({ length: randomInt(8, 18) }, pick).join(' ');
  return `${body.charAt(0).toUpperCase()}${body.slice(1)}.`;
}

const paragraph = () => Array.from({ length: randomInt(3, 6) }, sentence).join(' ');

export default function LoremGenerator() {
  const [unit, setUnit] = useState('paragraphs');
  const [count, setCount] = useState('3');
  const [classic, setClassic] = useState(true);
  // Bumped by the Generate button so the same options can yield fresh text.
  const [seed, setSeed] = useState(0);

  const output = useMemo(() => {
    void seed;
    const amount = Math.max(1, Math.min(200, Number(count) || 1));
    let blocks;

    if (unit === 'words') {
      blocks = [Array.from({ length: amount }, pick).join(' ')];
    } else if (unit === 'sentences') {
      blocks = [Array.from({ length: amount }, sentence).join(' ')];
    } else {
      blocks = Array.from({ length: amount }, paragraph);
    }

    const text = blocks.join('\n\n');
    return classic ? text.replace(/^\S+\s\S+/, 'Lorem ipsum') : text;
  }, [unit, count, classic, seed]);

  const words = output.trim() ? output.trim().split(/\s+/).length : 0;

  return (
    <ToolGrid>
      <Panel title="Options" hint="Fresh text every time you press generate.">
        <Field label="Unit">
          <Segmented value={unit} onChange={setUnit} options={UNITS} size="sm" label="Unit" />
        </Field>
        <Field label="How many" hint="1–200">
          <Input value={count} onChange={setCount} type="number" min="1" max="200" />
        </Field>
        <Checkbox
          checked={classic}
          onChange={setClassic}
          label="Start with the classic “Lorem ipsum”"
        />
        <div className="btn-row">
          <Button icon={<RefreshCw size={16} />} onClick={() => setSeed((n) => n + 1)}>
            Generate
          </Button>
        </div>
        <p className="muted-line">
          Placeholder copy keeps a design honest — real words pull attention to the writing instead
          of the layout.
        </p>
      </Panel>

      <Panel
        title="Output"
        actions={
          output && (
            <>
              <Button variant="ghost" onClick={() => copyText(output, 'Placeholder text copied')}>
                Copy
              </Button>
              <Button variant="ghost" icon={<Download size={15} />} onClick={() => downloadText('lorem.txt', output)}>
                .txt
              </Button>
            </>
          )
        }
      >
        <StatRow>
          <Stat label="Words" value={words.toLocaleString()} />
          <Stat label="Characters" value={output.length.toLocaleString()} />
          <Stat label="Blocks" value={output ? output.split('\n\n').length : 0} />
        </StatRow>
        {output ? (
          <pre className="code-block">{output}</pre>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">
              <Type size={26} />
            </div>
            <p className="empty-title">Press generate</p>
          </div>
        )}
      </Panel>
    </ToolGrid>
  );
}
