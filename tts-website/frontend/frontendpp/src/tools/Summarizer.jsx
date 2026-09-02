// src/tools/Summarizer.jsx
// Extractive summary: a paragraph plus the same points as bullets.

import { useState } from 'react';
import toast from 'react-hot-toast';
import { Download, Wand2 } from 'lucide-react';
import { postForm } from '../lib/api';
import { copyText, downloadText, formatDuration } from '../lib/utils';
import { Button, ErrorNote, Field, Panel, Segmented, TextArea, ToolGrid } from '../components/ui/Primitives';
import { Chips, CopyRow, EmptyState, Stat, StatRow } from '../components/ui/Display';

const LENGTHS = [
  { value: '3', label: 'Short' },
  { value: '5', label: 'Medium' },
  { value: '8', label: 'Detailed' },
];

export default function Summarizer() {
  const [text, setText] = useState('');
  const [sentences, setSentences] = useState('5');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  const run = async () => {
    setError('');
    setLoading(true);

    try {
      const result = await postForm('/api/text/summarize', { text, sentences });
      setData(result);
      toast.success(`${result.reduction_percent}% shorter`);
    } catch (err) {
      setError(err.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ToolGrid>
      <Panel title="Source text" hint="Article, transcript, meeting notes, research — anything.">
        <TextArea
          value={text}
          onChange={setText}
          rows={16}
          maxLength={200000}
          placeholder="Paste the text you want condensed…"
        />
        <Field label="Summary length">
          <Segmented value={sentences} onChange={setSentences} options={LENGTHS} label="Summary length" />
        </Field>
        <div className="btn-row">
          <Button icon={<Wand2 size={16} />} loading={loading} disabled={text.trim().length < 80} onClick={run}>
            Summarize
          </Button>
          {text && (
            <Button variant="ghost" onClick={() => { setText(''); setData(null); }}>
              Clear
            </Button>
          )}
        </div>
        <ErrorNote>{error}</ErrorNote>
      </Panel>

      <div className="stack">
        {!data ? (
          <Panel>
            <EmptyState icon={<Wand2 size={26} />} title="Summary appears here">
              Sentences are ranked by keyword weight and position, so the result keeps the author's
              own wording instead of paraphrasing it.
            </EmptyState>
          </Panel>
        ) : (
          <>
            <Panel title="Result" hint={`${data.reduction_percent}% shorter`}>
              <StatRow>
                <Stat label="Original" value={data.original.words.toLocaleString()} hint="words" />
                <Stat label="Summary" value={data.condensed.words.toLocaleString()} hint="words" />
                <Stat label="Saved" value={`${data.reduction_percent}%`} tone="good" />
                <Stat label="Read time" value={formatDuration(data.condensed.reading_seconds)} />
              </StatRow>
              <CopyRow label="Paragraph" value={data.summary} multiline />
              <div className="btn-row end">
                <Button
                  variant="soft"
                  icon={<Download size={15} />}
                  onClick={() => downloadText('summary.txt', data.summary)}
                >
                  Download
                </Button>
              </div>
            </Panel>

            <Panel
              title="Key points"
              actions={
                <Button
                  variant="ghost"
                  onClick={() => copyText(data.bullets.map((b) => `• ${b}`).join('\n'), 'Bullets copied')}
                >
                  Copy bullets
                </Button>
              }
            >
              <div className="result-list">
                {data.bullets.map((bullet, index) => (
                  <div className="list-row" key={index}>
                    <span className="list-row-index">{index + 1}</span>
                    <span className="list-row-body">{bullet}</span>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Keywords">
              <Chips items={data.keywords} />
            </Panel>
          </>
        )}
      </div>
    </ToolGrid>
  );
}
