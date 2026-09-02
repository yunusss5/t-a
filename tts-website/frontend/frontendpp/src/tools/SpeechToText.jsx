// src/tools/SpeechToText.jsx
// Live dictation with the browser's own SpeechRecognition — nothing is uploaded.

import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Download, Mic, MicOff, Trash2 } from 'lucide-react';
import { copyText, downloadText } from '../lib/utils';
import { Button, ErrorNote, Field, Panel, Select, TextArea, ToolGrid } from '../components/ui/Primitives';
import { EmptyState, Stat, StatRow } from '../components/ui/Display';

const LANGUAGES = [
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'en-IN', label: 'English (India)' },
  { value: 'hi-IN', label: 'Hindi' },
  { value: 'bn-IN', label: 'Bengali' },
  { value: 'ta-IN', label: 'Tamil' },
  { value: 'te-IN', label: 'Telugu' },
  { value: 'mr-IN', label: 'Marathi' },
  { value: 'ur-PK', label: 'Urdu' },
  { value: 'es-ES', label: 'Spanish' },
  { value: 'fr-FR', label: 'French' },
  { value: 'de-DE', label: 'German' },
  { value: 'pt-BR', label: 'Portuguese (BR)' },
  { value: 'ar-SA', label: 'Arabic' },
  { value: 'ja-JP', label: 'Japanese' },
  { value: 'ko-KR', label: 'Korean' },
  { value: 'zh-CN', label: 'Chinese (Mandarin)' },
];

const SpeechRecognition =
  typeof window !== 'undefined' &&
  (window.SpeechRecognition || window.webkitSpeechRecognition);

export default function SpeechToText() {
  const [language, setLanguage] = useState('en-US');
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [error, setError] = useState('');

  const recognitionRef = useRef(null);
  const keepAlive = useRef(false);

  // Recreate the recogniser whenever the language changes.
  useEffect(() => {
    if (!SpeechRecognition) return undefined;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = language;

    recognition.onresult = (event) => {
      let pending = '';

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const chunk = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          setTranscript((current) => `${current}${current ? ' ' : ''}${chunk.trim()}`);
        } else {
          pending += chunk;
        }
      }

      setInterim(pending);
    };

    recognition.onerror = (event) => {
      if (event.error === 'no-speech') return;
      setError(
        event.error === 'not-allowed'
          ? 'Microphone access was blocked. Allow it in your browser settings.'
          : `Recognition error: ${event.error}`,
      );
      keepAlive.current = false;
      setListening(false);
    };

    // Chrome stops after a pause; restart while the user still wants to dictate.
    recognition.onend = () => {
      if (keepAlive.current) {
        try {
          recognition.start();
        } catch {
          setListening(false);
        }
      } else {
        setListening(false);
        setInterim('');
      }
    };

    recognitionRef.current = recognition;

    return () => {
      keepAlive.current = false;
      recognition.onend = null;
      recognition.stop();
    };
  }, [language]);

  const toggle = () => {
    setError('');
    const recognition = recognitionRef.current;
    if (!recognition) return;

    if (listening) {
      keepAlive.current = false;
      recognition.stop();
      return;
    }

    try {
      keepAlive.current = true;
      recognition.start();
      setListening(true);
      toast.success('Listening — start speaking');
    } catch {
      setError('Could not start the microphone. Close other tabs using it and try again.');
      keepAlive.current = false;
    }
  };

  const words = transcript.trim() ? transcript.trim().split(/\s+/).length : 0;

  if (!SpeechRecognition) {
    return (
      <Panel>
        <EmptyState icon={<MicOff size={26} />} title="Not supported in this browser">
          Live dictation needs the Web Speech API. Chrome, Edge and Safari support it; Firefox does
          not. Everything else on the site works fine here.
        </EmptyState>
      </Panel>
    );
  }

  return (
    <ToolGrid>
      <Panel title="Microphone" hint="Audio is processed by your browser — nothing is uploaded.">
        <Field label="Language">
          <Select value={language} onChange={setLanguage} options={LANGUAGES} disabled={listening} />
        </Field>

        <div className="btn-row">
          <Button
            variant={listening ? 'danger' : 'primary'}
            icon={listening ? <MicOff size={16} /> : <Mic size={16} />}
            onClick={toggle}
          >
            {listening ? 'Stop dictation' : 'Start dictation'}
          </Button>
          {transcript && (
            <Button variant="ghost" icon={<Trash2 size={15} />} onClick={() => setTranscript('')}>
              Clear
            </Button>
          )}
        </div>

        {listening && (
          <p className="inline-note">
            {interim ? interim : 'Listening… pauses are fine, recognition restarts automatically.'}
          </p>
        )}

        <ErrorNote>{error}</ErrorNote>

        <StatRow>
          <Stat label="Words" value={words} />
          <Stat label="Characters" value={transcript.length} />
          <Stat label="Status" value={listening ? 'Live' : 'Idle'} tone={listening ? 'good' : undefined} />
        </StatRow>
      </Panel>

      <Panel
        title="Transcript"
        hint="Editable — fix anything the recogniser missed."
        actions={
          transcript && (
            <>
              <Button variant="ghost" onClick={() => copyText(transcript, 'Transcript copied')}>
                Copy
              </Button>
              <Button
                variant="ghost"
                icon={<Download size={15} />}
                onClick={() => downloadText('dictation.txt', transcript)}
              >
                .txt
              </Button>
            </>
          )
        }
      >
        <TextArea
          value={transcript}
          onChange={setTranscript}
          rows={18}
          placeholder="Your words will appear here as you speak…"
        />
      </Panel>
    </ToolGrid>
  );
}
