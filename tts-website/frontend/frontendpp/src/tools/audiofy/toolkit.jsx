// src/tools/audiofy/toolkit.jsx
// ---------------------------------------------------------------------------
// The shared visual machinery every Audiofy sub-tool is assembled from: the
// waveform canvas, the result/preview panel, the parameter controls and
// BufferTool — the load → adjust → process → download scaffold the parametric
// tools are pure configuration over.
//
// Hooks, constants and formatting live in toolkit.js so this file exports only
// components, which is what fast refresh requires.
//
// Everything here is client-side on purpose: the suite's promise is that files
// never leave the tab, which is also why none of it touches lib/api.js.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  Alert, Button, EmptyState, Field, Input, Meter, Panel, Segmented, Select, Switch, ToolGrid,
} from '../../components/ui/Primitives';
import { Dropzone, Stat, StatRow } from '../../components/ui/Display';
import { bufferToWav } from '../../lib/audio';
import { clamp, cx, downloadBlob, formatBytes } from '../../lib/utils';
import { cachedPeaks, defaultParams, formatTime, useAudioContext, useAudioFile } from './hooks';

/* ----------------------------------------------------------- Waveform ---- */

function canvasColor(canvas, token) {
  const value = getComputedStyle(canvas).getPropertyValue(token).trim();
  return value || '#8b7cc9';
}

/**
 * Waveform canvas with an optional selected range, playhead and region markers.
 *
 * The canvas is decorative: tools pair it with numeric time fields, which is
 * what makes selection accessible — dragging pixels is not.
 */
export function Waveform({
  buffer,
  peaks: peaksProp,
  height = 96,
  selection,
  onSelectionChange,
  onSeek,
  playhead,
  markers,
  className,
}) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const dragRef = useRef(null);
  const duration = buffer?.duration ?? 0;

  const peaks = useMemo(() => peaksProp || (buffer ? cachedPeaks(buffer) : null), [buffer, peaksProp]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const { width, height: boxHeight } = canvas.getBoundingClientRect();
    if (!width || !boxHeight) return;

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(boxHeight * dpr);
    context.scale(dpr, dpr);

    const mid = boxHeight / 2;
    const fg = canvasColor(canvas, '--tool-fg');
    context.clearRect(0, 0, width, boxHeight);

    if (peaks) {
      context.fillStyle = fg;
      const barWidth = width / peaks.length;
      peaks.forEach((value, index) => {
        const barHeight = Math.max(value * boxHeight * 0.86, 1);
        context.fillRect(index * barWidth, mid - barHeight / 2, Math.max(barWidth * 0.72, 0.5), barHeight);
      });
    }

    // Region markers (e.g. detected silence), drawn under the selection tint.
    if (markers?.length && duration) {
      context.fillStyle = 'oklch(0% 0 0 / 0.18)';
      markers.forEach(({ start, end }) => {
        const x = (start / duration) * width;
        context.fillRect(x, 0, Math.max(((end - start) / duration) * width, 1), boxHeight);
      });
    }

    if (selection && duration) {
      const x0 = (selection.start / duration) * width;
      const x1 = (selection.end / duration) * width;
      context.fillStyle = 'oklch(0% 0 0 / 0.28)';
      context.fillRect(0, 0, x0, boxHeight);
      context.fillRect(x1, 0, width - x1, boxHeight);
      context.fillStyle = fg;
      context.fillRect(x0 - 1, 0, 2, boxHeight);
      context.fillRect(x1 - 1, 0, 2, boxHeight);
    }

    if (playhead != null && duration) {
      context.fillStyle = canvasColor(canvas, '--text');
      context.fillRect((playhead / duration) * width - 1, 0, 2, boxHeight);
    }

    context.fillStyle = 'oklch(50% 0 0 / 0.25)';
    context.fillRect(0, mid - 0.5, width, 1);
  }, [peaks, selection, playhead, markers, duration]);

  useEffect(() => {
    draw();
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === 'undefined') return undefined;

    const observer = new ResizeObserver(() => draw());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [draw]);

  const timeFromEvent = (event) => {
    const box = wrapRef.current.getBoundingClientRect();
    return clamp(((event.clientX - box.left) / box.width) * duration, 0, duration);
  };

  const handlePointerDown = (event) => {
    if (!onSelectionChange || !duration) return;
    dragRef.current = { start: timeFromEvent(event), moved: false };
    wrapRef.current.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag) return;
    const time = timeFromEvent(event);
    if (Math.abs(time - drag.start) > duration * 0.002) drag.moved = true;
    onSelectionChange({ start: Math.min(drag.start, time), end: Math.max(drag.start, time) });
  };

  const handlePointerUp = (event) => {
    const drag = dragRef.current;
    dragRef.current = null;
    wrapRef.current?.releasePointerCapture?.(event.pointerId);
    // A click rather than a drag clears the selection and seeks — the two
    // things a click on a waveform reasonably means.
    if (drag && !drag.moved) {
      onSelectionChange(null);
      onSeek?.(timeFromEvent(event));
    }
  };

  return (
    <div
      ref={wrapRef}
      className={cx('audiofy-wave', onSelectionChange && 'audiofy-wave-select', className)}
      style={{ height }}
      onPointerDown={onSelectionChange ? handlePointerDown : undefined}
      onPointerMove={onSelectionChange ? handlePointerMove : undefined}
      onPointerUp={onSelectionChange ? handlePointerUp : undefined}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="audiofy-wave-canvas" />
    </div>
  );
}

