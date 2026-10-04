// src/tools/audiofy/custom-media.jsx
// The tools that reach past plain audio processing: turning audio into a video
// file, editing MP3 metadata, and the bridge to the site's Text-to-Speech tool
// (which already exists as a first-class page backed by the API — reusing it is
// the point).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, ArrowRight, Download, Music, Video, Wand2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  Alert, Button, Field, Input, Meter, Panel, Segmented, Select, TextArea, ToolGrid,
} from '../../components/ui/Primitives';
import { Dropzone, Stat, StatRow } from '../../components/ui/Display';
import { cachedPeaks } from './hooks';
import { formatTime, useAudioContext, useAudioFile } from './hooks';
import { buildId3v2Tag, stripId3, withId3Tag } from '../../lib/audiofy';
import { downloadBlob, downloadText, formatBytes } from '../../lib/utils';

/* -------------------------------------------------------- Audio → Video ---- */

const VIDEO_STYLES = [
  { value: 'bars', label: 'Bars' },
  { value: 'wave', label: 'Wave line' },
  { value: 'circle', label: 'Pulse circle' },
];

const RESOLUTIONS = [
  { value: '640x360', label: '640 × 360 — small' },
  { value: '1280x720', label: '1280 × 720 — HD' },
];

const VIDEO_MIME =
  typeof MediaRecorder !== 'undefined'
    ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((mime) =>
      MediaRecorder.isTypeSupported(mime))
    : null;

/**
 * Renders an animated canvas over the audio and records both into a WebM in
 * real time — MediaRecorder has no faster-than-live mode, so the export takes
 * as long as the track. The status line keeps that visible.
 */
