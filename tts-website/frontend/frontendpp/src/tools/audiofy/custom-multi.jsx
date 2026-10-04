// src/tools/audiofy/custom-multi.jsx
// Tools that work across several files: Audio Merger and Audio Joiner (join a
// list of clips, with a silence gap or a crossfade between items) and the
// Audio Splitter (one file, many parts).

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, Download, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  Alert, Button, Field, Input, Panel, Segmented, ToolGrid,
} from '../../components/ui/Primitives';
import { Dropzone } from '../../components/ui/Display';
import { ResultPanel, Waveform } from './toolkit';
import { formatTime, useAudioContext, useAudioFile } from './hooks';

import { mergeBuffers, trimBuffer, decodeAudioFile } from '../../lib/audiofy';
import { bufferToWav } from '../../lib/audio';
import { downloadBlob, formatBytes, formatDuration } from '../../lib/utils';

/* ------------------------------------------------ Merger / Joiner ---- */

const MAX_INPUTS = 12;

/**
 * Shared multi-file join. `definition.gapSec` present adds the silence-gap
 * control (Merger); without it the tool is crossfade-only (Joiner).
 */
export function MultiJoinTool({ definition }) {
  const getContext = useAudioContext();
  const [items, setItems] = useState([]);
  const [decoding, setDecoding] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [params, setParams] = useState({ gapSec: 0, crossfadeSec: definition.crossfadeDefault ?? 0 });
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [runError, setRunError] = useState('');
  const [status, setStatus] = useState('');
  const urlRef = useRef('');

  useEffect(() => () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  const addFiles = async (fileList) => {
    const files = [...fileList].filter((file) => file);
    if (!files.length) return;
    if (items.length + files.length > MAX_INPUTS) {
      toast.error(`Up to ${MAX_INPUTS} files at once`);
      return;
    }

    setDecoding(true);
    setLoadError('');

    try {
      const decoded = await Promise.all(
        files.map(async (file) => {
          const { buffer, info } = await decodeAudioFile(file, getContext());
          return { id: `${file.name}-${Math.random().toString(36).slice(2, 8)}`, file, buffer, info };
        }),
      );
      setItems((current) => [...current, ...decoded]);
      setStatus(`Added ${decoded.length} file${decoded.length === 1 ? '' : 's'}.`);
    } catch (error) {
      setLoadError(error.message);
    } finally {
      setDecoding(false);
    }
  };

  const removeItem = (id) => setItems((current) => current.filter((item) => item.id !== id));

  const move = (index, step) => {
    setItems((current) => {
      const next = [...current];
      const target = index + step;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const process = async () => {
    if (items.length < 2) return;
    setBusy(true);
    setRunError('');

    try {
      const merged = mergeBuffers(
        items.map((item) => item.buffer),
        { gapSec: definition.gapSec ? params.gapSec : 0, crossfadeSec: params.crossfadeSec },
        (channels, length, sampleRate) => getContext().createBuffer(channels, length, sampleRate),
      );

      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const blob = new Blob([bufferToWav(merged)], { type: 'audio/wav' });
      urlRef.current = URL.createObjectURL(blob);

      setResult({ url: urlRef.current, blob, filename: `audiofy-${definition.suffix || 'merged'}.wav` });
      setStatus(`Joined ${items.length} files into ${formatTime(merged.duration)} of audio.`);
      toast.success('Files joined');
    } catch (caught) {
      setRunError(caught.message || 'Merging failed.');
    } finally {
      setBusy(false);
    }
  };

  const totalDuration = items.reduce((sum, item) => sum + item.info.duration, 0);

  return (
    <ToolGrid>
      <div className="stack">
        <Panel
          title="Audio files"
          hint="Files are joined top to bottom. Everything is decoded in this tab."
        >
          <Dropzone
            onFiles={addFiles}
            onFile={(file) => addFiles([file])}
            multiple
            accept="audio/*"
            label="Add audio files"
            hint={`MP3, WAV, M4A, OGG · up to ${MAX_INPUTS} files`}
          />

          {decoding && <p className="muted-line">Decoding…</p>}
          {loadError && (
            <Alert tone="danger" title="That did not work" icon={<AlertTriangle size={16} />}>
              {loadError}
            </Alert>
          )}

          {items.length > 0 && (
            <ul className="audiofy-list">
              {items.map((item, index) => (
                <li key={item.id} className="audiofy-list-item">
                  <span className="audiofy-list-order">{index + 1}</span>
                  <span className="audiofy-list-main">
                    <strong>{item.info.name}</strong>
                    <small>
                      {formatTime(item.info.duration)} · {(item.info.sampleRate / 1000).toFixed(1)} kHz ·{' '}
                      {item.info.channels === 1 ? 'Mono' : 'Stereo'}
                    </small>
                  </span>
                  <span className="audiofy-list-actions">
                    <button type="button" className="icon-btn" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Move ${item.info.name} up`}>
                      <ArrowUp size={14} />
                    </button>
                    <button type="button" className="icon-btn" onClick={() => move(index, 1)} disabled={index === items.length - 1} aria-label={`Move ${item.info.name} down`}>
                      <ArrowDown size={14} />
                    </button>
                    <button type="button" className="icon-btn" onClick={() => removeItem(item.id)} aria-label={`Remove ${item.info.name}`}>
                      <Trash2 size={14} />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          {items.length > 1 && (
            <p className="muted-line">
              {items.length} files · {formatDuration(totalDuration)} of audio before joins
            </p>
          )}
        </Panel>

        {items.length > 1 && (
          <Panel title="Joins">
            {definition.gapSec && (
              <Field label="Silence between files" hint="inserted before each following file">
                <div className="range-row">
                  <input
                    id="audiofy-gap"
                    type="range"
                    min="0"
                    max="3"
                    step="0.1"
                    value={params.gapSec}
                    aria-valuetext={`${params.gapSec.toFixed(1)} seconds`}
                    onChange={(event) => setParams((current) => ({ ...current, gapSec: Number(event.target.value) }))}
                  />
                  <span className="range-value">{params.gapSec.toFixed(1)} s</span>
                </div>
              </Field>
            )}

            <Field label="Crossfade between files" hint="overlapping the joins">
              <div className="range-row">
                <input
                  id="audiofy-crossfade"
                  type="range"
                  min="0"
                  max={definition.crossfadeMax ?? 2}
                  step="0.05"
                  value={params.crossfadeSec}
                  aria-valuetext={`${params.crossfadeSec.toFixed(2)} seconds`}
                  onChange={(event) => setParams((current) => ({ ...current, crossfadeSec: Number(event.target.value) }))}
                />
                <span className="range-value">{params.crossfadeSec.toFixed(2)} s</span>
              </div>
            </Field>

            <div className="btn-row">
              <Button onClick={process} loading={busy} disabled={items.length < 2}>
                {definition.processHint || 'Join files'}
              </Button>
              <Button variant="ghost" onClick={() => { setItems([]); setResult(null); }} disabled={busy}>
                Clear all
              </Button>
            </div>

            {runError && (
              <Alert tone="danger" title="Merging failed" icon={<AlertTriangle size={16} />}>
                {runError}
              </Alert>
            )}
          </Panel>
        )}
      </div>

      <div className="stack">
        <ResultPanel
          url={result?.url}
          hint={items.length > 1 ? 'Play the joined audio, then download it.' : undefined}
          actions={result && (
            <Button variant="ghost" onClick={() => downloadBlob(result.filename, result.blob)} icon={<Download size={16} />}>
              Download
            </Button>
          )}
          status={status}
          empty="Nothing joined yet"
          emptyHint={`Add at least two files on the left, then ${definition.processHint || 'join them'}.`}
        />
      </div>
    </ToolGrid>
  );
}

export function AudioMerger() {
  return <MultiJoinTool definition={MERGER} />;
}

export function AudioJoiner() {
  return <MultiJoinTool definition={JOINER} />;
}

const MERGER = {
  gapSec: true,
  crossfadeDefault: 0,
  crossfadeMax: 2,
  processHint: 'Merge files',
  suffix: 'merged',
};

const JOINER = {
  crossfadeDefault: 1,
  crossfadeMax: 5,
  processHint: 'Join with crossfade',
  suffix: 'joined',
};

/* ------------------------------------------------------------ Splitter ---- */

const MAX_PARTS = 20;

/** Split one file into equal parts by count or by target duration. */
export function AudioSplitter() {
  const getContext = useAudioContext();
  const { file, info, buffer, loading, error, load, reset } = useAudioFile(getContext);

  const [mode, setMode] = useState('count');
  const [count, setCount] = useState(4);
  const [partSec, setPartSec] = useState(30);
  const [parts, setParts] = useState(null);
  const [busy, setBusy] = useState(false);
  const [runError, setRunError] = useState('');
  const [status, setStatus] = useState('');

  const urlRefs = useRef([]);
  useEffect(() => () => urlRefs.current.forEach((url) => URL.revokeObjectURL(url)), []);

  const createBuffer = useCallback(
    (channels, length, sampleRate) => getContext().createBuffer(channels, length, sampleRate),
    [getContext],
  );

  const segmentBounds = () => {
    const duration = buffer.duration;
    const bounds = [];

    if (mode === 'count') {
      const perPart = duration / count;
      for (let i = 0; i < count; i += 1) {
        bounds.push([i * perPart, Math.min((i + 1) * perPart, duration)]);
      }
    } else {
      for (let start = 0; start < duration; start += partSec) {
        bounds.push([start, Math.min(start + partSec, duration)]);
      }
    }
    return bounds.filter(([start, end]) => end - start > 0.05);
  };

  const split = async () => {
    setBusy(true);
    setRunError('');

    try {
      urlRefs.current.forEach((url) => URL.revokeObjectURL(url));
      urlRefs.current = [];

      const bounds = segmentBounds();
      const base = (file?.name || 'audio').replace(/\.[^.]+$/, '');

      const rendered = bounds.map(([start, end], index) => {
        const part = trimBuffer(buffer, start, end, createBuffer);
        const blob = new Blob([bufferToWav(part)], { type: 'audio/wav' });
        const filename = `${base}-part${String(index + 1).padStart(2, '0')}.wav`;
        const url = URL.createObjectURL(blob);
        urlRefs.current.push(url);
        return { start, end, blob, filename, url, duration: end - start };
      });

      setParts(rendered);
      setStatus(`Split into ${rendered.length} parts.`);
      toast.success(`Split into ${rendered.length} parts`);
    } catch (caught) {
      setRunError(caught.message || 'Splitting failed.');
    } finally {
      setBusy(false);
    }
  };

  const downloadAll = () => {
    // Sequential clicks with a small delay — most browsers now ask once for
    // "multiple downloads" instead of blocking the rest silently.
    parts.forEach((part, index) => {
      setTimeout(() => downloadBlob(part.filename, part.blob), index * 350);
    });
    setStatus(`Downloading ${parts.length} files…`);
  };

  const partCount = mode === 'count' ? count : Math.ceil(buffer?.duration / partSec || 0);

  return (
    <ToolGrid>
      <div className="stack">
        <Panel title="Source audio" hint="Splitting happens in this tab — the file is never uploaded.">
          <Dropzone file={file} onFile={load} accept="audio/*" />

          {loading && <p className="muted-line">Decoding…</p>}
          {error && (
            <Alert tone="danger" title="That did not work" icon={<AlertTriangle size={16} />}>
              {error}
            </Alert>
          )}

          {buffer && (
            <>
              <Waveform buffer={buffer} height={80} />
              <div className="between-row">
                <p className="muted-line">
                  {formatTime(buffer.duration)} · {(buffer.sampleRate / 1000).toFixed(1)} kHz · {formatBytes(info.size)}
                </p>
                <Button variant="ghost" onClick={() => { reset(); setParts(null); }}>Change file</Button>
              </div>
            </>
          )}
        </Panel>

        {buffer && (
          <Panel title="Split points">
            <Field label="Split mode">
              <Segmented
                size="sm"
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'count', label: 'Into N parts' },
                  { value: 'duration', label: 'By duration' },
                ]}
              />
            </Field>

            {mode === 'count' ? (
              <Field label="Number of parts" htmlFor="audiofy-split-count">
                <Input
                  id="audiofy-split-count"
                  type="number"
                  min="2"
                  max={MAX_PARTS}
                  value={count}
                  onChange={(value) => setCount(Math.min(MAX_PARTS, Math.max(2, Math.round(Number(value) || 2))))}
                />
              </Field>
            ) : (
              <Field label="Target length per part" htmlFor="audiofy-split-duration">
                <Input
                  id="audiofy-split-duration"
                  type="number"
                  min="1"
                  step="1"
                  value={partSec}
                  onChange={(value) => setPartSec(Math.max(1, Number(value) || 1))}
                />
              </Field>
            )}

            <p className="muted-line">
              {partCount} part{partCount === 1 ? '' : 's'} · ~{formatDuration(buffer.duration / partCount)} each
            </p>

            {partCount > MAX_PARTS && (
              <Alert tone="warning" title={`That is more than ${MAX_PARTS} parts`}>
                Raise the per-part length (or lower the count) to stay under the limit.
              </Alert>
            )}

            <div className="btn-row">
              <Button onClick={split} loading={busy} disabled={partCount < 1 || partCount > MAX_PARTS}>
                Split audio
              </Button>
            </div>

            {runError && (
              <Alert tone="danger" title="Splitting failed" icon={<AlertTriangle size={16} />}>
                {runError}
              </Alert>
            )}
          </Panel>
        )}
      </div>

      <div className="stack">
        <Panel
          title="Parts"
          hint={parts ? 'Each part is its own WAV file.' : undefined}
          actions={parts?.length > 1 && (
            <Button variant="ghost" onClick={downloadAll} icon={<Download size={16} />}>
              Download all
            </Button>
          )}
        >
          {parts ? (
            <ul className="audiofy-list">
              {parts.map((part, index) => (
                <li key={part.filename} className="audiofy-list-item">
                  <span className="audiofy-list-order">{index + 1}</span>
                  <span className="audiofy-list-main">
                    <strong>{part.filename}</strong>
                    <small>
                      {formatTime(part.start)} → {formatTime(part.end)} · {formatDuration(part.duration)}
                    </small>
                  </span>
                  <span className="audiofy-list-actions">
                    <audio src={part.url} controls preload="none" />
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => downloadBlob(part.filename, part.blob)}
                      aria-label={`Download ${part.filename}`}
                    >
                      <Download size={15} />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted-line">
              {buffer
                ? 'Set the split points and press Split audio.'
                : 'Load a file on the left to see its parts here.'}
            </p>
          )}

          <p className="muted-line" role="status" aria-live="polite">{status}</p>
        </Panel>
      </div>
    </ToolGrid>
  );
}
