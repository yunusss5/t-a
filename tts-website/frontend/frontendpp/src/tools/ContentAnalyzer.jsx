// src/tools/ContentAnalyzer.jsx
// Readability, keyword density, phrase mining and time estimates in one pass.

import { useState } from 'react';
import toast from 'react-hot-toast';
import { ScanSearch } from 'lucide-react';
import { postForm } from '../lib/api';
import { formatDuration } from '../lib/utils';
import { Button, ErrorNote, Panel, TextArea, ToolGrid } from '../components/ui/Primitives';
import { Chips, EmptyState, Stat, StatRow } from '../components/ui/Display';

/** Flesch score → gauge fill + tone. Higher is easier to read. */
function readTone(score) {
  if (score >= 60) return 'good';
  if (score >= 45) return 'warn';
  return 'bad';
}

export default function ContentAnalyzer() {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  const run = async () => {
    setError('');
    setLoading(true);

    try {
      const result = await postForm('/api/text/analyze', { text });
      setData(result);
      toast.success('Analysis complete');
    } catch (err) {
      setError(err.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ToolGrid>
      <Panel title="Text to audit" hint="Blog post, script, landing page copy — anything you publish.">
        <TextArea
          value={text}
          onChange={setText}
          rows={18}
          maxLength={200000}
          placeholder="Paste your content…"
        />
        <div className="btn-row">
          <Button icon={<ScanSearch size={16} />} loading={loading} disabled={text.trim().length < 40} onClick={run}>
            Analyze
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
            <EmptyState icon={<ScanSearch size={26} />} title="Nothing analysed yet">
              You get counts, Flesch reading ease, grade level, reading and speaking time, keyword
              density and the phrases search engines will pick up on.
            </EmptyState>
          </Panel>
        ) : (
          <>
            <Panel title="Counts">
              <StatRow>
                <Stat label="Words" value={data.stats.words.toLocaleString()} />
                <Stat label="Characters" value={data.stats.characters.toLocaleString()} />
                <Stat label="Sentences" value={data.stats.sentences} />
                <Stat label="Paragraphs" value={data.stats.paragraphs} />
                <Stat label="Read time" value={formatDuration(data.stats.reading_seconds)} />
                <Stat label="Speak time" value={formatDuration(data.stats.speaking_seconds)} />
              </StatRow>
            </Panel>

            <Panel title="Readability" hint={`Flesch Reading Ease · ${data.readability.label}`}>
              <StatRow>
                <Stat
                  label="Score"
                  value={data.readability.score}
                  hint={data.readability.level}
                  tone={readTone(data.readability.score)}
                />
                <Stat label="Grade" value={data.readability.grade} hint="US school grade" />
                <Stat label="Words / sentence" value={data.readability.words_per_sentence} />
                <Stat label="Syllables / word" value={data.readability.syllables_per_word} />
              </StatRow>
              <div className="meter">
                <div
                  className="meter-fill"
                  style={{ width: `${Math.max(3, Math.min(100, data.readability.score))}%` }}
                />
              </div>
              <p className="muted-line">
                Aim for 60+ on general-audience content. Shorter sentences move this up fastest.
              </p>
            </Panel>

            <Panel title="Keyword density" hint="Top terms with their share of total words">
              <div className="kv-list">
                {data.keywords.slice(0, 12).map((item) => (
                  <div className="kv-row" key={item.keyword}>
                    <span>{item.keyword}</span>
                    <span>
                      {item.count}× · {item.density}%
                    </span>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Phrases">
              <Chips items={data.phrases.map((p) => ({ label: p.phrase, badge: p.count }))} />
              <div className="divider" />
              <Chips
                items={data.long_tail.map((p) => p.phrase)}
                tone="muted"
                empty="No long-tail phrases in this text."
              />
            </Panel>

            <Panel title="What a reader takes away">
              <div className="result-list">
                {data.summary.map((line, index) => (
                  <div className="list-row" key={index}>
                    <span className="list-row-index">{index + 1}</span>
                    <span className="list-row-body">{line}</span>
                  </div>
                ))}
              </div>
            </Panel>
          </>
        )}
      </div>
    </ToolGrid>
  );
}
