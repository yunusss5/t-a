// src/tools/AudioStudio.jsx
// Change how long a piece of audio runs without changing its pitch.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, AudioLines, Download, RotateCcw, Wand2 } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  Alert,
  Button,
  EmptyState,
  Field,
  Input,
  Meter,
  Panel,
  Segmented,
  ToolGrid,
} from '../components/ui/Primitives';
import { Dropzone, Stat, StatRow } from '../components/ui/Display';
import { bufferToWav, timeStretch } from '../lib/audio';
import { downloadBlob, clamp, formatDuration } from '../lib/utils';

// Decoding turns the file into 32-bit floats per channel — roughly 10 MB per
// stereo minute — so the cap is about memory, not about upload size.
const MAX_BYTES = 30 * 1024 * 1024;

// Outside this range WSOLA starts to sound obviously processed; the tool still
// allows it, but it says so.
const CLEAN_RANGE = [0.5, 2];
const PRESETS = [0.5, 0.75, 1, 1.5, 2, 3];

const round1 = (value) => Math.round(value * 10) / 10;

// mm:ss hides the difference between 1.5 s and 2 s, which is exactly the
// difference this tool exists to control, so short lengths stay in seconds.
const showLength = (seconds) => (seconds < 60 ? `${round1(seconds)}s` : formatDuration(seconds));

