// src/tools/audiofy/custom-inspect.jsx
// The Analyze category: read-only tools that decode a file and report what is
// in it, plus the waveform-image and live-spectrum visualizers.

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Download, Play, Square } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  Alert, Button, Field, Panel, Segmented, Select, ToolGrid,
} from '../../components/ui/Primitives';
import { CheckList, Dropzone, Stat, StatRow } from '../../components/ui/Display';
import { Waveform } from './toolkit';
import { cachedPeaks } from './hooks';
import { formatTime, useAudioContext, useAudioFile } from './hooks';
import { analyzeStereo, detectBPM, detectKey, measureLoudness } from '../../lib/audiofy';
import { downloadBlob, formatBytes } from '../../lib/utils';

/** Shared shell for the four "decode → report" meters. */
function AnalyzeShell({ title, hint, run, render, processHint, extraPanel }) {
  const getContext = useAudioContext();
  const { file, info, buffer, loading, error, load, reset } = useAudioFile(getContext);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [runError, setRunError] = useState('');

  const analyze = () => {
    setBusy(true);
    setRunError('');
    try {
      setResult(run(buffer));
    } catch (caught) {
      setRunError(caught.message || 'Analysis failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ToolGrid>
      <div className="stack">
        <Panel title="Source audio" hint="Read locally — the file never leaves this tab.">
          <Dropzone file={file} onFile={(picked) => { setResult(null); load(picked); }} accept="audio/*" />

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
                  {formatTime(buffer.duration)} · {(buffer.sampleRate / 1000).toFixed(1)} kHz ·{' '}
                  {info.channels === 1 ? 'Mono' : 'Stereo'} · {formatBytes(info.size)}
                </p>
                <Button variant="ghost" onClick={() => { reset(); setResult(null); }}>
                  Change file
                </Button>
              </div>
            </>
          )}
        </Panel>

        {buffer && (
          <Panel title="Analyse">
            <div className="btn-row">
              <Button onClick={analyze} loading={busy}>
                {processHint || 'Analyse audio'}
              </Button>
            </div>
            {runError && (
              <Alert tone="danger" title="Analysis failed" icon={<AlertTriangle size={16} />}>
                {runError}
              </Alert>
            )}
          </Panel>
        )}

        {extraPanel}
      </div>

      <div className="stack">
        <Panel title={title} hint={hint}>
          {result ? render(result) : <p className="muted-line">Run the analysis to see results here.</p>}
        </Panel>
      </div>
    </ToolGrid>
  );
}

/* ------------------------------------------------------------ BPM ---- */

export function BpmDetector() {
  return (
    <AnalyzeShell
      title="Tempo"
      hint="Energy-peak estimate, folded into the 60–180 BPM range."
      processHint="Detect BPM"
      run={(buffer) => ({ bpm: detectBPM(buffer) })}
      render={({ bpm }) => (
        <>
          <StatRow>
            <Stat label="Detected tempo" value={bpm ? `${bpm} BPM` : '—'} tone={bpm ? 'good' : 'warn'} />
            <Stat label="Half / double" value={bpm ? `${Math.round(bpm / 2)} / ${bpm * 2}` : '—'} />
          </StatRow>
          <Alert tone={bpm ? 'info' : 'warning'}>
            {bpm
              ? 'Estimates land on the beat grid of steady music. For live recordings, tap along with BPM Tapper instead.'
              : 'No steady beat found — the file may be too short, too quiet, or rhythmically free.'}
          </Alert>
        </>
      )}
    />
  );
}

/* ------------------------------------------------------------ Key ---- */

const CHROMA_LABELS = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

export function KeyDetector() {
  return (
    <AnalyzeShell
      title="Musical key"
      hint="Chromagram over a Hann-windowed FFT."
      processHint="Detect key"
      run={(buffer) => detectKey(buffer)}
      render={(result) => (
        <>
          <StatRow>
            <Stat label="Detected key" value={result.full} tone="good" />
            <Stat
              label="Confidence"
              value={`${Math.round((result.confidence || 0) * 100)}%`}
              hint="share of chroma energy on the tonic"
            />
          </StatRow>

          <div className="audiofy-chroma" role="img" aria-label={`Pitch class energy, strongest at ${result.note}`}>
            {result.chroma.map((value, index) => (
              <span key={CHROMA_LABELS[index]} className="audiofy-chroma-col">
                <span className="audiofy-chroma-bar" style={{ height: `${Math.max(value * 100, 2)}%` }} />
                <small>{CHROMA_LABELS[index]}</small>
              </span>
            ))}
          </div>
        </>
      )}
    />
  );
}

