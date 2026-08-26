// src/hooks/useSoundTouch.js
import { useState, useEffect, useCallback } from 'react';

export function useSoundTouch() {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    // If already loaded globally
    if (window.SoundTouch) {
      setIsReady(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/soundtouch/1.0.0/soundtouch.min.js';
    script.async = true;

    script.onload = () => {
      if (window.SoundTouch) {
        setIsReady(true);
      } else {
        setError('SoundTouch loaded but not available globally');
      }
    };

    script.onerror = () => {
      setError('Failed to load SoundTouch library. Please check your internet connection.');
    };

    document.head.appendChild(script);

    return () => {
      // Cleanup – remove script if it hasn't loaded yet
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, []);

  const stretch = useCallback(async (audioBuffer, targetDuration) => {
    if (!isReady) {
      throw new Error('SoundTouch library is not ready yet. Please wait.');
    }

    const actualDuration = audioBuffer.duration;
    if (actualDuration <= 0) {
      throw new Error('Invalid audio duration');
    }

    const speed = actualDuration / targetDuration;

    // If speed is ~1, return original buffer
    if (Math.abs(speed - 1) < 0.001) {
      return audioBuffer;
    }

    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const length = audioBuffer.length;

    // Interleave channels (SoundTouch expects interleaved float32 array)
    const channelData = [];
    for (let ch = 0; ch < numChannels; ch++) {
      channelData.push(audioBuffer.getChannelData(ch));
    }

    const interleaved = new Float32Array(length * numChannels);
    for (let i = 0; i < length; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        interleaved[i * numChannels + ch] = channelData[ch][i];
      }
    }

    // Process with SoundTouch
    const st = new window.SoundTouch();
    st.init(sampleRate, numChannels);
    st.setTempo(speed);
    const output = st.process(interleaved);

    // Deinterleave
    const outLength = output.length / numChannels;
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const outBuffer = audioCtx.createBuffer(numChannels, outLength, sampleRate);

    for (let ch = 0; ch < numChannels; ch++) {
      const outChannel = outBuffer.getChannelData(ch);
      for (let i = 0; i < outLength; i++) {
        outChannel[i] = output[i * numChannels + ch];
      }
    }

    return outBuffer;
  }, [isReady]);

  return { isReady, error, stretch };
}