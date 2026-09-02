// src/tools/JsonFormatter.jsx
// Pretty-print, minify and validate JSON with a readable error position.

import { useState } from 'react';
import toast from 'react-hot-toast';
import { Braces, Download, Minimize2, Wand2 } from 'lucide-react';
import { copyText, downloadText } from '../lib/utils';
import {
  Button, Checkbox, ErrorNote, Field, Panel, Segmented, TextArea, ToolGrid,
} from '../components/ui/Primitives';
import { EmptyState, Stat, StatRow } from '../components/ui/Display';

const INDENTS = [
  { value: '2', label: '2 spaces' },
  { value: '4', label: '4 spaces' },
  { value: 'tab', label: 'Tab' },
];

/** Turn "…position 42" into a line/column the user can actually find. */
function locate(message, source) {
  const match = /position (\d+)/.exec(message);
  if (!match) return message;

  const index = Number(match[1]);
  const before = source.slice(0, index);
  const line = before.split('\n').length;
  const column = index - before.lastIndexOf('\n');

  return `${message.replace(/ in JSON at position \d+.*/, '')} — line ${line}, column ${column}`;
}

function summarise(value, depth = 0) {
  if (Array.isArray(value)) {
    return value.reduce((acc, item) => {
      const child = summarise(item, depth + 1);
      return { keys: acc.keys + child.keys, depth: Math.max(acc.depth, child.depth) };
    }, { keys: 0, depth });
  }

  if (value && typeof value === 'object') {
    return Object.values(value).reduce((acc, item) => {
      const child = summarise(item, depth + 1);
      return { keys: acc.keys + child.keys, depth: Math.max(acc.depth, child.depth) };
    }, { keys: Object.keys(value).length, depth });
  }

  return { keys: 0, depth };
}

export default function JsonFormatter() {
  const [input, setInput] = useState('');
  const [indent, setIndent] = useState('2');
  const [sortKeys, setSortKeys] = useState(false);
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState(null);

  const parse = () => {
    try {
      const parsed = JSON.parse(input);
      setError('');
      return parsed;
    } catch (err) {
      setError(locate(err.message, input));
      setOutput('');
      setInfo(null);
      return undefined;
    }
  };

  const replacer = sortKeys
    ? (key, value) =>
        value && typeof value === 'object' && !Array.isArray(value)
          ? Object.keys(value).sort().reduce((acc, k) => ({ ...acc, [k]: value[k] }), {})
          : value
    : undefined;

  const format = () => {
    const parsed = parse();
    if (parsed === undefined) return;

    const space = indent === 'tab' ? '\t' : Number(indent);
    const result = JSON.stringify(parsed, replacer, space);

    setOutput(result);
    setInfo({ ...summarise(parsed), type: Array.isArray(parsed) ? 'array' : typeof parsed });
    toast.success('Valid JSON — formatted');
  };

  const minify = () => {
    const parsed = parse();
    if (parsed === undefined) return;

    const result = JSON.stringify(parsed, replacer);
    setOutput(result);
    setInfo({ ...summarise(parsed), type: Array.isArray(parsed) ? 'array' : typeof parsed });
    toast.success(`Minified — ${input.length - result.length} characters saved`);
  };

  return (
    <ToolGrid>
      <Panel
        title="Input"
        hint="Paste API responses, config files or exported data."
        actions={
          input && (
            <Button variant="ghost" onClick={() => { setInput(''); setOutput(''); setError(''); setInfo(null); }}>
              Clear
            </Button>
          )
        }
      >
        <TextArea
          value={input}
          onChange={setInput}
          rows={16}
          className="mono"
          placeholder={'{"name":"Kiro","tools":22}'}
        />

        <Field label="Indentation">
          <Segmented value={indent} onChange={setIndent} options={INDENTS} size="sm" label="Indentation" />
        </Field>

        <Checkbox
          checked={sortKeys}
          onChange={setSortKeys}
          label="Sort object keys alphabetically"
        />

        <div className="btn-row">
          <Button icon={<Wand2 size={16} />} disabled={!input.trim()} onClick={format}>
            Format
          </Button>
          <Button variant="soft" icon={<Minimize2 size={15} />} disabled={!input.trim()} onClick={minify}>
            Minify
          </Button>
        </div>

        <ErrorNote>{error}</ErrorNote>
      </Panel>

      <Panel
        title="Output"
        hint={output ? `${output.length.toLocaleString()} characters` : 'Valid JSON only'}
        actions={
          output && (
            <>
              <Button variant="ghost" onClick={() => copyText(output, 'JSON copied')}>
                Copy
              </Button>
              <Button
                variant="ghost"
                icon={<Download size={15} />}
                onClick={() => downloadText('data.json', output, 'application/json')}
              >
                .json
              </Button>
            </>
          )
        }
      >
        {info && (
          <StatRow>
            <Stat label="Root type" value={info.type} />
            <Stat label="Keys" value={info.keys.toLocaleString()} />
            <Stat label="Max depth" value={info.depth} />
            <Stat label="Size" value={`${(output.length / 1024).toFixed(1)} KB`} />
          </StatRow>
        )}
        {output ? (
          <pre className="code-block">{output}</pre>
        ) : (
          <EmptyState icon={<Braces size={26} />} title="Formatted JSON appears here">
            Syntax errors are reported with a line and column, so you can jump straight to the
            problem instead of hunting for a stray comma.
          </EmptyState>
        )}
      </Panel>
    </ToolGrid>
  );
}
