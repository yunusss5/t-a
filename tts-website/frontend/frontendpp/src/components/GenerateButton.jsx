import React from 'react';

function GenerateButton({ onClick, loading }) {
  return (
    <button id="generate-btn" onClick={onClick} disabled={loading}>
      <span className="btn-label" hidden={loading}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M5 3l14 9-14 9V3z" fill="currentColor"/>
        </svg>
        Generate Audio
      </span>
      <span className={`btn-spinner ${loading ? 'visible' : ''}`}></span>
    </button>
  );
}

export default GenerateButton;