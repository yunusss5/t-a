// src/tools/SubtitleStudio.jsx
// Convert between SRT / VTT / TXT / CSV and fix out-of-sync timings. Plain text
// in gets auto-cued from a words-per-minute setting.

import { useState } from 'react';
import toast from 'react-hot-toast';
import { Download, FileType2, Wand2 } from 'lucide-react';
import { postForm } from '../lib/api';
import { copyText, downloadText, formatDuration } from '../lib/utils';
import {
  Button, ErrorNote, Field, Input, Panel, Segmented, TextArea, ToolGrid,
} from '../components/ui/Primitives';
import { Dropzone, EmptyState, Stat, StatRow } from '../components/ui/Display';

const TARGETS = [
  { value: 'srt', label: 'SRT' },
  { value: 'vtt', label: 'WebVTT' },
  { value: 'txt', label: 'Plain text' },
  { value: 'csv', label: 'CSV' },
];

const MIME = {
  srt: 'application/x-subrip',
  vtt: 'text/vtt',
  txt: 'text/plain;charset=utf-8',
  csv: 'text/csv;charset=utf-8',
};

export default function SubtitleStudio() {
  const [content, setContent] = useState('');
  const [file, setFile] = useState(null);
  const [target, setTarget] = useState('vtt');
  const [offset, setOffset] = useState('0');
  const [scale, setScale] = useState('1');
  const [wordsPerCue, setWordsPerCue] = useState('9');
  const [wpm, setWpm] = useState('150');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  const convert = async () => {
    setError('');
    setLoading(true);

    try {
      const result = await postForm('/api/subtitles/convert', {
        ...(file ? { file } : { content }),
        target,
        offset: offset || '0',
        scale: scale || '1',
        words_per_cue: wordsPerCue || '9',
        words_per_minute: wpm || '150',
      });

      setData(result);
      toast.success(
        result.generated_from_plain_text
          ? `Auto-cued into ${result.cue_count} subtitles`
          : `${result.cue_count} cues converted to ${result.format.toUpperCase()}`,
      );
    } catch (err) {
      setError(err.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ToolGrid>
      <div className="stack">
        <Panel title="Input" hint="Upload a file, or paste subtitles — or even a plain script.">
          <Dropzone file={file} onFile={setFile} accept=".srt,.vtt,.txt" hint="SRT, VTT or TXT" />
          {file && (
            <Button variant="ghost" onClick={() => setFile(null)}>
              Remove file and paste instead
            </Button>
          )}
          {!file && (
            <Field label="Or paste here">
              <TextArea
                value={content}
                onChange={setContent}
                rows={12}
                className="mono"
                placeholder={'1\n00:00:01,000 --> 00:00:04,000\nFirst caption line'}
              />
            </Field>
          )}
        </Panel>

        <Panel title="Options">
          <Field label="Convert to">
            <Segmented value={target} onChange={setTarget} options={TARGETS} size="sm" label="Convert to" />
          </Field>

          <div className="field-row">
            <Field label="Offset (seconds)" hint="+ delays, − advances">
              <Input value={offset} onChange={setOffset} type="number" step="0.1" />
            </Field>
            <Field label="Speed scale" hint="1.001 fixes drift">
              <Input value={scale} onChange={setScale} type="number" step="0.001" />
            </Field>
          </div>

          <div className="divider" />
          <p className="muted-line">Used only when the input is a plain script with no timings:</p>

          <div className="field-row">
            <Field label="Words per cue">
              <Input value={wordsPerCue} onChange={setWordsPerCue} type="number" min="3" max="20" />
            </Field>
            <Field label="Words per minute">
              <Input value={wpm} onChange={setWpm} type="number" min="60" max="300" />
            </Field>
          </div>

          <div className="btn-row">
            <Button
              icon={<Wand2 size={16} />}
              loading={loading}
              disabled={!file && !content.trim()}
              onClick={convert}
            >
              Convert
            </Button>
          </div>

          <ErrorNote>{error}</ErrorNote>
        </Panel>
      </div>

      <div className="stack">
        {!data ? (
          <Panel>
            <EmptyState icon={<FileType2 size={26} />} title="Output appears here">
              Fix a subtitle file that runs early or late, switch formats for a different player, or
              turn a bare script into ready-to-upload captions.
            </EmptyState>
          </Panel>
        ) : (
          <>
            <Panel
              title={`${data.format.toUpperCase()} output`}
              hint={data.generated_from_plain_text ? 'Auto-cued from plain text' : 'Converted from your cues'}
              actions={
                <>
                  <Button variant="ghost" onClick={() => copyText(data.output, 'Subtitles copied')}>
                    Copy
                  </Button>
                  <Button
                    variant="ghost"
                    icon={<Download size={15} />}
                    onClick={() => downloadText(data.filename, data.output, MIME[data.format])}
                  >
                    Download
                  </Button>
                </>
              }
            >
              <StatRow>
                <Stat label="Cues" value={data.cue_count} />
                <Stat label="Ends at" value={formatDuration(data.duration)} />
                <Stat label="Format" value={data.format.toUpperCase()} />
              </StatRow>
              <pre className="code-block">{data.output}</pre>
            </Panel>

            <Panel title="First cues" hint="Check the timings landed where you expect.">
              <div className="table-wrap">
                <table className="ui-table">
                  <thead>
                    <tr>
                      <th>Start</th>
                      <th>End</th>
                      <th>Text</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.preview.map((cue, index) => (
                      <tr key={index}>
                        <td>{formatDuration(cue.start)}</td>
                        <td>{formatDuration(cue.end)}</td>
                        <td>{cue.text}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </>
        )}
      </div>
    </ToolGrid>
  );
}