/* -------------------------------------------------------- Loudness ---- */

const db = (value) => `${value > -Infinity ? value.toFixed(1) : '−∞'} dB`;

export function LoudnessMeter() {
  return (
    <AnalyzeShell
      title="Loudness"
      hint="Peak, estimated true peak, RMS and an LUFS-style integrated figure."
      processHint="Measure loudness"
      run={(buffer) => measureLoudness(buffer)}
      render={(result) => (
        <>
          <StatRow>
            <Stat label="Sample peak" value={db(result.peak)} />
            <Stat label="True peak (est.)" value={db(result.truePeak)} />
            <Stat label="RMS" value={db(result.rms)} />
          </StatRow>
          <StatRow>
            <Stat label="LUFS (approx.)" value={result.lufs.toFixed(1)} hint="streaming target ≈ −14" />
            <Stat label="Headroom" value={`${result.headroom.toFixed(1)} dB`} />
          </StatRow>
          <Alert tone={result.truePeak > -0.5 ? 'warning' : 'info'}>
            {result.truePeak > -0.5
              ? 'True peak is at or above −0.5 dBFS — masters this hot can clip after lossy encoding.'
              : 'Levels look sane for lossy encoding and streaming.'}
          </Alert>
        </>
      )}
    />
  );
}

/* -------------------------------------------------------- Mix check ---- */

export function MixChecker() {
  return (
    <AnalyzeShell
      title="Stereo check"
      hint="Channel correlation, width and phase health."
      processHint="Check the mix"
      run={(buffer) => analyzeStereo(buffer)}
      render={(result) => {
        if (!result.stereo) {
          return (
            <Alert tone="warning" title="Mono file">
              {result.message}
            </Alert>
          );
        }

        return (
          <>
            <StatRow>
              <Stat
                label="Correlation"
                value={result.correlation.toFixed(2)}
                tone={result.correlation > 0.2 ? 'good' : 'warn'}
                hint="1 = mono, 0 = wide, −1 = inverted"
              />
              <Stat label="Stereo width" value={`${Math.round(result.width)}%`} />
              <Stat label="Phase issues" value={`${result.phaseIssuePercent.toFixed(1)}%`} />
            </StatRow>

            <CheckList
              checks={[
                { label: 'Mono-compatible (correlation above 0.2)', passed: result.monoCompatible },
                { label: 'Phase is healthy (under 10% out-of-phase)', passed: result.phaseIssuePercent < 10 },
                { label: 'Correlation is positive', passed: result.correlation > 0 },
              ]}
            />
          </>
        );
      }}
    />
  );
}

/* ---------------------------------------------------- Waveform image ---- */

const WAVE_STYLES = [
  { value: 'bars', label: 'Bars' },
  { value: 'mirror', label: 'Mirror' },
  { value: 'line', label: 'Line' },
];

const WAVE_COLORS = {
  violet: { value: 'violet', label: 'Violet', from: '#7c5cff', to: '#b48cff' },
  cyan: { value: 'cyan', label: 'Cyan', from: '#06b6d4', to: '#67e8f9' },
  rose: { value: 'rose', label: 'Rose', from: '#f43f5e', to: '#fda4af' },
  emerald: { value: 'emerald', label: 'Emerald', from: '#10b981', to: '#6ee7b7' },
};

