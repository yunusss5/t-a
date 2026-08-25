import React from 'react';

function AutoSpeed({ autoSpeed, setAutoSpeed, targetTime, setTargetTime }) {
  const toggleAutoSpeed = () => {
    setAutoSpeed(prev => !prev);
  };

  return (
    <div className="controls-secondary">
      <div className="control-group grow">
        <label htmlFor="target-time-input">Target Time (seconds)</label>
        <input
          type="number"
          id="target-time-input"
          className="target-time-input"
          placeholder="Optional"
          min="1"
          step="1"
          value={targetTime}
          onChange={(e) => setTargetTime(e.target.value)}
          disabled={!autoSpeed}
        />
      </div>

      <button
        type="button"
        id="auto-speed-btn"
        className={`auto-speed-btn ${autoSpeed ? 'active' : ''}`}
        onClick={toggleAutoSpeed}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="13" r="8" stroke="currentColor" strokeWidth="1.8"/>
          <path d="M12 9v4l3 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M9 2h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
        Auto Speed
      </button>
    </div>
  );
}

export default AutoSpeed;