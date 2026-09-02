// src/tools/TextCleaner.jsx
// Toggleable clean-up passes applied in a predictable order.

import { useMemo, useState } from 'react';
import { Download, Eraser } from 'lucide-react';
import { copyText, downloadText } from '../lib/utils';
import { Button, Checkbox, Field, Panel, TextArea, ToolGrid } from '../components/ui/Primitives';
import { Stat, StatRow } from '../components/ui/Display';

/** Order matters: HTML first, whitespace last, so nothing re-introduces gaps. */
const PASSES = [
  ['stripHtml', 'Remove HTML tags', (v) => v.replace(/<[^>]*>/g, ' ')],
  ['stripUrls', 'Remove URLs', (v) => v.replace(/https?:\/\/\S+|www\.\S+/gi, '')],
  // U+FE0F is a combining selector, so it is matched as a suffix rather than
  // listed inside the class (which would be a misleading character class).
  ['stripEmoji', 'Remove emoji and symbols', (v) => v.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]\u{FE0F}?|\u{FE0F}/gu, '')],
  ['stripBrackets', 'Remove [bracketed] notes', (v) => v.replace(/\[[^\]]*\]/g, '')],
  ['smartQuotes', 'Straighten smart quotes', (v) => v.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, '-')],
  ['stripPunct', 'Remove punctuation', (v) => v.replace(/[^\p{L}\p{N}\s]/gu, '')],
  ['stripNumbers', 'Remove numbers', (v) => v.replace(/\d+/g, '')],
  ['dedupeLines', 'Remove duplicate lines', (v) => [...new Set(v.split('\n').map((l) => l.trim()))].join('\n')],
  ['sortLines', 'Sort lines A→Z', (v) => v.split('\n').sort((a, b) => a.localeCompare(b)).join('\n')],
  ['blankLines', 'Collapse blank lines', (v) => v.replace(/\n{3,}/g, '\n\n')],
  ['lineBreaks', 'Join into one paragraph', (v) => v.replace(/\s*\n+\s*/g, ' ')],
  ['spaces', 'Collapse extra spaces', (v) => v.replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+$/gm, '')],
];

const DEFAULTS = { smartQuotes: true, blankLines: true, spaces: true };

export default function TextCleaner() {
  const [text, setText] = useState('');
  const [active, setActive] = useState(DEFAULTS);

  const output = useMemo(
    () => PASSES.reduce((value, [key, , fn]) => (active[key] ? fn(value) : value), text).trim(),
    [text, active],
  );

  const toggle = (key) => setActive((current) => ({ ...current, [key]: !current[key] }));

  const removed = Math.max(0, text.length - output.length);

  return (
    <ToolGrid>
      <div className="stack">
        <Panel title="Input">
          <TextArea value={text} onChange={setText} rows={12} placeholder="Paste messy text — scraped copy, captions, exported notes…" />
        </Panel>

        <Panel title="Clean-up passes" hint="Applied top to bottom.">
          <Field>
            {PASSES.map(([key, label]) => (
              <Checkbox key={key} label={label} checked={!!active[key]} onChange={() => toggle(key)} />
            ))}
          </Field>
          <div className="btn-row">
            <Button variant="soft" onClick={() => setActive(DEFAULTS)}>
              Reset to defaults
            </Button>
            <Button variant="ghost" onClick={() => setActive({})}>
              Turn all off
            </Button>
          </div>
        </Panel>
      </div>

      <Panel
        title="Cleaned text"
        hint={`${removed.toLocaleString()} characters removed`}
        actions={
          output && (
            <>
              <Button variant="ghost" onClick={() => copyText(output, 'Cleaned text copied')}>
                Copy
              </Button>
              <Button variant="ghost" icon={<Download size={15} />} onClick={() => downloadText('cleaned.txt', output)}>
                .txt
              </Button>
            </>
          )
        }
      >
        <StatRow>
          <Stat label="Before" value={text.length.toLocaleString()} hint="characters" />
          <Stat label="After" value={output.length.toLocaleString()} hint="characters" />
          <Stat label="Lines" value={output ? output.split('\n').length : 0} />
        </StatRow>
        {output ? (
          <pre className="code-block">{output}</pre>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">
              <Eraser size={26} />
            </div>
            <p className="empty-title">Clean output appears here</p>
            <p className="empty-body">
              Handy for auto-generated captions: turn on “Remove [bracketed] notes” and “Join into
              one paragraph” to get publishable prose in one step.
            </p>
          </div>
        )}
      </Panel>
    </ToolGrid>
  );
}