/** Renders the waveform into a canvas image, downloadable as PNG. */
export function WaveformImage() {
  const getContext = useAudioContext();
  const { file, info, buffer, loading, error, load } = useAudioFile(getContext);
  const [style, setStyle] = useState('mirror');
  const [colorKey, setColorKey] = useState('violet');
  const [height, setHeight] = useState(320);
  const canvasRef = useRef(null);

  const peaks = buffer ? cachedPeaks(buffer) : null;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks) return;
    const context = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    context.scale(dpr, dpr);

    const mid = height / 2;
    const gradient = context.createLinearGradient(0, 0, width, height);
    const color = WAVE_COLORS[colorKey];
    gradient.addColorStop(0, color.from);
    gradient.addColorStop(1, color.to);
    context.fillStyle = gradient;
    context.strokeStyle = gradient;
    context.lineWidth = 2;
    context.lineJoin = 'round';

    const barWidth = width / peaks.length;

    if (style === 'line') {
      context.beginPath();
      peaks.forEach((value, index) => {
        const x = index * barWidth + barWidth / 2;
        const y = mid - value * height * 0.46;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.stroke();
    } else {
      peaks.forEach((value, index) => {
        const barHeight = Math.max(value * height * 0.92, 2);
        const x = index * barWidth;
        if (style === 'bars') {
          context.fillRect(x, mid - barHeight / 2, Math.max(barWidth * 0.7, 1), barHeight);
        } else {
          context.fillRect(x, mid - barHeight, Math.max(barWidth * 0.72, 1), barHeight);
        }
      });
    }
  }, [peaks, style, colorKey, height]);

  useEffect(() => {
    draw();
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => draw());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [draw]);

  const downloadPng = () => {
    canvasRef.current?.toBlob((blob) => {
      if (!blob) return;
      const base = (file?.name || 'waveform').replace(/\.[^.]+$/, '');
      downloadBlob(`${base}-waveform.png`, blob);
      toast.success('Image saved');
    }, 'image/png');
  };

  return (
    <ToolGrid>
      <div className="stack">
        <Panel title="Source audio" hint="The image is rendered in this tab.">
          <Dropzone file={file} onFile={load} accept="audio/*" />
          {loading && <p className="muted-line">Decoding…</p>}
          {error && (
            <Alert tone="danger" title="That did not work" icon={<AlertTriangle size={16} />}>
              {error}
            </Alert>
          )}
          {buffer && (
            <p className="muted-line">
              {formatTime(buffer.duration)} · {(buffer.sampleRate / 1000).toFixed(1)} kHz · {formatBytes(info.size)}
            </p>
          )}
        </Panel>

        {buffer && (
          <Panel title="Image settings">
            <Field label="Style">
              <Segmented size="sm" value={style} onChange={setStyle} options={WAVE_STYLES} />
            </Field>
            <Field label="Colour">
              <Select
                value={colorKey}
                onChange={setColorKey}
                options={Object.values(WAVE_COLORS).map(({ value, label }) => ({ value, label }))}
              />
            </Field>
            <Field label="Height" htmlFor="audiofy-wave-height">
              <div className="range-row">
                <input
                  id="audiofy-wave-height"
                  type="range"
                  min="160"
                  max="640"
                  step="40"
                  value={height}
                  aria-valuetext={`${height} pixels`}
                  onChange={(event) => setHeight(Number(event.target.value))}
                />
                <span className="range-value">{height} px</span>
              </div>
            </Field>

            <div className="btn-row">
              <Button onClick={downloadPng} icon={<Download size={15} />}>
                Download PNG
              </Button>
            </div>
          </Panel>
        )}
      </div>

      <div className="stack">
        <Panel title="Preview">
          {buffer ? (
            <div className="audiofy-image-frame">
              <canvas ref={canvasRef} style={{ width: '100%', height }} aria-label={`Waveform image of ${file?.name}`} role="img" />
            </div>
          ) : (
            <p className="muted-line">Load audio to render its waveform.</p>
          )}
        </Panel>
      </div>
    </ToolGrid>
  );
}

/* --------------------------------------------------------- Spectrum ---- */

/**
 * Live FFT visualizer. The <audio> element is wired through a
 * MediaElementSource → analyser → destination chain, which is created once per
 * source URL (a second createMediaElementSource on the same element throws).
 */
