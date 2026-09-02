// src/tools/TimestampCalculator.jsx
// Timecode arithmetic plus even chapter splitting for video work.

import { useMemo, useState } from 'react';
import { Clock } from 'lucide-react';
import { copyText } from '../lib/utils';
import {
  Button, Field, Input, Panel, Segmented, ToolGrid,
} from '../components/ui/Primitives';
import { CopyRow, Stat, StatRow } from '../components/ui/Display';

/** "1:02:03.5", "2:30" and "90" all parse to seconds. */
function parseTimecode(value) {
  const text = String(value).trim();
  if (!text) return null;

  const parts = text.split(':').map((part) => part.trim());
  if (parts.some((part) => part === '' || Number.isNaN(Number(part)))) return null;

  return parts.reduce((total, part) => total * 60 + Number(part), 0);
}

function formatTimecode(seconds, withMillis = false) {
  const sign = seconds < 0 ? '-' : '';
  const abs = Math.abs(seconds);

  const hours = Math.floor(abs / 3600);
  const minutes = Math.floor((abs % 3600) / 60);
  const secs = Math.floor(abs % 60);
  const millis = Math.round((abs - Math.floor(abs)) * 1000);

  const base = `${sign}${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return withMillis ? `${base}.${String(millis).padStart(3, '0')}` : base;
}

const OPERATIONS = [
  { value: 'add', label: 'A + B' },
  { value: 'subtract', label: 'A − B' },
  { value: 'split', label: 'Split A' },
];

export default function TimestampCalculator() {
  const [operation, setOperation] = useState('add');
  const [a, setA] = useState('12:30');
  const [b, setB] = useState('0:45');
  const [parts, setParts] = useState('6');
  const [fps, setFps] = useState('30');

  const secondsA = parseTimecode(a);
  const secondsB = parseTimecode(b);

  const result = useMemo(() => {
    if (secondsA === null) return null;
    if (operation === 'add') return secondsB === null ? null : secondsA + secondsB;
    if (operation === 'subtract') return secondsB === null ? null : secondsA - secondsB;
    return secondsA;
  }, [operation, secondsA, secondsB]);

  const chapters = useMemo(() => {
    if (operation !== 'split' || secondsA === null) return [];
    const count = Math.max(2, Math.min(30, Number(parts) || 2));
    const step = secondsA / count;

    return Array.from({ length: count }, (_, index) => ({
      time: formatTimecode(index * step).replace(/^0:/, ''),
      label: `Chapter ${index + 1}`,
    }));
  }, [operation, secondsA, parts]);

  const frameRate = Number(fps) || 30;

  return (
    <ToolGrid>
      <Panel title="Timecodes" hint="Accepts h:mm:ss, mm:ss, or plain seconds.">
        <Field label="Operation">
          <Segmented value={operation} onChange={setOperation} options={OPERATIONS} size="sm" label="Operation" />
        </Field>

        <Field label="Timecode A" hint={secondsA === null ? 'unrecognised' : `${secondsA}s`}>
          <Input value={a} onChange={setA} className="mono" placeholder="12:30" />
        </Field>

        {operation !== 'split' ? (
          <Field label="Timecode B" hint={secondsB === null ? 'unrecognised' : `${secondsB}s`}>
            <Input value={b} onChange={setB} className="mono" placeholder="0:45" />
          </Field>
        ) : (
          <Field label="Number of chapters" hint="2–30">
            <Input value={parts} onChange={setParts} type="number" min="2" max="30" />
          </Field>
        )}

        <Field label="Frame rate" hint="for the frame count below">
          <Input value={fps} onChange={setFps} type="number" min="1" max="240" />
        </Field>

        <p className="muted-line">
          Handy for lining up a voiceover with an edit: subtract the intro length from your total
          runtime to get the exact narration budget.
        </p>
      </Panel>

      <Panel title="Result">
        {result === null ? (
          <p className="muted-line center">Enter valid timecodes to see the result.</p>
        ) : (
          <>
            <div className="mono-out">{formatTimecode(result, true)}</div>
            <StatRow>
              <Stat label="Seconds" value={Math.round(result * 1000) / 1000} />
              <Stat label="Minutes" value={(result / 60).toFixed(2)} />
              <Stat label="Frames" value={Math.round(result * frameRate).toLocaleString()} hint={`at ${frameRate} fps`} />
              <Stat label="Words" value={Math.round((result / 60) * 150)} hint="at 150 wpm" />
            </StatRow>

            <CopyRow label="h:mm:ss" value={formatTimecode(result)} />
            <CopyRow label="SRT style" value={`${formatTimecode(result, true).replace('.', ',')}`} />

            {chapters.length > 0 && (
              <>
                <div className="divider" />
                <Field
                  label="Even chapter marks"
                  hint="paste straight into a YouTube description"
                >
                  <div className="result-list">
                    {chapters.map((chapter) => (
                      <div className="list-row" key={chapter.time}>
                        <span className="list-row-index">{chapter.time}</span>
                        <span className="list-row-body">{chapter.label}</span>
                      </div>
                    ))}
                  </div>
                </Field>
                <div className="btn-row end">
                  <Button
                    variant="soft"
                    icon={<Clock size={15} />}
                    onClick={() =>
                      copyText(chapters.map((c) => `${c.time} ${c.label}`).join('\n'), 'Chapters copied')
                    }
                  >
                    Copy chapters
                  </Button>
                </div>
              </>
            )}
          </>
        )}
      </Panel>
    </ToolGrid>
  );
}
