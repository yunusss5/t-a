import React from 'react';

function AudioPlayer({ audioUrl }) {
  return (
    <div className="player-wrap">
      <div className="player-card">
        <audio id="audio-player" controls src={audioUrl}></audio>
      </div>
      <a className="download-btn" href={audioUrl} download="speech.mp3">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M12 3v12m0-12l4 4m-4-4L8 7M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Download MP3
      </a>
    </div>
  );
}

export default AudioPlayer;