/* -------------------------------------------------------- Result panel ---- */

/**
 * Preview + download panel mirroring the AudioStudio result column: one
 * <audio> keyed by URL (Safari keeps the old duration when only src swaps),
 * optional stats, an info note, and a polite live region for status text.
 */
export function ResultPanel({
  url, title = 'Preview', hint, actions, stats, note, status,
  empty = 'Nothing processed yet', emptyHint,
}) {
  return (
    <Panel title={title} hint={hint} actions={actions}>
      {url ? (
        <div className="audio-player-wrap">
          <audio key={url} src={url} controls preload="metadata" />
        </div>
      ) : (
        <EmptyState icon={<Download size={20} aria-hidden="true" />} title={empty}>
          {emptyHint}
        </EmptyState>
      )}

      {stats?.length > 0 && (
        <StatRow>
          {stats.map((stat) => (
            <Stat key={stat.label} label={stat.label} value={stat.value} tone={stat.tone} hint={stat.hint} />
          ))}
        </StatRow>
      )}

      {note && <Alert tone="info">{note}</Alert>}

      <p className="muted-line" role="status" aria-live="polite">
        {status}
      </p>
    </Panel>
  );
}

/* ---------------------------------------------------------- BufferTool ---- */

function ParamControl({ param, value, onChange }) {
  if (param.kind === 'switch') {
    return (
      <Switch checked={!!value} onChange={onChange} label={param.label} hint={param.hint} />
    );
  }

  if (param.kind === 'select') {
    return (
      <Field label={param.label} hint={param.hint}>
        <Select value={value} onChange={onChange} options={param.options} />
      </Field>
    );
  }

  if (param.kind === 'segmented') {
    return (
      <Field label={param.label} hint={param.hint}>
        <Segmented size="sm" value={value} onChange={onChange} options={param.options} />
      </Field>
    );
  }

  if (param.kind === 'number') {
    return (
      <Field label={param.label} hint={param.hint}>
        <Input
          type="number"
          inputMode="decimal"
          min={param.min}
          max={param.max}
          step={param.step}
          value={value}
          onChange={onChange}
        />
      </Field>
    );
  }

  // kind === 'range' — the default.
  return <RangeParam param={param} value={value} onChange={onChange} />;
}

/**
 * Range with a per-tool formatted read-out ("−12 dB", "1.50×"). The formatted
 * string also goes to aria-valuetext, so assistive tech announces the unit the
 * display shows rather than a bare number.
 */
