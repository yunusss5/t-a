// src/tools/audiofy/custom-studio.jsx
// Tools that create audio rather than transform it: microphone recording, the
// test-tone generator and the tap-tempo counter.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Download, Mic, Play, Square, StopCircle, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  Alert, Button, Field, Panel, Segmented, ToolGrid,
} from '../../components/ui/Primitives';
import { Dropzone, Stat, StatRow } from '../../components/ui/Display';
import { ResultPanel } from './toolkit';
import { formatTime, useAudioContext, useAudioFile } from './hooks';

import { detectBPM, generateTone } from '../../lib/audiofy';
import { bufferToWav } from '../../lib/audio';
import { downloadBlob, formatBytes } from '../../lib/utils';

/* ------------------------------------------------------------ Recorder ---- */

const MIME_CANDIDATES = [
  { mime: 'audio/webm;codecs=opus', ext: 'webm' },
  { mime: 'audio/webm', ext: 'webm' },
  { mime: 'audio/mp4', ext: 'm4a' },
  { mime: 'audio/ogg;codecs=opus', ext: 'ogg' },
];

function pickRecorderMime() {
  if (typeof MediaRecorder === 'undefined') return null;
  return MIME_CANDIDATES.find((candidate) => MediaRecorder.isTypeSupported(candidate.mime)) || null;
}

/**
 * Microphone recorder shared by Audio Recorder and Voice Recorder. Takes are
 * kept as blobs with the browser's own container (webm/opus nearly everywhere,
 * m4a on Safari) — transcoding them in-tab would mean re-encoding in real time
 * for no gain at this size.
 */
