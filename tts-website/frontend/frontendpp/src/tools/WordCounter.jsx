// src/tools/WordCounter.jsx
// Live counts and time estimates, computed entirely in the browser.

import { useMemo, useState } from 'react';
import { copyText, formatDuration } from '../lib/utils';
import { Button, Panel, TextArea, ToolGrid } from '../components/ui/Primitives';
import { Chips, Stat, StatRow } from '../components/ui/Display';

const READING_WPM = 225;
const SPEAKING_WPM = 150;

function analyse(text) {
  const trimmed = text.trim();
  const words = trimmed ? trimmed.split(/\s+/) : [];
  const sentences = trimmed ? trimmed.split(/[.!?]+(?:\s|$)/).filter((s) => s.trim()) : [];
  const paragraphs = trimmed ? trimmed.split(/\n{2,}/).filter((p) => p.trim()) : [];
  const lines = text ? text.split('\n').length : 0;

  const counts = new Map();
  words.forEach((raw) => {
    const key = raw.toLowerCase().replace(/[^a-z0-9'’-]/g, '');
    if (key.length < 4) return;
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([word, count]) => ({ label: word, badge: count }));

  return {
    words: words.length,
    characters: text.length,
    charactersNoSpaces: text.replace(/\s/g, '').length,
    sentences: sentences.length,
    paragraphs: paragraphs.length,
    lines,
    longest: words.reduce((best, word) => (word.length > best.length ? word : best), ''),
    average: words.length ? (words.join('').length / words.length).toFixed(1) : '0',
    readingSeconds: Math.round((words.length / READING_WPM) * 60),
    speakingSeconds: Math.round((words.length / SPEAKING_WPM) * 60),
    top,
  };
}

export default function WordCounter() {
  const [text, setText] = useState('');
  const stats = useMemo(() => analyse(text), [text]);

  return (
    <ToolGrid>
      <Panel
        title="Text"
        hint="Counts update as you type. Nothing leaves your browser."
        actions={
          text && (
            <>
              <Button variant="ghost" onClick={() => copyText(text, 'Text copied')}>
                Copy
              </Button>
              <Button variant="ghost" onClick={() => setText('')}>
                Clear
              </Button>
            </>
          )
        }
      >
        <TextArea value={text} onChange={setText} rows={20} placeholder="Start typing or paste your text…" />
      </Panel>

      <div className="stack">
        <Panel title="Counts">
          <StatRow>
            <Stat label="Words" value={stats.words.toLocaleString()} />
            <Stat label="Characters" value={stats.characters.toLocaleString()} />
            <Stat label="No spaces" value={stats.charactersNoSpaces.toLocaleString()} />
            <Stat label="Sentences" value={stats.sentences} />
            <Stat label="Paragraphs" value={stats.paragraphs} />
            <Stat label="Lines" value={stats.lines} />
          </StatRow>
        </Panel>

        <Panel title="Timing" hint="225 wpm reading · 150 wpm speaking">
          <StatRow>
            <Stat label="Read time" value={formatDuration(stats.readingSeconds)} />
            <Stat label="Speak time" value={formatDuration(stats.speakingSeconds)} />
            <Stat label="Avg word" value={`${stats.average} ch`} />
            <Stat label="Longest" value={stats.longest ? stats.longest.length : 0} hint={stats.longest || '—'} />
          </StatRow>
        </Panel>

        <Panel title="Most used words" hint="4+ letters, click to copy">
          <Chips items={stats.top} empty="Type something to see word frequency." />
        </Panel>

        <Panel title="Platform limits" hint="How this text fits common fields">
          <div className="kv-list">
            {[
              ['Tweet / X post', 280],
              ['YouTube title', 100],
              ['YouTube description', 5000],
              ['Meta description', 158],
              ['Instagram caption', 2200],
            ].map(([label, limit]) => (
              <div className="kv-row" key={label}>
                <span>{label}</span>
                <span style={{ color: stats.characters > limit ? 'var(--danger)' : undefined }}>
                  {stats.characters} / {limit}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </ToolGrid>
  );
}
