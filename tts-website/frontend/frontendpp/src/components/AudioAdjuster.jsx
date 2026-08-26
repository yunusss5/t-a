// src/components/AudioAdjuster.jsx
import React, { useState, useRef, useEffect, useCallback } from 'react';

function AudioAdjuster() {
  // ---------- State ----------
  const [file, setFile] = useState(null);
  const [originalDuration, setOriginalDuration] = useState(0);
  const [targetLength, setTargetLength] = useState(10);
  const [speed, setSpeed] = useState(1);
  const [statusText, setStatusText] = useState('⏳ Please upload an MP3');
  const [statusClass, setStatusClass] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [playerUrl, setPlayerUrl] = useState(null);
  const [fileName, setFileName] = useState('No file selected');

  // Refs for audio processing
  const audioPlayerRef = useRef(null);
  const audioContextRef = useRef(null);
  const sourceArrayBufferRef = useRef(null);
  const processedBufferRef = useRef(null);
  const processedSpeedRef = useRef(null);
  const sourceUrlRef = useRef(null);

  // ---------- Helpers ----------
  const formatTime = (sec) => {
    if (!sec || isNaN(sec) || sec < 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const setStatus = (text, cls = '') => {
    setStatusText(text);
    setStatusClass(cls);
  };

  // ---------- Load Audio ----------
  const loadAudioFile = (file) => {
    if (!file) return;
    // Revoke old URLs
    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
    if (playerUrl) URL.revokeObjectURL(playerUrl);
    // Reset cached buffers
    sourceArrayBufferRef.current = null;
    processedBufferRef.current = null;
    processedSpeedRef.current = null;

    const url = URL.createObjectURL(file);
    sourceUrlRef.current = url;
    setPlayerUrl(url);
    setFile(file);
    setFileName(file.name.length > 28 ? file.name.slice(0, 24) + '…' : file.name);

    // Load audio metadata
    const audio = audioPlayerRef.current;
    if (!audio) return;
    audio.src = url;
    audio.load();

    const onMeta = () => {
      const dur = audio.duration;
      if (isFinite(dur) && dur > 0) {
        setOriginalDuration(dur);
        setTargetLength(dur);
        setStatus(`✅ Loaded: ${formatTime(dur)}`, 'green');
      }
      audio.removeEventListener('loadedmetadata', onMeta);
    };
    audio.addEventListener('loadedmetadata', onMeta);
  };

  // ---------- Compute Speed ----------
  const computeSpeed = useCallback(() => {
    const audioLen = originalDuration || 0;
    const targetLen = targetLength || 0;
    if (!originalDuration || audioLen <= 0 || targetLen <= 0) {
      setSpeed(1);
      return 1;
    }
    const newSpeed = audioLen / targetLen;
    const clamped = Math.min(Math.max(newSpeed, 0.05), 20);
    setSpeed(clamped);
    return clamped;
  }, [originalDuration, targetLength]);

  // Recompute when duration or target changes
  useEffect(() => {
    computeSpeed();
  }, [computeSpeed]);

  // ---------- Get Processed Buffer (cached) ----------
  const getProcessedBuffer = useCallback(async (speedVal) => {
    if (processedBufferRef.current && processedSpeedRef.current === speedVal) {
      return processedBufferRef.current;
    }
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (!sourceArrayBufferRef.current) {
      const response = await fetch(sourceUrlRef.current);
      sourceArrayBufferRef.current = await response.arrayBuffer();
    }
    const bufferCopy = sourceArrayBufferRef.current.slice(0);
    const decoded = await audioContextRef.current.decodeAudioData(bufferCopy);
    const speedFactor = speedVal;
    const originalData = decoded.getChannelData(0);
    const newLength = Math.max(1, Math.round(originalData.length / speedFactor));
    const numChannels = decoded.numberOfChannels;
    const newBuffer = audioContextRef.current.createBuffer(numChannels, newLength, decoded.sampleRate);

    for (let channel = 0; channel < numChannels; channel++) {
      const channelData = decoded.getChannelData(channel);
      const newChannelData = newBuffer.getChannelData(channel);
      for (let i = 0; i < newLength; i++) {
        const srcPos = i * speedFactor;
        const index = Math.floor(srcPos);
        const frac = srcPos - index;
        if (index < channelData.length - 1) {
          newChannelData[i] = channelData[index] * (1 - frac) + channelData[index + 1] * frac;
        } else if (index < channelData.length) {
          newChannelData[i] = channelData[index];
        } else {
          newChannelData[i] = 0;
        }
      }
    }
    processedBufferRef.current = newBuffer;
    processedSpeedRef.current = speedVal;
    return newBuffer;
  }, []);

  // ---------- Apply Speed ----------
  const applySpeed = useCallback(async () => {
    if (!originalDuration) {
      setStatus('⚠️ Please upload an MP3 file first!', 'error');
      return;
    }
    const spd = computeSpeed();
    if (Math.abs(spd - 1) < 0.01) {
      // Reset to original
      if (playerUrl && playerUrl !== sourceUrlRef.current) URL.revokeObjectURL(playerUrl);
      setPlayerUrl(sourceUrlRef.current);
      setStatus('✅ Set to original length', 'green');
      return;
    }
    setIsProcessing(true);
    setStatus('⏳ Processing...', '');
    try {
      const buffer = await getProcessedBuffer(spd);
      const wavData = bufferToWav(buffer);
      const blob = new Blob([wavData], { type: 'audio/wav' });
      if (playerUrl && playerUrl !== sourceUrlRef.current) URL.revokeObjectURL(playerUrl);
      const newUrl = URL.createObjectURL(blob);
      setPlayerUrl(newUrl);
      setStatus('✅ Applied! Player shows new length', 'green');
    } catch (err) {
      console.error(err);
      setStatus('❌ Error processing audio', 'error');
    } finally {
      setIsProcessing(false);
    }
  }, [originalDuration, computeSpeed, getProcessedBuffer, playerUrl]);

  // ---------- Download ----------
  const downloadAudio = useCallback(async () => {
    if (!originalDuration) {
      setStatus('⚠️ Please upload an MP3 file first!', 'error');
      return;
    }
    const spd = speed;
    if (Math.abs(spd - 1) < 0.01) {
      setStatus('ℹ️ Audio already at target length – no change needed', '');
      return;
    }
    setIsDownloading(true);
    setProgress(20);
    try {
      const buffer = await getProcessedBuffer(spd);
      setProgress(70);
      const wavData = bufferToWav(buffer);
      setProgress(90);
      const blob = new Blob([wavData], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const name = file ? file.name.replace(/\.[^/.]+$/, '') : 'adjusted_audio';
      a.download = `${name}_adjusted_${targetLength.toFixed(1)}s.wav`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setProgress(100);
      setStatus('✅ Downloaded successfully!', 'green');
      setTimeout(() => setProgress(0), 2000);
    } catch (err) {
      console.error(err);
      setStatus('❌ Error downloading', 'error');
    } finally {
      setIsDownloading(false);
      setProgress(0);
    }
  }, [originalDuration, speed, targetLength, file, getProcessedBuffer]);

  // ---------- Reset ----------
  const resetAll = () => {
    if (originalDuration) {
      setTargetLength(originalDuration);
      if (playerUrl && playerUrl !== sourceUrlRef.current) URL.revokeObjectURL(playerUrl);
      setPlayerUrl(sourceUrlRef.current);
      processedBufferRef.current = null;
      processedSpeedRef.current = null;
      setStatus('✅ Reset to original length', 'green');
    } else {
      setStatus('⏳ Please upload an MP3', '');
    }
    setProgress(0);
  };

  // ---------- Preset Click ----------
  const applyPreset = (presetSpeed) => {
    if (!originalDuration) {
      setStatus('⚠️ Please upload an MP3 first!', 'error');
      return;
    }
    const newTarget = originalDuration / presetSpeed;
    setTargetLength(newTarget);
    // computeSpeed will run automatically via useEffect
    setStatus(`🎯 Target set to ${newTarget.toFixed(1)}s`, '');
  };

  // ---------- Helper: buffer to WAV ----------
  function bufferToWav(buffer) {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1;
    const bitDepth = 16;
    const samples = buffer.length;
    const dataSize = samples * numChannels * (bitDepth / 8);
    const headerSize = 44;
    const totalSize = headerSize + dataSize;
    const wavBuffer = new ArrayBuffer(totalSize);
    const view = new DataView(wavBuffer);
    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    writeString(0, 'RIFF');
    view.setUint32(4, totalSize - 8, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true);
    view.setUint16(32, numChannels * (bitDepth / 8), true);
    view.setUint16(34, bitDepth, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);
    const offset = 44;
    let index = 0;
    for (let i = 0; i < samples; i++) {
      for (let channel = 0; channel < numChannels; channel++) {
        const sample = buffer.getChannelData(channel)[i];
        const intSample = Math.max(-1, Math.min(1, sample)) * 0x7FFF;
        view.setInt16(offset + index * 2, intSample, true);
        index++;
      }
    }
    return wavBuffer;
  }

  // ---------- File input handlers ----------
  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (selected && (selected.type === 'audio/mpeg' || selected.name.endsWith('.mp3'))) {
      loadAudioFile(selected);
    } else {
      setStatus('⚠️ Only MP3 files are supported!', 'error');
      e.target.value = '';
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files[0];
    if (dropped && (dropped.type === 'audio/mpeg' || dropped.name.endsWith('.mp3'))) {
      loadAudioFile(dropped);
      // sync the input
      const input = document.getElementById('fileInput');
      if (input) {
        const dt = new DataTransfer();
        dt.items.add(dropped);
        input.files = dt.files;
      }
    } else {
      setStatus('⚠️ Only MP3 files are supported!', 'error');
    }
  };

  const handleDragOver = (e) => e.preventDefault();

  // ---------- Render ----------
  return (
    <div className="audio-adjuster">
      <div className="page-intro">
        <h2>🎯 Audio Length Adjuster</h2>
        <p className="subtitle">Upload an MP3, set a target length, and we'll speed it up or slow it down.</p>
      </div>

      {/* Upload Area */}
      <div
        className="file-drop audio-upload"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onClick={() => document.getElementById('fileInput')?.click()}
      >
        <svg className="file-drop-icon" width="34" height="34" viewBox="0 0 24 24" fill="none">
          <path d="M12 3v12m0-12l4 4m-4-4L8 7M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span className="file-name">{fileName}</span>
        <span className="file-drop-hint">Drop an MP3 here or click to browse</span>
        <span className="file-duration">⏱️ {originalDuration ? formatTime(originalDuration) : '--:--'}</span>
      </div>
      <input
        type="file"
        id="fileInput"
        accept=".mp3,audio/mpeg"
        hidden
        onChange={handleFileChange}
      />

      {/* Target Length Input */}
      <div className="control-group audio-target">
        <label htmlFor="targetLength">Target Length (seconds)</label>
        <div className="input-row">
          <input
            type="number"
            id="targetLength"
            value={targetLength}
            onChange={(e) => setTargetLength(parseFloat(e.target.value) || 0)}
            min="0.5"
            step="0.1"
            className="target-time-input"
          />
          <span className="unit">seconds</span>
          <span className="hint">Current: <strong>{originalDuration ? originalDuration.toFixed(1) + 's' : '--'}</strong></span>
        </div>
      </div>

      {/* Preset Buttons */}
      <div className="preset-row">
        {[0.5, 0.75, 1, 1.5, 2, 3].map((preset) => (
          <button
            key={preset}
            className={`preset-btn ${Math.abs(speed - preset) < 0.01 ? 'active' : ''}`}
            onClick={() => applyPreset(preset)}
          >
            {preset}×
          </button>
        ))}
      </div>

      {/* Speed Info */}
      <div className="speed-display-box">
        <div className="speed-number" data-speed={speed}>
          {speed.toFixed(2)}×
        </div>
        <div className="speed-label">Required Speed</div>
        <div className="speed-details">
          <span>Original: {originalDuration ? originalDuration.toFixed(1) + 's' : '—'}</span>
          <span>Target: {targetLength ? targetLength.toFixed(1) + 's' : '—'}</span>
        </div>
      </div>

      {/* Status */}
      <div className={`status ${statusClass}`}>{statusText}</div>

      {/* Progress */}
      {progress > 0 && (
        <div className="progress-container active">
          <div className="progress-bar" style={{ width: `${progress}%` }}></div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="action-row">
        <button className="btn btn-primary" onClick={applySpeed} disabled={isProcessing}>
          {isProcessing ? '⏳ Processing...' : '✅ Apply Speed'}
        </button>
        <button className="btn btn-success" onClick={downloadAudio} disabled={isDownloading || !originalDuration}>
          {isDownloading ? '⏳ Downloading...' : '⬇️ Download New Audio'}
        </button>
        <button className="btn btn-secondary" onClick={resetAll}>↺ Reset</button>
      </div>

      {/* Audio Player */}
      <div className="audio-player-wrap">
        <audio ref={audioPlayerRef} controls src={playerUrl || ''}></audio>
      </div>

      <div className="footnote">
        💡 Speed changes the playback time. Download to save the new audio as WAV.
      </div>
    </div>
  );
}

export default AudioAdjuster;