function RangeParam({ param, value, onChange }) {
  const id = useId();
  const numeric = Number(value) || param.defaultValue || param.min || 0;
  const display = param.format ? param.format(numeric) : `${numeric}${param.suffix ?? ''}`;

  return (
    <Field label={param.label} hint={param.hint} htmlFor={id}>
      <div className="range-row">
        <input
          id={id}
          type="range"
          min={param.min}
          max={param.max}
          step={param.step ?? 1}
          value={numeric}
          aria-valuetext={display}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <span className="range-value">{display}</span>
      </div>
    </Field>
  );
}

/**
 * The generic Audiofy tool: file in, parameters, one processing step, WAV out.
 *
 * `definition` shape:
 *   accept        file input filter (default 'audio/*')
 *   fileNoun      copy for the dropzone label
 *   fileHint      format hint under the dropzone
 *   waveform      show the source waveform once loaded
 *   params        [{ key, label, kind, ... }]
 *   settingsTitle panel heading (default 'Settings')
 *   processHint   copy for the action button
 *   bitDepth      WAV bit depth for the export (16 default)
 *   filename      (params) → file name without extension
 *   run           async ({ buffer, params, file, info, createBuffer })
 *                   → { buffer, stats?, note?, suffix?, status?, toast? }
 *                     or { blob, filename, stats?, note? } for custom encodings
 */
