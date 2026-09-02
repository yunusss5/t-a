// src/tools/CaseConverter.jsx
// Every case style a writer or developer needs, converted live.

import { useMemo, useState } from 'react';
import { CaseSensitive } from 'lucide-react';
import { copyText } from '../lib/utils';
import { Button, Panel, TextArea, ToolGrid } from '../components/ui/Primitives';
import { CopyRow } from '../components/ui/Display';

const MINOR = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'nor', 'of', 'on',
  'or', 'so', 'the', 'to', 'up', 'via', 'with', 'yet']);

const tokens = (value) =>
  value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[\s_\-.]+/)
    .map((part) => part.trim())
    .filter(Boolean);

function titleCase(value) {
  return tokens(value)
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index > 0 && MINOR.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

function sentenceCase(value) {
  const lower = value.toLowerCase();
  return lower.replace(/(^\s*\w|[.!?]\s+\w)/g, (match) => match.toUpperCase());
}

const CONVERSIONS = [
  ['UPPERCASE', (v) => v.toUpperCase()],
  ['lowercase', (v) => v.toLowerCase()],
  ['Sentence case', sentenceCase],
  ['Title Case', titleCase],
  ['camelCase', (v) => tokens(v).map((w, i) => (i ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase())).join('')],
  ['PascalCase', (v) => tokens(v).map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join('')],
  ['snake_case', (v) => tokens(v).map((w) => w.toLowerCase()).join('_')],
  ['CONSTANT_CASE', (v) => tokens(v).map((w) => w.toUpperCase()).join('_')],
  ['kebab-case', (v) => tokens(v).map((w) => w.toLowerCase()).join('-')],
  ['dot.case', (v) => tokens(v).map((w) => w.toLowerCase()).join('.')],
  ['Train-Case', (v) => tokens(v).map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join('-')],
  ['aLtErNaTiNg', (v) => [...v].map((ch, i) => (i % 2 ? ch.toUpperCase() : ch.toLowerCase())).join('')],
  ['esreveR', (v) => [...v].reverse().join('')],
];

export default function CaseConverter() {
  const [text, setText] = useState('');

  const results = useMemo(() => {
    if (!text.trim()) return [];
    return CONVERSIONS.map(([label, fn]) => {
      try {
        return { label, value: fn(text) };
      } catch {
        return { label, value: '' };
      }
    }).filter((item) => item.value);
  }, [text]);

  return (
    <ToolGrid>
      <Panel
        title="Input"
        hint="Works on a single heading or a whole document."
        actions={
          text && (
            <Button variant="ghost" onClick={() => setText('')}>
              Clear
            </Button>
          )
        }
      >
        <TextArea value={text} onChange={setText} rows={14} placeholder="Type or paste text to convert…" />
        <p className="muted-line">
          Identifiers are split on spaces, dashes, dots, underscores and camel humps, so
          <code> myVariableName</code> and <code>my-variable-name</code> both convert cleanly.
        </p>
      </Panel>

      <Panel title="Conversions" hint="Click any row to copy it.">
        {results.length ? (
          results.map((item) => <CopyRow key={item.label} label={item.label} value={item.value} multiline />)
        ) : (
          <div className="empty-state">
            <div className="empty-icon">
              <CaseSensitive size={26} />
            </div>
            <p className="empty-title">Nothing to convert yet</p>
            <p className="empty-body">
              Thirteen styles are generated at once — from Title Case for headlines to
              CONSTANT_CASE for code.
            </p>
            <Button variant="soft" onClick={() => copyText('the quick brown fox jumps', 'Sample copied')}>
              Copy a sample to try
            </Button>
          </div>
        )}
      </Panel>
    </ToolGrid>
  );
}
