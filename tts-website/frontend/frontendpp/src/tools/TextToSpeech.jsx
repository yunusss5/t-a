// src/tools/TextToSpeech.jsx
// The original generator, rebuilt on the shared primitives. Same endpoints and
// the same Auto Speed behaviour as before: /generate and /generate-from-file.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { AlignLeft, Download, FileText, RefreshCw, Volume2 } from 'lucide-react';
import { getJson, postFormBlob } from '../lib/api';
import { downloadBlob } from '../lib/utils';
import {
  Alert, Button, ErrorNote, Field, Input, Panel, Segmented, Select, Switch, TextArea, ToolGrid,
} from '../components/ui/Primitives';
import { Dropzone, EmptyState } from '../components/ui/Display';

const SOURCES = [
  { value: 'text', label: 'Paste text', icon: <AlignLeft size={14} /> },
  { value: 'file', label: 'Upload file', icon: <FileText size={14} /> },
];

const RATES = ['-50%', '-25%', '-10%', '+0%', '+10%', '+25%', '+50%'];

// Stands in for the real options while the list is in flight or unavailable, so
// the two selects are never blank boxes with nothing to say for themselves.
const PLACEHOLDER = {
  loading: [{ value: '', label: 'Loading voices…' }],
  failed: [{ value: '', label: 'Voices unavailable' }],
};