export function Spectrum() {
  const getContext = useAudioContext();
  const { file, info, buffer, loading, error, load, reset } = useAudioFile(getContext);
  const [playing, setPlaying] = useState(false);
  const [mode, setMode] = useState('bars');
  const [sourceUrl, setSourceUrl] = useState('');

  const audioRef = useRef(null);
  const canvasRef = useRef(null);
  const analyserRef = useRef(null);
  const urlRef = useRef('');

  useEffect(() => () => {
    analyserRef.current = null;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  const drawSpectrum = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    const context = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const { width, height: boxHeight } = canvas.getBoundingClientRect();
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(boxHeight * dpr);
    context.scale(dpr, dpr);

    const bins = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(bins);
    // Log-ish sampling over the audible range: linear bins cram everything
    // interesting into the first few pixels.
    const bars = 64;
    const barWidth = width / bars;
    context.clearRect(0, 0, width, boxHeight);

    const style = getComputedStyle(canvas);
    const fg = style.getPropertyValue('--tool-fg').trim() || '#7c5cff';

    for (let i = 0; i < bars; i += 1) {
      const from = Math.floor((i / bars) ** 2 * bins.length);
      const to = Math.max(from + 1, Math.floor(((i + 1) / bars) ** 2 * bins.length));
      let sum = 0;
      for (let j = from; j < to; j += 1) sum += bins[j];
      const value = sum / (to - from) / 255;
      const barHeight = Math.max(value * boxHeight, 2);

      context.fillStyle = fg;
      if (mode === 'wave') {
        context.fillRect(i * barWidth, boxHeight - barHeight, Math.max(barWidth * 0.72, 1), barHeight);
      } else {
        context.fillRect(i * barWidth, (boxHeight - barHeight) / 2, Math.max(barWidth * 0.72, 1), barHeight);
      }
    }
  }, [mode]);

  // While playing, redraw every frame. The loop is owned by the effect so the
  // draw callback stays a pure one-frame function with no self-scheduling.
  useEffect(() => {
    if (!playing) return undefined;

    let frame;
    const loop = () => {
      drawSpectrum();
      frame = requestAnimationFrame(loop);
    };
    loop();

    return () => cancelAnimationFrame(frame);
  }, [playing, drawSpectrum]);

  const wireAnalyser = () => {
    if (analyserRef.current) return;
    const context = getContext();
    const source = context.createMediaElementSource(audioRef.current);
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    analyser.connect(context.destination);
    analyserRef.current = analyser;
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (playing) {
      audio.pause();
      setPlaying(false);
      return;
    }

    try {
      wireAnalyser();
      getContext().resume?.();
      audio.play();
      setPlaying(true);
    } catch {
      toast.error('Playback failed — try another file.');
    }
  };

  return (
    <ToolGrid>
      <div className="stack">
        <Panel title="Source audio" hint="Plays locally through an FFT — nothing is uploaded.">
          <Dropzone
            file={file}
            onFile={(picked) => {
              reset();
              setPlaying(false);
              analyserRef.current = null;
              if (urlRef.current) URL.revokeObjectURL(urlRef.current);
              urlRef.current = URL.createObjectURL(picked);
              setSourceUrl(urlRef.current);
              load(picked);
            }}
            accept="audio/*"
          />

          {loading && <p className="muted-line">Decoding…</p>}
          {error && (
            <Alert tone="danger" title="That did not work" icon={<AlertTriangle size={16} />}>
              {error}
            </Alert>
          )}

          {buffer && (
            <div className="between-row">
              <p className="muted-line">
                {formatTime(buffer.duration)} · {(buffer.sampleRate / 1000).toFixed(1)} kHz · {formatBytes(info.size)}
              </p>
              <Button
                variant="ghost"
                onClick={() => {
                  reset();
                  setPlaying(false);
                  analyserRef.current = null;
                  if (urlRef.current) URL.revokeObjectURL(urlRef.current);
                  urlRef.current = '';
                  setSourceUrl('');
                }}
              >
                Change file
              </Button>
            </div>
          )}
        </Panel>

        {buffer && (
          <Panel title="Display">
            <Field label="Style">
              <Segmented
                size="sm"
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'bars', label: 'Centered bars' },
                  { value: 'wave', label: 'Rising bars' },
                ]}
              />
            </Field>
            <div className="btn-row">
              <Button onClick={togglePlay} icon={playing ? <Square size={15} /> : <Play size={15} />}>
                {playing ? 'Stop' : 'Play & visualize'}
              </Button>
            </div>
          </Panel>
        )}
      </div>

      <div className="stack">
        <Panel title="Spectrum" hint="Press play to see the live frequency content.">
          {buffer ? (
            <>
              <div className="audiofy-image-frame">
                <canvas
                  ref={canvasRef}
                  style={{ width: '100%', height: 260 }}
                  aria-label="Live frequency spectrum"
                  role="img"
                />
              </div>
              {/* key resets the element per file: createMediaElementSource binds
                  one element once, so a new file needs a new element. */}
              <audio
                key={sourceUrl}
                ref={audioRef}
                src={sourceUrl}
                onEnded={() => setPlaying(false)}
                hidden
              />
            </>
          ) : (
            <p className="muted-line">Load audio, then press play.</p>
          )}
        </Panel>
      </div>
    </ToolGrid>
  );
}
