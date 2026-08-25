// src/components/Controls.jsx
import React from 'react';

function Controls({
  language,
  setLanguage,
  languageOptions,
  voice,
  setVoice,
  voiceOptions,
  rate,
  setRate,
  autoSpeed,
}) {
  return (
    <div className="controls">
      <div className="control-group">
        <label htmlFor="language-select">Language</label>
        <div className="select-wrap">
          <select
            id="language-select"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            {languageOptions.map(loc => (
              <option key={loc} value={loc}>{loc}</option>
            ))}
          </select>
          <svg className="select-caret" width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>

      <div className="control-group">
        <label htmlFor="voice-select">Voice</label>
        <div className="select-wrap">
          <select
            id="voice-select"
            value={voice}
            onChange={(e) => setVoice(e.target.value)}
          >
            {voiceOptions.map(v => (
              <option key={v.name} value={v.name}>
                {v.friendly_name} ({v.gender})
              </option>
            ))}
          </select>
          <svg className="select-caret" width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>

      <div className="control-group">
        <label htmlFor="rate-select">Speed</label>
        <div className="select-wrap">
          <select
            id="rate-select"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            disabled={autoSpeed}
          >
            <option value="-25%">Slower</option>
            <option value="+0%">Normal</option>
            <option value="+25%">Faster</option>
          </select>
          <svg className="select-caret" width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>
    </div>
  );
}

export default Controls;