export function AudioToVideo() {
  const getContext = useAudioContext();
  const { file, info, buffer, loading, error, load, reset } = useAudioFile(getContext);

  const [style, setStyle] = useState('bars');
  const [resolution, setResolution] = useState('1280x720');
  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [result, setResult] = useState(null);
  const [sourceUrl, setSourceUrl] = useState('');

  const audioRef = useRef(null);
  const canvasRef = useRef(null);
  const recorderRef = useRef(null);
  const rafRef = useRef(0);
  const peaksRef = useRef(null);
  const resultUrlRef = useRef('');
  const sourceUrlRef = useRef('');

  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current);
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    audioRef.current?.pause();
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
  }, []);

  // One object URL per file, revoked when the file changes or the tool unmounts.
  useEffect(() => {
    if (!file) return undefined;

    sourceUrlRef.current = URL.createObjectURL(file);
    setSourceUrl(sourceUrlRef.current);

    return () => {
      URL.revokeObjectURL(sourceUrlRef.current);
      sourceUrlRef.current = '';
    };
  }, [file]);

  useEffect(() => {
    if (buffer) peaksRef.current = cachedPeaks(buffer);
  }, [buffer]);

  const [width, height] = useMemo(() => resolution.split('x').map(Number), [resolution]);

  /** One animation frame of the visual, drawn against the audio's clock. */
  const drawFrame = useCallback((audioTime) => {
    const canvas = canvasRef.current;
    const peaks = peaksRef.current;
    if (!canvas || !peaks) return;
    const context = canvas.getContext('2d');

    const bg = context.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, '#181626');
    bg.addColorStop(1, '#241f3d');
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    const mid = height / 2;
    const barCount = 72;
    const position = audioTime / (buffer?.duration || 1);
    const centre = Math.floor(position * peaks.length);
    context.fillStyle = '#8b7cf6';

    if (style === 'circle') {
      const pulse = (peaks[centre] || 0.2) * height * 0.4 + height * 0.12;
      context.beginPath();
      context.arc(width / 2, height / 2, pulse, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#c4b5fd';
      context.beginPath();
      context.arc(width / 2, height / 2, pulse * 0.55, 0, Math.PI * 2);
      context.fill();
      return;
    }

    if (style === 'wave') {
      context.beginPath();
      context.strokeStyle = '#8b7cf6';
      context.lineWidth = Math.max(2, height / 180);
      for (let i = 0; i < barCount; i += 1) {
        const value = peaks[(centre + i * 3) % peaks.length] || 0;
        const x = (i / barCount) * width;
        const y = mid - value * height * 0.42;
        if (i === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.stroke();
      return;
    }

    const slot = width / barCount;
    for (let i = 0; i < barCount; i += 1) {
      const value = peaks[(centre + i * 3) % peaks.length] || 0;
      const barHeight = Math.max(value * height * 0.7, 4);
      context.fillRect(i * slot + slot * 0.15, mid - barHeight / 2, slot * 0.7, barHeight);
    }
  }, [buffer, height, style, width]);

  const stopRender = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    audioRef.current?.pause();
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  }, []);

  const startRender = () => {
    const audio = audioRef.current;
    if (!audio || !VIDEO_MIME) {
      setStatus('This browser cannot record video.');
      return;
    }

    // The canvas stream is the video track; the audio track comes from a
    // MediaElementSource routed into a stream destination.
    const context = getContext();
    context.resume?.();
    const source = context.createMediaElementSource(audio);
    const destination = context.createMediaStreamDestination();
    source.connect(destination);
    source.connect(context.destination);

    const canvasStream = canvasRef.current.captureStream(30);
    const stream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...destination.stream.getAudioTracks(),
    ]);

    const chunks = [];
    const recorder = new MediaRecorder(stream, { mimeType: VIDEO_MIME });
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
      resultUrlRef.current = URL.createObjectURL(blob);
      setResult({
        blob,
        url: resultUrlRef.current,
        filename: `${(file?.name || 'audio').replace(/\.[^.]+$/, '')}-video.webm`,
      });
      setRendering(false);
      setProgress(0);
      setStatus('Video ready — preview it, then download.');
      toast.success('Video created');
    };

    recorder.start(500);
    recorderRef.current = recorder;
    setRendering(true);
    setStatus(`Recording in real time — ${formatTime(buffer.duration)}.`);

    audio.currentTime = 0;
    audio.play();

    const tick = () => {
      drawFrame(audio.currentTime);
      setProgress((audio.currentTime / (buffer?.duration || 1)) * 100);

      if (audio.ended || audio.currentTime >= (buffer?.duration || 0) - 0.05) {
        stopRender();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  return (
    <ToolGrid>
      <div className="stack">
        <Panel title="Source audio" hint="The soundtrack is your file, played through the recorder.">
          <Dropzone file={file} onFile={(picked) => { reset(); setResult(null); load(picked); }} accept="audio/*" />

          {loading && <p className="muted-line">Decoding…</p>}
          {error && (
            <Alert tone="danger" title="That did not work" icon={<AlertTriangle size={16} />}>
              {error}
            </Alert>
          )}

          {buffer && (
            <div className="between-row">
              <p className="muted-line">
                {formatTime(buffer.duration)} · {info.channels === 1 ? 'Mono' : 'Stereo'} · {formatBytes(info.size)}
              </p>
              <Button variant="ghost" onClick={() => { reset(); setResult(null); }}>Change file</Button>
            </div>
          )}
        </Panel>

        {buffer && (
          <Panel title="Video settings">
            <Field label="Visual style">
              <Segmented size="sm" value={style} onChange={setStyle} options={VIDEO_STYLES} />
            </Field>
            <Field label="Resolution">
              <Select value={resolution} onChange={setResolution} options={RESOLUTIONS} />
            </Field>

            <div className="btn-row">
              {!rendering ? (
                <Button onClick={startRender} icon={<Video size={15} />}>Create video</Button>
              ) : (
                <Button variant="danger" onClick={stopRender} icon={<AlertTriangle size={15} />}>
                  Stop early
                </Button>
              )}
            </div>

            {rendering && (
              <>
                <Meter value={progress} label="Recording progress" />
                <p className="muted-line">Recording runs in real time — keep this tab visible.</p>
              </>
            )}

            {!VIDEO_MIME && (
              <Alert tone="warning" title="MediaRecorder unavailable">
                This browser cannot record canvas video. Try Chrome, Edge or Firefox.
              </Alert>
            )}
          </Panel>
        )}
      </div>

      <div className="stack">
        <Panel
          title="Result"
          hint="WebM plays in every modern browser and uploads to YouTube directly."
          actions={result && (
            <Button variant="ghost" onClick={() => downloadBlob(result.filename, result.blob)} icon={<Download size={16} />}>
              Download
            </Button>
          )}
        >
          {result ? (
            <video src={result.url} controls className="audiofy-video" />
          ) : (
            <p className="muted-line">{buffer ? 'Press Create video to record.' : 'Load audio to begin.'}</p>
          )}
          <p className="muted-line" role="status" aria-live="polite">{status}</p>
        </Panel>
      </div>

      {/* The recording canvas stays offscreen: the visible page never needs it,
          and detaching it from layout keeps the export frame rate honest. */}
      <canvas ref={canvasRef} width={width} height={height} className="audiofy-offscreen" aria-hidden="true" />
      <audio key={sourceUrl} ref={audioRef} src={sourceUrl} hidden />
    </ToolGrid>
  );
}

/* ------------------------------------------------------ Metadata editor ---- */

const GENRES = ['Blues', 'Country', 'Electronic', 'Folk', 'Hip-Hop', 'Jazz', 'Latin', 'Pop', 'R&B', 'Rock', 'Spoken Word', 'Other'];

/** Edit ID3v2 tags on MP3 files. Non-MP3s get an honest JSON sidecar instead. */
export function MetadataEditor() {
  const [file, setFile] = useState(null);
  const [meta, setMeta] = useState({
    title: '', artist: '', album: '', year: '', genre: '', track: '', comment: '',
  });
  const [cover, setCover] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const bytesRef = useRef(null);
  const coverRef = useRef(null);

  const isMp3 = file && (file.type === 'audio/mpeg' || file.name.toLowerCase().endsWith('.mp3'));

  const pick = (candidate) => {
    setError('');
    setStatus('');
    setCover(null);
    coverRef.current = null;
    bytesRef.current = null;
    setFile(candidate);

    if (candidate) {
      setMeta((current) => ({
        ...current,
        title: current.title || candidate.name.replace(/\.[^.]+$/, ''),
      }));
    }
  };

  const pickCover = async (candidate) => {
    if (!candidate) return;
    if (!candidate.type.startsWith('image/')) {
      setError('The cover must be an image file.');
      return;
    }
    const bytes = new Uint8Array(await candidate.arrayBuffer());
    coverRef.current = { bytes, mime: candidate.type };
    setCover(candidate);
  };

  const set = (key) => (value) => setMeta((current) => ({ ...current, [key]: value }));

  const writeTags = async () => {
    if (!file) return;
    if (!meta.title.trim()) {
      setError('A title is the one tag worth having — add at least that.');
      return;
    }

    setBusy(true);
    setError('');

    try {
      if (!bytesRef.current) {
        bytesRef.current = await file.arrayBuffer();
      }

      if (!isMp3) {
        // ID3 only lives in MP3s; writing a "WAV with tags" would just be a
        // lie, so non-MP3 files get a JSON sidecar, as the original shipped.
        downloadText(
          `${meta.title || 'metadata'}-tags.json`,
          JSON.stringify({ file: file.name, ...meta, cover: cover?.name }, null, 2),
          'application/json',
        );
        setStatus('Not an MP3 — saved the tags as a JSON sidecar instead.');
        toast.success('Metadata saved as JSON');
        return;
      }

      const stripped = stripId3(bytesRef.current);
      const tag = buildId3v2Tag(meta, coverRef.current);
      const blob = new Blob([withId3Tag(stripped, tag)], { type: 'audio/mpeg' });
      downloadBlob(`${(meta.title || file.name).replace(/\.[^.]+$/, '')}-tagged.mp3`, blob);
      setStatus('Tagged MP3 downloaded.');
      toast.success('Tags written');
    } catch (caught) {
      setError(caught.message || 'Tag writing failed.');
    } finally {
      setBusy(false);
    }
  };

  const fields = [
    ['title', 'Title', 'Track or episode title'],
    ['artist', 'Artist', 'Performing artist'],
    ['album', 'Album', 'Album or series name'],
    ['year', 'Year', 'e.g. 2026'],
    ['track', 'Track number', 'e.g. 3 or 3/12'],
  ];

  return (
    <ToolGrid>
      <div className="stack">
        <Panel
          title="Audio file"
          hint="Tags are written locally — the original file is not modified."
        >
          <Dropzone file={file} onFile={pick} accept="audio/*" />

          {file && !isMp3 && (
            <Alert tone="warning" title="This is not an MP3">
              ID3 tags only live in MP3 files. Your tags will be saved as a JSON sidecar you can apply in an editor.
            </Alert>
          )}

          {file && (
            <p className="muted-line">
              {file.name} · {formatBytes(file.size)}
            </p>
          )}
        </Panel>

        {file && (
          <Panel title="Tags">
            {fields.map(([key, label, hint]) => (
              <Field key={key} label={label} hint={hint} htmlFor={`audiofy-tag-${key}`}>
                <Input id={`audiofy-tag-${key}`} value={meta[key]} onChange={set(key)} />
              </Field>
            ))}

            <Field label="Genre" htmlFor="audiofy-tag-genre">
              <Select
                id="audiofy-tag-genre"
                value={meta.genre}
                onChange={set('genre')}
                options={[{ value: '', label: '— none —' }, ...GENRES.map((genre) => ({ value: genre, label: genre }))]}
              />
            </Field>

            <Field label="Comment" htmlFor="audiofy-tag-comment">
              <TextArea
                id="audiofy-tag-comment"
                rows={2}
                value={meta.comment}
                onChange={set('comment')}
                counter={false}
              />
            </Field>

            <Field label="Cover image" hint="embedded as front cover (MP3 only)">
              <Dropzone
                file={cover}
                onFile={pickCover}
                accept="image/*"
                label="Choose a cover image"
                hint="JPG or PNG, square works best"
                icon={<Music size={22} />}
              />
            </Field>

            <div className="btn-row">
              <Button onClick={writeTags} loading={busy} icon={<Wand2 size={15} />}>
                {isMp3 ? 'Write tags & download' : 'Save JSON sidecar'}
              </Button>
              <Button variant="ghost" onClick={() => { setFile(null); bytesRef.current = null; }} disabled={busy}>
                Change file
              </Button>
            </div>

            {error && (
              <Alert tone="danger" title="That did not work" icon={<AlertTriangle size={16} />}>
                {error}
              </Alert>
            )}
          </Panel>
        )}

        <p className="muted-line" role="status" aria-live="polite">{status}</p>
      </div>

      <div className="stack">
        <Panel title="How tagging works" hint="No upload — the file is patched in memory.">
          <StatRow>
            <Stat label="Tag version" value="ID3v2.3" hint="read by every player" />
            <Stat label="Art" value="APIC front cover" hint="embedded raw bytes" />
          </StatRow>
          <p className="muted-line">
            Any existing tag is stripped first, then a fresh one is written from the form — so the
            download always reflects exactly what you see here.
          </p>
        </Panel>
      </div>
    </ToolGrid>
  );
}

/* ------------------------------------------------------------ TTS bridge ---- */

/**
 * The suite's "Text to Speech" is the site's existing Text-to-Speech tool — a
 * full page backed by the FastAPI service with the voice library. Duplicating
 * it inside the suite would fork the voice data, so this card routes there.
 */
export function TtsBridge() {
  return (
    <div className="stack">
      <Panel
        title="Text to Speech"
        hint="Neural voices in 100+ languages, exported as MP3 — handled by the site's dedicated tool."
      >
        <p className="muted-line">
          Speech synthesis needs a server-side engine and the voice library, so it lives in its own
          tool rather than in this browser-only suite. Everything else here runs without a server;
          the TTS tool connects to the site's API to render your text.
        </p>

        <StatRow>
          <Stat label="Voices" value="400+" hint="across 100+ languages" />
          <Stat label="Output" value="MP3" hint="rendered server-side" />
        </StatRow>

        <div className="btn-row">
          <Link to="/tools/text-to-speech" className="ui-btn ui-btn-primary">
            Open Text to Speech <ArrowRight size={15} />
          </Link>
        </div>
      </Panel>
    </div>
  );
}