export function BufferTool({ definition }) {
  const getContext = useAudioContext();
  const { file, info, buffer, loading, error, load, reset } = useAudioFile(getContext);
  const [params, setParams] = useState(() => defaultParams(definition.params));
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [runError, setRunError] = useState('');
  const [status, setStatus] = useState('');
  const urlRef = useRef('');

  useEffect(() => () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  const setParam = (key, value) => setParams((current) => ({ ...current, [key]: value }));
  // Batch form for presets: patch({ threshold: -30, reduction: 0.9 }).
  const patchParams = (partial) => setParams((current) => ({ ...current, ...partial }));

  const process = async () => {
    if (!buffer) return;
    setBusy(true);
    setRunError('');
    setProgress(0);

    try {
      const outcome = await definition.run({
        buffer,
        params,
        file,
        info,
        createBuffer: (channels, length, sampleRate) =>
          getContext().createBuffer(channels, length, sampleRate),
        onProgress: setProgress,
      });

      let blob;
      let filename;
      const base = (file?.name || 'audio').replace(/\.[^.]+$/, '');

      if (outcome.blob) {
        blob = outcome.blob;
        filename = outcome.filename;
      } else {
        blob = new Blob([bufferToWav(outcome.buffer, outcome.bitDepth ?? definition.bitDepth ?? 16)], {
          type: 'audio/wav',
        });
        filename = `${base}${definition.filename?.(params) || outcome.suffix || '-audiofy'}.wav`;
      }

      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = URL.createObjectURL(blob);
      setResult({
        url: urlRef.current,
        blob,
        filename,
        stats: outcome.stats,
        note: outcome.note,
      });
      setStatus(outcome.status ?? 'Done — listen below, then download.');
      toast.success(outcome.toast ?? 'Processed');
    } catch (caught) {
      setRunError(caught.message || 'Processing failed. Try different settings or a shorter file.');
      setStatus('');
    } finally {
      setBusy(false);
      setProgress(0);
    }
  };

  const download = () => {
    if (!result?.blob) return;
    downloadBlob(result.filename || 'audiofy.wav', result.blob);
    setStatus(`Saved ${result.filename}.`);
  };

  const changeFile = () => {
    reset();
    setResult(null);
    setRunError('');
    setStatus('');
  };

  const fileMeta = info
    ? `${formatTime(info.duration)} · ${info.sampleRate.toLocaleString()} Hz · ${
      info.channels === 1 ? 'Mono' : info.channels === 2 ? 'Stereo' : `${info.channels} ch`
    } · ${formatBytes(info.size)}`
    : '';

  return (
    <ToolGrid>
      <div className="stack">
        <Panel
          title="Source audio"
          hint="Decoding and processing happen in this tab — the file is never uploaded."
        >
          <Dropzone
            file={file}
            onFile={load}
            accept={definition.accept || 'audio/*'}
            label={`Choose ${definition.fileNoun || 'an audio file'}`}
            hint={definition.fileHint || 'MP3, WAV, M4A, OGG, FLAC · up to 100 MB'}
          />

          {loading && <p className="muted-line">Decoding…</p>}

          {error && (
            <Alert tone="danger" title="That did not work" icon={<AlertTriangle size={16} />}>
              {error}
            </Alert>
          )}

          {buffer && definition.waveform && <Waveform buffer={buffer} height={80} />}

          {buffer && (
            <div className="between-row">
              <p className="muted-line">{fileMeta}</p>
              <Button variant="ghost" size="sm" onClick={changeFile}>
                Change file
              </Button>
            </div>
          )}
        </Panel>

        {buffer && (definition.params?.length || definition.extraControls) && (
          <Panel title={definition.settingsTitle || 'Settings'}>
            {definition.extraControls?.(params, patchParams, { buffer, info })}
            {definition.params?.map((param) => (
              <ParamControl
                key={param.key}
                param={param}
                value={params[param.key]}
                onChange={(value) => setParam(param.key, value)}
              />
            ))}

            <div className="btn-row">
              <Button onClick={process} loading={busy}>
                {definition.processHint || 'Process audio'}
              </Button>
              <Button
                variant="ghost"
                onClick={() => setParams(defaultParams(definition.params))}
                disabled={busy}
              >
                Reset settings
              </Button>
            </div>

            {runError && (
              <Alert tone="danger" title="Processing failed" icon={<AlertTriangle size={16} />}>
                {runError}
              </Alert>
            )}

            {busy && progress > 0 && <Meter value={progress} label="Processing audio" />}
          </Panel>
        )}
      </div>

      <div className="stack">
        <ResultPanel
          url={result?.url}
          hint={buffer ? 'Play the result, then download it.' : undefined}
          actions={result && (
            <Button variant="ghost" onClick={download} icon={<Download size={16} />}>
              Download
            </Button>
          )}
          stats={result?.stats}
          note={result?.note}
          status={status}
          emptyHint="Load a file on the left, adjust the settings, then process."
        />
      </div>
    </ToolGrid>
  );
}

/**
 * A row of preset buttons that patch several params at once. These are actions,
 * not a stateful control, so they are plain buttons rather than a Segmented —
 * nothing stays "selected" after the click.
 */
export function PresetRow({ label, presets, onPick }) {
  return (
    <Field label={label}>
      <div className="btn-row">
        {Object.keys(presets).map((name) => (
          <Button key={name} variant="soft" className="ui-btn-sm" onClick={() => onPick(presets[name])}>
            {name}
          </Button>
        ))}
      </div>
    </Field>
  );
}

/* ----------------------------------------------------------- ToolFrame ---- */

/**
 * Header for one open sub-tool inside the suite: back link, icon, name and the
 * privacy line. `data-accent` re-grades the tool tokens per category, the same
 * mechanism the app's top-level pages use.
 */
export function ToolFrame({ tool, accent, onBack }) {
  const Icon = tool.icon;

  return (
    <div data-accent={accent}>
      <div className="audiofy-tool-head">
        <button type="button" className="back-link" onClick={onBack}>
          <ArrowLeft size={15} aria-hidden="true" /> All suite tools
        </button>

        <div className="tool-head-main">
          <span className="tool-head-icon" aria-hidden="true">
            <Icon size={22} />
          </span>
          <div className="tool-head-text">
            <h2>{tool.name}</h2>
            <p>{tool.description}</p>
          </div>
          <span className="audiofy-privacy" title="This tool runs entirely in your browser">
            No upload
          </span>
        </div>
      </div>
    </div>
  );
}
