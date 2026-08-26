// src/App.jsx
import React, { useState, useEffect, useRef } from 'react';
import Header from './components/Header';
import Footer from './components/Footer';
import Tabs from './components/Tabs';
import TextInput from './components/TextInput';
import FileUpload from './components/FileUpload';
import Controls from './components/Controls';
import AutoSpeed from './components/AutoSpeed';
import GenerateButton from './components/GenerateButton';
import StatusMessage from './components/StatusMessage';
import AudioPlayer from './components/AudioPlayer';
import AboutModal from './components/AboutModal';
import AudioAdjuster from './components/AudioAdjuster';

function App() {
  // ---------- State ----------
  const [activeTab, setActiveTab] = useState('text-tab');
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [language, setLanguage] = useState('');
  const [voice, setVoice] = useState('');
  const [rate, setRate] = useState('+0%');
  const [targetTime, setTargetTime] = useState('');
  const [autoSpeed, setAutoSpeed] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ message: '', type: '' });

  // Voice list
  const [allVoices, setAllVoices] = useState([]);
  const [languageOptions, setLanguageOptions] = useState([]);
  const [voiceOptions, setVoiceOptions] = useState([]);

  // UI state
  const [darkMode, setDarkMode] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState('home'); // 'home' | 'tikri'

  const fileInputRef = useRef(null);

  // ---------- Load Voices ----------
  useEffect(() => {
    const API_BASE =
      import.meta.env.VITE_API_BASE ||
      'https://tts-backend-33xv.onrender.com';

    fetch(`${API_BASE}/voices`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch voices');
        return res.json();
      })
      .then(data => {
        setAllVoices(data);

        const langs = [...new Set(data.map(v => v.locale))].sort();
        setLanguageOptions(langs);

        if (langs.length) {
          setLanguage(langs[0]);

          const voicesForLang = data.filter(
            v => v.locale === langs[0]
          );

          setVoiceOptions(voicesForLang);

          if (voicesForLang.length) {
            setVoice(voicesForLang[0].name);
          }
        }
      })
      .catch(() => {
        setStatus({
          message: 'Could not load voices. Is the backend running?',
          type: 'error',
        });
      });
  }, []);

  // ---------- Update voices when language changes ----------
  useEffect(() => {
    if (!language || !allVoices.length) return;

    const filtered = allVoices.filter(
      v => v.locale === language
    );

    setVoiceOptions(filtered);

    if (filtered.length) {
      setVoice(filtered[0].name);
    }
  }, [language, allVoices]);

  // ---------- Generate handler ----------
  const handleGenerate = async () => {
    setStatus({ message: '', type: '' });
    setAudioUrl(null);

    if (!voice) {
      setStatus({
        message: 'Please select a voice.',
        type: 'error',
      });
      return;
    }

    if (activeTab === 'text-tab' && !text.trim()) {
      setStatus({
        message: 'Please paste some text first.',
        type: 'error',
      });
      return;
    }

    if (activeTab === 'file-tab' && !file) {
      setStatus({
        message: 'Please choose a transcript file first.',
        type: 'error',
      });
      return;
    }

    if (autoSpeed && !targetTime) {
      setStatus({
        message: 'Enter a target time, or turn off Auto Speed.',
        type: 'error',
      });
      return;
    }

    setLoading(true);

    setStatus({
      message:
        'Generating audio... this can take a few seconds for long text.',
      type: '',
    });

    try {
      const API_BASE =
        import.meta.env.VITE_API_BASE ||
        'https://tts-backend-33xv.onrender.com';

      const formData = new FormData();

      formData.append('voice', voice);
      formData.append('rate', rate);
      formData.append('auto_speed', String(autoSpeed));

      if (autoSpeed) {
        formData.append('target_time', targetTime);
      }

      let response;

      if (activeTab === 'text-tab') {
        formData.append('text', text);

        response = await fetch(`${API_BASE}/generate`, {
          method: 'POST',
          body: formData,
        });
      } else {
        formData.append('file', file);

        response = await fetch(`${API_BASE}/generate-from-file`, {
          method: 'POST',
          body: formData,
        });
      }

      if (!response.ok) {
        let errMsg = 'Generation failed.';

        try {
          const errBody = await response.json();
          errMsg = errBody.detail || errMsg;
        } catch (_) {
          // Ignore JSON parsing errors.
        }

        throw new Error(errMsg);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      setAudioUrl(url);

      setStatus({
        message:
          'Done! Preview it below or download the MP3.',
        type: 'success',
      });
    } catch (err) {
      setStatus({
        message: err.message || 'Something went wrong.',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  // ---------- Toggle dark mode ----------
  const toggleDarkMode = () => {
    setDarkMode(prev => !prev);
    document.body.classList.toggle('dark-mode');
  };

  // ---------- Render ----------
  return (
    <div className="app-wrapper">
      <Header
        darkMode={darkMode}
        toggleDarkMode={toggleDarkMode}
        openAbout={() => setAboutOpen(true)}
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
      />

      <main className="container">
        {currentPage === 'home' && (
          <>
            <div className="page-intro">
              <h2>Text to Speech</h2>
              <p className="subtitle">
                Paste text or upload a transcript. Choose a voice.
                Download studio-quality audio.
              </p>
            </div>

            <Tabs
              activeTab={activeTab}
              setActiveTab={setActiveTab}
            />

            {activeTab === 'text-tab' && (
              <TextInput
                text={text}
                setText={setText}
              />
            )}

            {activeTab === 'file-tab' && (
              <FileUpload
                file={file}
                setFile={setFile}
                fileInputRef={fileInputRef}
              />
            )}

            <Controls
              language={language}
              setLanguage={setLanguage}
              languageOptions={languageOptions}
              voice={voice}
              setVoice={setVoice}
              voiceOptions={voiceOptions}
              rate={rate}
              setRate={setRate}
              autoSpeed={autoSpeed}
            />

            <AutoSpeed
              autoSpeed={autoSpeed}
              setAutoSpeed={setAutoSpeed}
              targetTime={targetTime}
              setTargetTime={setTargetTime}
            />

            <GenerateButton
              onClick={handleGenerate}
              loading={loading}
            />

            <StatusMessage status={status} />

            {audioUrl && (
              <AudioPlayer audioUrl={audioUrl} />
            )}
          </>
        )}

        {currentPage === 'tikri' && (
          <AudioAdjuster />
        )}
      </main>

      <Footer />

      <AboutModal
        isOpen={aboutOpen}
        onClose={() => setAboutOpen(false)}
      />
    </div>
  );
}

export default App;