export default function AudioStudio() {
  const [file, setFile] = useState(null);
  const [duration, setDuration] = useState(0);
  const [target, setTarget] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState('');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const contextRef = useRef(null);
  const decodedRef = useRef(null);
  const sourceUrlRef = useRef('');
  const cancelledRef = useRef(false);

  /** Created on demand: constructing an AudioContext eagerly wakes the audio
      hardware on a page the visitor may never use. */
  const audioContext = () => {
    if (!contextRef.current) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      contextRef.current = new Ctor();
    }
    return contextRef.current;
  };

  const swapPreview = useCallback((url) => {
    setPreviewUrl((current) => {
      if (current && current !== sourceUrlRef.current) URL.revokeObjectURL(current);
      return url;
    });
  }, []);

  // Blob URLs and an AudioContext both survive unmount unless released, and
  // this component is a lazily-loaded route that gets mounted repeatedly.
  useEffect(
    () => () => {
      cancelledRef.current = true;
      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
      contextRef.current?.close();
    },
    [],
  );

  const loadFile = useCallback(
    async (candidate) => {
      if (!candidate) return;

      if (candidate.size > MAX_BYTES) {
        setError(`That file is ${Math.round(candidate.size / 1024 / 1024)} MB. The limit is 30 MB.`);
        return;
      }

      setError('');
      setStatus('Decoding…');
      setBusy('load');
      decodedRef.current = null;
      setResult(null);

      try {
        const bytes = await candidate.arrayBuffer();
        // decodeAudioData detaches the buffer it is given, so the copy is what
        // lets the same file be re-processed at another speed later.
        const decoded = await audioContext().decodeAudioData(bytes.slice(0));

        decodedRef.current = decoded;
        setFile(candidate);
        setDuration(decoded.duration);
        setTarget(String(round1(decoded.duration)));

        if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
        sourceUrlRef.current = URL.createObjectURL(candidate);
        swapPreview(sourceUrlRef.current);
        setStatus(`Loaded ${showLength(decoded.duration)} of audio.`);
      } catch {
        setError('That file could not be decoded. Try an MP3, WAV, M4A or OGG file.');
        setStatus('');
      } finally {
        setBusy('');
      }
    },
    [swapPreview],
  );

  const seconds = Number(target);
  const usableTarget = Number.isFinite(seconds) && seconds >= 1;
  // Ratio of old length to new: 2 means play twice as fast, so half as long.
  const speed = useMemo(
    () => (duration && usableTarget ? clamp(duration / seconds, 0.1, 10) : 1),
    [duration, seconds, usableTarget],
  );
  const rough = speed < CLEAN_RANGE[0] || speed > CLEAN_RANGE[1];
  const activePreset = PRESETS.find((preset) => Math.abs(preset - speed) < 0.005) ?? '';

  const apply = async () => {
    const buffer = decodedRef.current;
    if (!buffer) return;

    cancelledRef.current = false;
    setError('');
    setBusy('apply');
    setProgress(0);
    setStatus('Stretching audio…');

    try {
      const context = audioContext();
      const stretched = await timeStretch({
        buffer,
        speed,
        createBuffer: (channels, length, rate) => context.createBuffer(channels, length, rate),
        onProgress: setProgress,
        isCancelled: () => cancelledRef.current,
      });

      if (!stretched) return; // unmounted mid-run
      const blob = new Blob([bufferToWav(stretched)], { type: 'audio/wav' });
      setResult(blob);
      swapPreview(URL.createObjectURL(blob));
      setStatus(`Rendered ${showLength(stretched.duration)} at ${speed.toFixed(2)}× speed.`);
      toast.success('Audio length updated');
    } catch {
      setError('Processing failed. Try a shorter file, or a speed closer to 1×.');
      setStatus('');
    } finally {
      setBusy('');
      setProgress(0);
    }
  };

  const download = () => {
    if (!result) return;
    const base = (file?.name || 'audio').replace(/\.[^.]+$/, '');
    downloadBlob(`${base}-${speed.toFixed(2)}x.wav`, result);
  };

  const reset = () => {
    setResult(null);
    setTarget(String(round1(duration)));
    swapPreview(sourceUrlRef.current);
    setStatus('Back to the original file.');
  };

  const newLength = usableTarget ? showLength(duration / speed) : '—';

  return (
    <ToolGrid>
      <div className="stack">
        <Panel
          title="Source audio"
          hint="Decoding and stretching both happen in this tab — the file is never uploaded."
        >
          <Dropzone
            file={file}
            onFile={loadFile}
            accept="audio/*"
            label="Choose an audio file"
            hint="MP3, WAV, M4A or OGG · up to 30 MB"
            icon={<AudioLines size={26} />}
          />

          {error && (
            <Alert tone="danger" title="That did not work" icon={<AlertTriangle size={16} />}>
              {error}
            </Alert>
          )}

          {busy === 'load' && <Meter value={100} label="Decoding audio" />}
        </Panel>

        {duration > 0 && (
          <Panel title="Length" hint="Set a length, or pick a speed and let the length follow.">
            <Field label="Target length in seconds" htmlFor="target-length">
              <Input
                id="target-length"
                type="number"
                min="1"
                step="0.1"
                inputMode="decimal"
                value={target}
                onChange={setTarget}
              />
            </Field>

            <Field label="Speed presets">
              <Segmented
                label="Speed presets"
                size="sm"
                value={activePreset}
                onChange={(preset) => setTarget(String(round1(duration / preset)))}
                options={PRESETS.map((preset) => ({ value: preset, label: `${preset}×` }))}
              />
            </Field>

            <StatRow>
              <Stat label="Original" value={showLength(duration)} />
              <Stat label="New length" value={newLength} />
              <Stat label="Speed" value={`${speed.toFixed(2)}×`} tone={rough ? 'warn' : undefined} />
            </StatRow>

            {!usableTarget && (
              <Alert tone="warning" title="Enter a length of at least one second">
                Anything shorter has too few samples left to stretch.
              </Alert>
            )}

            {usableTarget && rough && (
              <Alert tone="warning" title="Beyond the clean range">
                Past 2× either way the stretching becomes audible. It still works — it just
                sounds processed.
              </Alert>
            )}

            <div className="btn-row">
              <Button onClick={apply} loading={busy === 'apply'} icon={<Wand2 size={16} />} disabled={!usableTarget}>
                Apply length
              </Button>
              <Button variant="ghost" onClick={reset} icon={<RotateCcw size={16} />} disabled={!!busy}>
                Reset
              </Button>
            </div>

            {busy === 'apply' && <Meter value={progress} label="Stretching audio" />}
          </Panel>
        )}
      </div>

      <div className="stack">
        <Panel
          title="Preview"
          hint={file ? 'Play the result, then download it as a WAV.' : undefined}
          actions={
            result && (
              <Button variant="ghost" onClick={download} icon={<Download size={16} />}>
                Download WAV
              </Button>
            )
          }
        >
          {previewUrl ? (
            <div className="audio-player-wrap">
              {/* keyed on the URL: swapping src alone leaves the old buffered
                  audio and the old duration on the element in Safari. */}
              <audio key={previewUrl} src={previewUrl} controls preload="metadata" />
            </div>
          ) : (
            <EmptyState icon={<AudioLines size={22} />} title="No audio loaded yet">
              Drop a file on the left and its length becomes editable here.
            </EmptyState>
          )}

          {/* One polite region for every state change, so progress and results
              are announced without stealing focus. */}
          <p className="muted-line" role="status" aria-live="polite">
            {status}
          </p>
        </Panel>
      </div>
    </ToolGrid>
  );
}