export default function TextToSpeech() {
  const [source, setSource] = useState('text');
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [voices, setVoices] = useState([]);
  // The catalogue is fetched, so it has three states, and collapsing them into
  // an empty array is what left the language and voice pickers looking broken
  // for the ~30 seconds a sleeping free-tier backend takes to answer.
  const [voicesState, setVoicesState] = useState('loading');
  const [voicesError, setVoicesError] = useState('');
  const [locale, setLocale] = useState('');
  const [voiceChoice, setVoiceChoice] = useState('');
  const [rate, setRate] = useState('+0%');
  const [autoSpeed, setAutoSpeed] = useState(false);
  const [targetTime, setTargetTime] = useState('');
  const [audioUrl, setAudioUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // One controller for whichever load is in flight: a retry supersedes the
  // request before it, and unmounting cancels the lot.
  const loadRef = useRef(null);

  const adopt = useCallback((data) => {
    setVoices(data);
    const first = [...new Set(data.map((item) => item.locale))].sort()[0];
    if (first) setLocale(first);
    setVoicesState('ready');
  }, []);

  const reject = useCallback((err) => {
    // An abort is this component's own doing — a superseded retry or an
    // unmount — so it is not something to report as a failure.
    if (err?.name === 'AbortError') return;
    setVoicesError(err.message);
    setVoicesState('failed');
  }, []);

  // Settled in promise callbacks rather than after an `await` in an async body:
  // either shape works, but this one keeps every setState out of the effect that
  // starts the load, which is the difference between one render and a cascade.
  const fetchVoices = useCallback(() => {
    loadRef.current?.abort();
    const controller = new AbortController();
    loadRef.current = controller;

    return getJson('/voices', { signal: controller.signal }).then(adopt, reject);
  }, [adopt, reject]);

  // `voicesState` already starts at 'loading', so the mount effect only has to
  // ask; setting it here as well would change nothing on screen.
  useEffect(() => {
    fetchVoices();
    return () => loadRef.current?.abort();
  }, [fetchVoices]);

  // The retry button does reset the state, because by the time it can be pressed
  // the state really is 'failed' and the pickers have to go back to loading.
  const retryVoices = useCallback(() => {
    setVoicesState('loading');
    setVoicesError('');
    fetchVoices();
  }, [fetchVoices]);

  const locales = useMemo(
    () => [...new Set(voices.map((item) => item.locale))].sort(),
    [voices],
  );

  const voiceOptions = useMemo(
    () =>
      voices
        .filter((item) => item.locale === locale)
        .map((item) => ({ value: item.name, label: `${item.friendly_name} · ${item.gender}` })),
    [voices, locale],
  );

  // The picked voice only applies while it belongs to the selected language,
  // so switching language falls back to that language's first voice.
  const voice = voiceOptions.some((option) => option.value === voiceChoice)
    ? voiceChoice
    : voiceOptions[0]?.value || '';

  // Revoke the previous object URL so long sessions don't leak blobs.
  useEffect(() => () => audioUrl && URL.revokeObjectURL(audioUrl), [audioUrl]);

  const ready = voicesState === 'ready';

  const generate = async () => {
    setError('');

    // The catalogue, not the choice, is what is missing here — "Pick a voice
    // first" would blame the user for a request that never arrived.
    if (!ready) {
      return setError(
        voicesState === 'loading'
          ? 'Still loading the voice list — one moment.'
          : 'The voice list could not be loaded, so there is nothing to speak with yet.',
      );
    }

    if (!voice) return setError('Pick a voice first.');
    if (source === 'text' && !text.trim()) return setError('Paste some text first.');
    if (source === 'file' && !file) return setError('Choose a transcript file first.');
    if (autoSpeed && !targetTime) return setError('Enter a target time, or turn off Auto Speed.');

    setLoading(true);

    try {
      const payload = {
        voice,
        rate,
        auto_speed: String(autoSpeed),
        ...(autoSpeed ? { target_time: targetTime } : {}),
        ...(source === 'text' ? { text } : { file }),
      };

      const blob = await postFormBlob(
        source === 'text' ? '/generate' : '/generate-from-file',
        payload,
      );

      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(URL.createObjectURL(blob));
      toast.success('Audio ready');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ToolGrid>
      <Panel title="Script" hint="Neural voices from Microsoft Edge — free, no API key.">
        <Segmented value={source} onChange={setSource} options={SOURCES} label="Script source" />

        {source === 'text' ? (
          <TextArea
            value={text}
            onChange={setText}
            rows={12}
            placeholder="Type or paste what you want spoken…"
          />
        ) : (
          <Dropzone file={file} onFile={setFile} accept=".txt,.md,.srt,.vtt" hint="TXT, MD, SRT or VTT" />
        )}

        <div className="field-row">
          <Field label="Language">
            <Select
              value={locale}
              onChange={setLocale}
              options={ready ? locales : PLACEHOLDER[voicesState]}
              disabled={!ready}
              aria-busy={voicesState === 'loading' || undefined}
            />
          </Field>
          <Field label="Voice">
            <Select
              value={voice}
              onChange={setVoiceChoice}
              options={ready ? voiceOptions : PLACEHOLDER[voicesState]}
              disabled={!ready}
              aria-busy={voicesState === 'loading' || undefined}
            />
          </Field>
        </div>

        {/* Sits with the pickers it explains rather than at the foot of the
            panel: the two empty dropdowns are the symptom, so the reason and the
            way to recover belong next to them. */}
        {voicesState === 'failed' && (
          <>
            <Alert tone="danger" title="Voice list unavailable">
              {voicesError}
            </Alert>
            <div className="btn-row">
              <Button variant="soft" icon={<RefreshCw size={15} />} onClick={retryVoices}>
                Try again
              </Button>
            </div>
          </>
        )}

        <Field label="Speed" hint={autoSpeed ? 'overridden by Auto Speed' : 'relative to normal'}>
          <Segmented value={rate} onChange={setRate} options={RATES} size="sm" label="Speed" />
        </Field>

        <div className="divider" />

        {/* A switch rather than a checkbox: it takes effect on the spot, and
            turning it on is what reveals the target-time field below. */}
        <Switch
          checked={autoSpeed}
          onChange={setAutoSpeed}
          label="Auto Speed"
          hint="Stretch or squeeze the narration to hit an exact duration"
        />

        {autoSpeed && (
          <Field label="Target time" hint="mm:ss or seconds">
            <Input value={targetTime} onChange={setTargetTime} placeholder="1:30" />
          </Field>
        )}

        <div className="btn-row">
          <Button icon={<Volume2 size={16} />} loading={loading} onClick={generate}>
            {loading ? 'Generating…' : 'Generate audio'}
          </Button>
        </div>

        <ErrorNote>{error}</ErrorNote>
      </Panel>

      <Panel title="Output">
        {audioUrl ? (
          <>
            <audio controls src={audioUrl} style={{ width: '100%' }} />
            <div className="btn-row">
              <Button
                variant="soft"
                icon={<Download size={15} />}
                onClick={async () =>
                  downloadBlob('speech.mp3', await (await fetch(audioUrl)).blob())
                }
              >
                Download MP3
              </Button>
            </div>
            <p className="muted-line">
              Long scripts take a few seconds — the file is generated on the server and streamed
              straight back to you.
            </p>
          </>
        ) : (
          <EmptyState icon={<Volume2 size={26} />} title="No audio yet">
            Choose a language and voice, then generate. Auto Speed is handy when the voiceover has
            to match a fixed video length.
          </EmptyState>
        )}
      </Panel>
    </ToolGrid>
  );
}
