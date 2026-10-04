// src/tools/audiofy/custom-selection.jsx
// The tools built around selecting a span of the waveform: Audio Trimmer,
// Audio Cropper and Ringtone Maker. One shared component carries the whole
// load → select → (fade) → export flow; the definitions decide the copy and
// whether the fade controls appear.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Download, Play, RotateCcw, Square } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  Alert, Button, Field, Input, Meter, Panel, Switch, ToolGrid,
} from '../../components/ui/Primitives';
import { Dropzone } from '../../components/ui/Display';
import { ResultPanel, Waveform } from './toolkit';
import { formatTime, useAudioContext, useAudioFile } from './hooks';

import { fadeBuffer, trimBuffer } from '../../lib/audiofy';
import { bufferToWav } from '../../lib/audio';
import { clamp, downloadBlob, formatBytes } from '../../lib/utils';

/**
 * Shared selection workflow.
 *
 * `definition` shape:
 *   processHint   action button copy
 *   suffix        exported file name fragment ("-trimmed")
 *   fades         show fade in/out controls (Ringtone Maker)
 *   limitSec      warn when the selection outlives this (ringtone carriers)
 *   resultNote    info note attached to the result
 *   stats         (buffer, selection) → stat row
 */
export function SelectionTool({ definition }) {
  const getContext = useAudioContext();
  const { file, info, buffer, loading, error, load, reset } = useAudioFile(getContext);

  const [selection, setSelection] = useState(null);
  const [fades, setFades] = useState({ fadeInSec: 0.5, fadeOutSec: 0.5, enabled: true });
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [runError, setRunError] = useState('');
  const [status, setStatus] = useState('');
  const [playing, setPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(null);

  const audioRef = useRef(null);
  const rafRef = useRef(0);
  const resultUrlRef = useRef('');
  // The playback tick reads the current selection every frame; an effect keeps
  // the ref in step rather than touching refs during render.
  const selectionRef = useRef(null);
  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  const duration = buffer?.duration ?? 0;
  // No selection yet means "the whole file" — the sensible default everywhere.
  // Memoised so it can sit in hook dependency lists without churning them.
  const effective = useMemo(() => selection ?? { start: 0, end: duration }, [selection, duration]);

  // Object URLs and animation frames outlive renders; every path here releases
  // what it opens, including the unmount path.
  useEffect(() => {
    if (!file) return undefined;
    const url = URL.createObjectURL(file);
    const audio = audioRef.current;
    if (audio) audio.src = url;

    return () => {
      URL.revokeObjectURL(url);
      if (audio) audio.removeAttribute('src');
    };
  }, [file]);

  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current);
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
  }, []);

  const stopPlayback = useCallback(() => {
    audioRef.current?.pause();
    setPlaying(false);
    cancelAnimationFrame(rafRef.current);
  }, []);

  const seekTo = useCallback((time) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = time;
    setPlayhead(time);
  }, []);

  const playSelection = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !duration) return;

    if (playing) {
      stopPlayback();
      return;
    }

    const { start, end } = effective;
    if (audio.currentTime < start || audio.currentTime >= end) {
      audio.currentTime = start;
    }
    audio.play();
    setPlaying(true);

    const tick = () => {
      const current = audioRef.current;
      if (!current) return;
      setPlayhead(current.currentTime);
      const limit = selectionRef.current?.end ?? duration;
      if (current.currentTime >= limit) {
        current.pause();
        setPlaying(false);
        setPlayhead(start);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [duration, effective, playing, stopPlayback]);

  const applyPreset = (start, end) => {
    setSelection({ start: clamp(start, 0, duration), end: clamp(end ?? duration, 0, duration) });
    setStatus('Selection updated.');
  };

  const process = async () => {
    if (!buffer) return;
    setBusy(true);
    setRunError('');

    try {
      const trimmed = trimBuffer(buffer, effective.start, effective.end, (channels, length, sampleRate) =>
        getContext().createBuffer(channels, length, sampleRate));
      const final = definition.fades && fades.enabled
        ? fadeBuffer(trimmed, { fadeInSec: fades.fadeInSec, fadeOutSec: fades.fadeOutSec }, (channels, length, sampleRate) =>
          getContext().createBuffer(channels, length, sampleRate))
        : trimmed;

      const base = (file?.name || 'audio').replace(/\.[^.]+$/, '');
      const blob = new Blob([bufferToWav(final)], { type: 'audio/wav' });

      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
      resultUrlRef.current = URL.createObjectURL(blob);

      setResult({
        url: resultUrlRef.current,
        blob,
        filename: `${base}${definition.suffix || '-selection'}.wav`,
        duration: final.duration,
      });
      setStatus(`Ready — ${formatTime(final.duration)} selected.`);
      toast.success('Rendered');
    } catch (caught) {
      setRunError(caught.message || 'Processing failed.');
    } finally {
      setBusy(false);
    }
  };

  const startOver = () => {
    stopPlayback();
    reset();
    setSelection(null);
    setResult(null);
    setRunError('');
    setStatus('');
    setPlayhead(null);
  };

  const tooLong = definition.limitSec && effective.end - effective.start > definition.limitSec;
  const estimatedSize = useMemo(() => {
    if (!buffer) return 0;
    return 44 + (effective.end - effective.start) * buffer.sampleRate * buffer.numberOfChannels * 2;
  }, [buffer, effective]);

  const selectionValid = effective.end - effective.start > 0.05;

  return (
    <ToolGrid>
      <div className="stack">
        <Panel
          title="Source audio"
          hint="Selection, playback and export all happen in this tab."
        >
          <Dropzone
            file={file}
            onFile={load}
            accept="audio/*"
            hint="MP3, WAV, M4A, OGG, FLAC · up to 100 MB"
          />

          {loading && <p className="muted-line">Decoding…</p>}

          {error && (
            <Alert tone="danger" title="That did not work" icon={<AlertTriangle size={16} />}>
              {error}
            </Alert>
          )}

          {buffer && (
            <>
              <Waveform
                buffer={buffer}
                selection={effective}
                onSelectionChange={(next) => {
                  stopPlayback();
                  setSelection(next);
                }}
                onSeek={seekTo}
                playhead={playhead}
              />

              <div className="audiofy-times">
                <Field label="Start" htmlFor="audiofy-sel-start">
                  <Input
                    id="audiofy-sel-start"
                    type="number"
                    min="0"
                    max={duration}
                    step="0.01"
                    value={effective.start.toFixed(2)}
                    onChange={(value) => {
                      const start = clamp(Number(value) || 0, 0, effective.end - 0.05);
                      setSelection({ start, end: effective.end });
                    }}
                  />
                </Field>
                <Field label="End" htmlFor="audiofy-sel-end">
                  <Input
                    id="audiofy-sel-end"
                    type="number"
                    min="0"
                    max={duration}
                    step="0.01"
                    value={effective.end.toFixed(2)}
                    onChange={(value) => {
                      const end = clamp(Number(value) || 0, effective.start + 0.05, duration);
                      setSelection({ start: effective.start, end });
                    }}
                  />
                </Field>
                <Field label="Length" htmlFor="audiofy-sel-length">
                  <Input id="audiofy-sel-length" readOnly value={formatTime(effective.end - effective.start)} />
                </Field>
              </div>

              <div className="btn-row">
                <Button variant="soft" onClick={() => applyPreset(0, 30)}>First 30s</Button>
                <Button variant="soft" onClick={() => applyPreset(0, 60)}>First 1m</Button>
                <Button variant="soft" onClick={() => applyPreset(30, duration)}>Skip 30s</Button>
                <Button variant="soft" onClick={() => setSelection(null)}>Full range</Button>
              </div>

              <div className="between-row">
                <p className="muted-line">
                  {formatTime(duration)} · {info.sampleRate.toLocaleString()} Hz ·{' '}
                  {info.channels === 1 ? 'Mono' : 'Stereo'} · {formatBytes(info.size)}
                </p>
                <Button variant="ghost" onClick={startOver}>Change file</Button>
              </div>
            </>
          )}
        </Panel>

        {buffer && (
          <Panel title="Playback & export">
            <div className="audiofy-transport">
              <Button
                onClick={playSelection}
                icon={playing ? <Square size={15} /> : <Play size={15} />}
                disabled={!selectionValid}
              >
                {playing ? 'Stop' : 'Preview selection'}
              </Button>
            </div>

            {definition.fades && (
              <>
                <Switch
                  checked={fades.enabled}
                  onChange={(enabled) => setFades((current) => ({ ...current, enabled }))}
                  label="Add fade in / fade out"
                  hint="0.5 s each side, so ringtones do not click"
                />
                {fades.enabled && (
                  <div className="audiofy-times">
                    <Field label="Fade in" htmlFor="audiofy-fade-in">
                      <Input
                        id="audiofy-fade-in"
                        type="number"
                        min="0"
                        max="5"
                        step="0.1"
                        value={fades.fadeInSec}
                        onChange={(value) => setFades((current) => ({ ...current, fadeInSec: clamp(Number(value) || 0, 0, 5) }))}
                      />
                    </Field>
                    <Field label="Fade out" htmlFor="audiofy-fade-out">
                      <Input
                        id="audiofy-fade-out"
                        type="number"
                        min="0"
                        max="5"
                        step="0.1"
                        value={fades.fadeOutSec}
                        onChange={(value) => setFades((current) => ({ ...current, fadeOutSec: clamp(Number(value) || 0, 0, 5) }))}
                      />
                    </Field>
                  </div>
                )}
              </>
            )}

            {tooLong && (
              <Alert tone="warning" title={`Longer than ${definition.limitSec}s`}>
                Many phones ignore ringtones past ~40 seconds. Trim tighter to stay safe.
              </Alert>
            )}

            <div className="btn-row">
              <Button onClick={process} loading={busy} icon={<Download size={15} />} disabled={!selectionValid}>
                {definition.processHint || 'Export selection'}
              </Button>
              <Button variant="ghost" onClick={() => setResult(null)} icon={<RotateCcw size={15} />} disabled={busy || !result}>
                Clear result
              </Button>
            </div>

            {busy && <Meter value={100} label="Rendering" />}
            {runError && (
              <Alert tone="danger" title="Processing failed" icon={<AlertTriangle size={16} />}>
                {runError}
              </Alert>
            )}
          </Panel>
        )}
      </div>

      <div className="stack">
        <ResultPanel
          url={result?.url}
          hint={buffer ? 'Listen to the export, then save it.' : undefined}
          actions={result && (
            <Button variant="ghost" onClick={() => downloadBlob(result.filename, result.blob)} icon={<Download size={16} />}>
              Download
            </Button>
          )}
          stats={result ? [
            { label: 'Length', value: formatTime(result.duration) },
            { label: 'Format', value: 'WAV 16-bit' },
            { label: 'Est. size', value: formatBytes(estimatedSize) },
          ] : undefined}
          note={result ? definition.resultNote : undefined}
          status={status}
          empty="No selection exported yet"
          emptyHint="Load a file, drag a range on the waveform, then export."
        />
      </div>
    </ToolGrid>
  );
}

/** id → component bindings for the selection-based tools. */
export function AudioTrimmer() {
  return <SelectionTool definition={TRIMMER} />;
}

export function AudioCropper() {
  return <SelectionTool definition={CROPPER} />;
}

export function RingtoneMaker() {
  return <SelectionTool definition={RINGTONE} />;
}

const TRIMMER = {
  processHint: 'Export selection',
  suffix: '-trimmed',
};

const CROPPER = {
  processHint: 'Crop to selection',
  suffix: '-cropped',
};

const RINGTONE = {
  processHint: 'Render ringtone',
  suffix: '-ringtone',
  fades: true,
  limitSec: 40,
  resultNote: 'Phones want .m4r (iPhone) or .ogg/.mp3 (Android) ringtones. Export here as WAV, then convert with your phone’s tool — the timing and fades are already right.',
};