export function Recorder({ title = 'Recorder', singleTake = false }) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');
  const [takes, setTakes] = useState([]);
  const [status, setStatus] = useState('');

  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(0);
  // Environment-derived and constant for the session: state so the render can
  // read it, unlike a ref.
  const [mime] = useState(pickRecorderMime);
  // The recorder's onstop closure reads elapsed time; an effect keeps the ref
  // current without re-binding the recorder on every tick.
  const secondsRef = useRef(0);
  useEffect(() => {
    secondsRef.current = seconds;
  }, [seconds]);

  const stopEverything = useCallback(() => {
    window.clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setRecording(false);
  }, []);

  // Leaving the tool stops the mic: a stream left running after unmount keeps
  // the tab's recording indicator (and the microphone) live.
  useEffect(() => stopEverything, [stopEverything]);

  const start = async () => {
    setError('');

    if (!mime) {
      setError('This browser does not support MediaRecorder audio recording.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      chunksRef.current = [];

      const recorder = new MediaRecorder(stream, { mimeType: mime.mime });
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mime.mime });
        const url = URL.createObjectURL(blob);
        setTakes((current) => [
          {
            id: Date.now(),
            url,
            blob,
            ext: mime.ext,
            duration: secondsRef.current,
            index: current.length + 1,
          },
          ...current.slice(0, singleTake ? 0 : 8),
        ]);
        setStatus('Take saved below.');
      };

      recorder.start(500);
      recorderRef.current = recorder;
      setSeconds(0);
      setRecording(true);
      timerRef.current = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    } catch (caught) {
      setError(
        caught.name === 'NotAllowedError'
          ? 'Microphone access was declined. Allow it in the browser’s site settings and try again.'
          : caught.name === 'NotFoundError'
            ? 'No microphone was found on this device.'
            : 'Could not start recording. Check that no other app is holding the microphone.',
      );
    }
  };

  const stop = () => {
    recorderRef.current?.stop();
    stopEverything();
  };

  const removeTake = (id) => {
    setTakes((current) => {
      const target = current.find((take) => take.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return current.filter((take) => take.id !== id);
    });
  };

  const saveTake = (take) => {
    const stamp = new Date(take.id).toISOString().slice(11, 19).replaceAll(':', '');
    downloadBlob(`recording-${stamp}.${take.ext}`, take.blob);
    setStatus(`Saved recording-${stamp}.${take.ext}.`);
  };

  return (
    <ToolGrid>
      <div className="stack">
        <Panel
          title={title}
          hint={mime ? `Captures as ${mime.ext} in this tab.` : undefined}
        >
          {error && (
            <Alert tone="danger" title="Microphone problem" icon={<AlertTriangle size={16} />}>
              {error}
            </Alert>
          )}

          <div className="audiofy-rec-center">
            <button
              type="button"
              className={recording ? 'audiofy-rec-btn recording' : 'audiofy-rec-btn'}
              onClick={recording ? stop : start}
              aria-label={recording ? 'Stop recording' : 'Start recording'}
            >
              {recording ? <Square size={30} /> : <Mic size={30} />}
            </button>
            <p className="audiofy-rec-timer" role="timer" aria-live="off">
              {String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}
            </p>
            <p className="muted-line">
              {recording ? 'Recording… press stop when done.' : 'Press the mic to record from your microphone.'}
            </p>
          </div>
        </Panel>
      </div>

      <div className="stack">
        <Panel title="Takes" hint={singleTake ? 'The latest take is kept.' : 'Up to nine takes are kept while you are here.'}>
          {takes.length === 0 ? (
            <p className="muted-line">Nothing recorded yet.</p>
          ) : (
            <ul className="audiofy-list">
              {takes.map((take) => (
                <li key={take.id} className="audiofy-list-item">
                  <span className="audiofy-list-order">{take.index}</span>
                  <span className="audiofy-list-main">
                    <audio src={take.url} controls preload="metadata" />
                    <small>
                      {formatTime(take.duration)} · {take.ext.toUpperCase()} · {formatBytes(take.blob.size)}
                    </small>
                  </span>
                  <span className="audiofy-list-actions">
                    <button type="button" className="icon-btn" onClick={() => saveTake(take)} aria-label="Download take">
                      <Download size={15} />
                    </button>
                    <button type="button" className="icon-btn" onClick={() => removeTake(take.id)} aria-label="Delete take">
                      <Trash2 size={15} />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <p className="muted-line" role="status" aria-live="polite">{status}</p>
        </Panel>
      </div>
    </ToolGrid>
  );
}

export function AudioRecorder() {
  return <Recorder title="Audio Recorder" />;
}

export function VoiceRecorder() {
  return <Recorder title="Voice Recorder" singleTake />;
}

/* -------------------------------------------------------- Tone generator ---- */

const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const FREQ_MIN = 20;
const FREQ_MAX = 20000;

const sliderToFreq = (slider) => Math.round(FREQ_MIN * (FREQ_MAX / FREQ_MIN) ** (slider / 1000));
const freqToSlider = (freq) => Math.round((1000 * Math.log(freq / FREQ_MIN)) / Math.log(FREQ_MAX / FREQ_MIN));
const freqToNote = (freq) => {
  const midi = Math.round(12 * Math.log2(freq / 440) + 69);
  if (midi < 0 || midi > 127) return null;
  return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
};

const TONE_PRESETS = [
  { label: 'A4 · 440', freq: 440 },
  { label: 'A2 · 110', freq: 110 },
  { label: '1 kHz', freq: 1000 },
  { label: '60 Hz', freq: 60 },
  { label: '10 kHz', freq: 10000 },
];

export function ToneGenerator() {
  const getContext = useAudioContext();
  const [freq, setFreq] = useState(440);
  const [waveform, setWaveform] = useState('sine');
  const [volume, setVolume] = useState(60);
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState('');

  const nodesRef = useRef(null);

  useEffect(() => () => {
    nodesRef.current?.oscillator.stop();
    nodesRef.current = null;
  }, []);

  useEffect(() => {
    if (nodesRef.current) nodesRef.current.oscillator.frequency.value = freq;
  }, [freq]);

  const toggle = () => {
    if (playing) {
      nodesRef.current?.oscillator.stop();
      nodesRef.current = null;
      setPlaying(false);
      return;
    }

    const context = getContext();
    context.resume?.();

    const oscillator = context.createOscillator();
    oscillator.type = waveform;
    oscillator.frequency.value = freq;
    const gain = context.createGain();
    // 20 ms ramps instead of a hard start/stop: the click is audible at any volume.
    gain.gain.setValueAtTime(0, context.currentTime);
    gain.gain.linearRampToValueAtTime(volume / 100, context.currentTime + 0.02);
    oscillator.connect(gain).connect(context.destination);
    oscillator.onended = () => {
      nodesRef.current = null;
      setPlaying(false);
    };
    oscillator.start();

    nodesRef.current = { oscillator, gain };
    setPlaying(true);
  };

  const note = freqToNote(freq);

  const downloadTone = () => {
    const context = getContext();
    const buffer = generateTone({
      durationSec: 5,
      frequency: freq,
      waveform,
      amplitude: volume / 100,
      sampleRate: 44100,
      channels: 1,
    }, (channels, length, sampleRate) => context.createBuffer(channels, length, sampleRate));

    downloadBlob(`tone-${freq}hz-${waveform}.wav`, new Blob([bufferToWav(buffer)], { type: 'audio/wav' }));
    setStatus(`Saved 5 seconds of ${waveform} at ${freq} Hz.`);
    toast.success('Tone exported');
  };

  return (
    <ToolGrid>
      <div className="stack">
        <Panel title="Tone" hint="Plays from an oscillator in this tab.">
          <Field label="Frequency" htmlFor="audiofy-tone-freq">
            <div className="range-row">
              <input
                id="audiofy-tone-freq"
                type="range"
                min="0"
                max="1000"
                value={freqToSlider(freq)}
                aria-valuetext={`${freq} Hz${note ? `, nearest note ${note}` : ''}`}
                onChange={(event) => setFreq(sliderToFreq(Number(event.target.value)))}
              />
              <span className="range-value">{freq.toLocaleString()} Hz</span>
            </div>
          </Field>

          <Field label="Waveform">
            <Segmented
              size="sm"
              value={waveform}
              onChange={setWaveform}
              options={[
                { value: 'sine', label: 'Sine' },
                { value: 'square', label: 'Square' },
                { value: 'sawtooth', label: 'Saw' },
                { value: 'triangle', label: 'Triangle' },
              ]}
            />
          </Field>

          <Field label="Volume" htmlFor="audiofy-tone-volume">
            <div className="range-row">
              <input
                id="audiofy-tone-volume"
                type="range"
                min="0"
                max="100"
                value={volume}
                aria-valuetext={`${volume}%`}
                onChange={(event) => {
                  setVolume(Number(event.target.value));
                  if (nodesRef.current) nodesRef.current.gain.gain.value = Number(event.target.value) / 100;
                }}
              />
              <span className="range-value">{volume}%</span>
            </div>
          </Field>

          <Field label="Presets">
            <div className="btn-row">
              {TONE_PRESETS.map((preset) => (
                <Button key={preset.freq} variant="soft" className="ui-btn-sm" onClick={() => setFreq(preset.freq)}>
                  {preset.label}
                </Button>
              ))}
            </div>
          </Field>

          <div className="btn-row">
            <Button onClick={toggle} icon={playing ? <Square size={15} /> : <Play size={15} />}>
              {playing ? 'Stop tone' : 'Play tone'}
            </Button>
            <Button variant="ghost" onClick={downloadTone}>
              Download 5s WAV
            </Button>
          </div>

          {volume > 50 && (
            <Alert tone="warning" title="Careful at this volume">
              Square and saw waves carry a lot of energy — protect your ears, especially on headphones.
            </Alert>
          )}
        </Panel>
      </div>

      <div className="stack">
        <ResultPanel
          title="Details"
          status={status}
          empty="Adjust the tone, then press play"
          emptyHint="Nothing to preview until a tone is exported."
          stats={[
            { label: 'Frequency', value: `${freq.toLocaleString()} Hz` },
            { label: 'Nearest note', value: note || '—' },
            { label: 'Waveform', value: waveform },
          ]}
        />
      </div>
    </ToolGrid>
  );
}

/* ------------------------------------------------------------ BPM tapper ---- */

const MAX_TAPS = 16;

/** Tap-tempo plus an auto mode that runs the energy-peak detector on a file. */
export function BpmTapper() {
  const [mode, setMode] = useState('tap');
  const [taps, setTaps] = useState([]);

  const getContext = useAudioContext();
  const { file, buffer, loading, error, load, reset } = useAudioFile(getContext);
  const [autoBpm, setAutoBpm] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);

  const tap = () => {
    const now = performance.now();
    setTaps((current) => [...current.slice(-(MAX_TAPS - 1)), now]);
  };

  useEffect(() => {
    const onKey = (event) => {
      if (event.code === 'Space' && mode === 'tap' && event.target === document.body) {
        event.preventDefault();
        tap();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mode]);

  const stats = useMemo(() => {
    const intervals = taps.slice(1).map((time, index) => time - taps[index]);
    if (intervals.length < 1) return null;

    const bpms = intervals.map((interval) => 60000 / interval);
    const average = bpms.reduce((sum, bpm) => sum + bpm, 0) / bpms.length;
    return {
      bpm: Math.round(average),
      min: Math.round(Math.min(...bpms)),
      max: Math.round(Math.max(...bpms)),
      taps: taps.length,
    };
  }, [taps]);

  const detect = () => {
    setAnalyzing(true);
    try {
      setAutoBpm(detectBPM(buffer));
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <ToolGrid>
      <div className="stack">
        <Panel title="Mode">
          <Segmented
            value={mode}
            onChange={(next) => { setMode(next); setTaps([]); }}
            options={[
              { value: 'tap', label: 'Tap tempo' },
              { value: 'auto', label: 'From a file' },
            ]}
          />

          {mode === 'tap' ? (
            <div className="audiofy-rec-center">
              <button
                type="button"
                className="audiofy-rec-btn tap"
                onClick={tap}
                aria-label="Tap to the beat"
              >
                <StopCircle size={30} />
              </button>
              <p className="muted-line">Tap along with the music (space bar works too). {MAX_TAPS} taps are averaged.</p>
              {taps.length > 0 && (
                <Button variant="ghost" onClick={() => setTaps([])}>Reset taps</Button>
              )}
            </div>
          ) : (
            <>
              <Dropzone file={file} onFile={(picked) => { reset(); setAutoBpm(null); load(picked); }} accept="audio/*" />
              {loading && <p className="muted-line">Decoding…</p>}
              {error && (
                <Alert tone="danger" title="That did not work" icon={<AlertTriangle size={16} />}>
                  {error}
                </Alert>
              )}
              {buffer && (
                <div className="btn-row">
                  <Button onClick={detect} loading={analyzing}>Detect BPM</Button>
                  <Button variant="ghost" onClick={() => { reset(); setAutoBpm(null); }}>Change file</Button>
                </div>
              )}
            </>
          )}
        </Panel>
      </div>

      <div className="stack">
        <Panel title="Tempo">
          {mode === 'tap' ? (
            stats ? (
              <>
                <StatRow>
                  <Stat label="Average" value={`${stats.bpm} BPM`} tone="good" />
                  <Stat label="Fastest tap" value={`${stats.max} BPM`} />
                  <Stat label="Slowest tap" value={`${stats.min} BPM`} />
                </StatRow>
                <p className="muted-line">{stats.taps} taps · {MAX_TAPS} kept for the average.</p>
                {stats.max - stats.min > 15 && (
                  <Alert tone="warning" title="Taps are uneven">
                    The spread between fastest and slowest is over 15 BPM — keep tapping for a steadier average.
                  </Alert>
                )}
              </>
            ) : (
              <p className="muted-line">Tap at least twice to see a tempo.</p>
            )
          ) : autoBpm != null ? (
            <StatRow>
              <Stat label="Detected tempo" value={autoBpm ? `${autoBpm} BPM` : '—'} tone={autoBpm ? 'good' : 'warn'} />
              <Stat
                label="Half / double"
                value={autoBpm ? `${Math.round(autoBpm / 2)} / ${autoBpm * 2}` : '—'}
              />
            </StatRow>
          ) : (
            <p className="muted-line">{buffer ? 'Run the detection to see the result.' : 'Load a file to detect its tempo.'}</p>
          )}
        </Panel>
      </div>
    </ToolGrid>
  );
}
