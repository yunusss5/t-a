// src/components/AboutModal.jsx
import React from 'react';

function AboutModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          ×
        </button>

        <h2>About VoiceForge</h2>

        <p>
          Convert any text into natural-sounding speech using high-quality
          neural voices. Upload transcripts or paste text – download as MP3.
        </p>

        <div className="qr-section">
          <p>
            <strong>Support our team</strong> – scan to donate:
          </p>

          <div className="qr-placeholder">
            <img
              src="/qr-support.png"
              alt="Donate QR"
              width="160"
              height="160"
            />
          </div>

          <p className="qr-note">
            Every contribution helps us improve.
          </p>
        </div>

        <div className="modal-footer">
          <span className="upi-label">UPI ID</span>
          <span className="upi-id">gause700ybl</span>
        </div>
      </div>
    </div>
  );
}

export default AboutModal;
