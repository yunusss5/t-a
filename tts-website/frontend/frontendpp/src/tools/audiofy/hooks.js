// src/tools/audiofy/hooks.js
// Non-visual shared state for the Audiofy suite: constants, formatting, the
// AudioContext owner and the file-loading state machine. Kept apart from
// toolkit.jsx so that file can be pure components (fast-refresh requires it).
// (Distinct file names also matter: toolkit.js + toolkit.jsx in one folder made
// the extension-less './toolkit' specifier ambiguous and killed the build.)

import { useCallback, useEffect, useRef, useState } from 'react';
import { decodeAudioFile, waveformData } from '../../lib/audiofy';
import { formatBytes } from '../../lib/utils';

/** 100 MB, matching the suite's advertised cap. Memory, not bandwidth, is the
    real ceiling: decoding turns files into raw 32-bit floats in the tab. */
export const MAX_FILE_BYTES = 100 * 1024 * 1024;

// Peaks are pure per-buffer, so the cache outlives individual tools: a revisit
// inside one session redraws instantly instead of re-scanning millions of
// samples — which is also what makes live drags affordable.
const peaksCache = new WeakMap();

/** Cached peak data for drawing — shared by Waveform and the image exporter. */
export function cachedPeaks(buffer) {
  let peaks = peaksCache.get(buffer);
  if (!peaks) {
    peaks = waveformData(buffer, 1200);
    peaksCache.set(buffer, peaks);
  }
  return peaks;
}

/** 1:23.45 — whole seconds hide the detail trimming decisions are made on. */
export function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00.00';
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const hundredths = Math.floor((seconds % 1) * 100);
  return `${minutes}:${String(secs).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
}

/**
 * One lazily-created AudioContext per mounted tool. Constructing one eagerly
 * wakes audio hardware on a page the visitor may never play anything on, and
 * closing it on unmount stops contexts leaking across suite navigation.
 */
export function useAudioContext() {
  const contextRef = useRef(null);

  useEffect(() => () => {
    contextRef.current?.close();
    contextRef.current = null;
  }, []);

  return useCallback(() => {
    if (!contextRef.current) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) throw new Error('This browser does not support the Web Audio API.');
      contextRef.current = new Ctor();
    }
    return contextRef.current;
  }, []);
}

/**
 * Load -> decode state machine shared by every file-based tool.
 * Returns { file, info, buffer, loading, error, load, reset }.
 */
export function useAudioFile(getContext, { maxSizeBytes = MAX_FILE_BYTES } = {}) {
  const [state, setState] = useState({ file: null, info: null, buffer: null, loading: false, error: '' });

  const load = useCallback(
    async (candidate) => {
      if (!candidate) return;

      if (candidate.size > maxSizeBytes) {
        setState((current) => ({
          ...current,
          file: null,
          info: null,
          buffer: null,
          error: `That file is ${formatBytes(candidate.size)}. The limit is ${formatBytes(maxSizeBytes)}.`,
        }));
        return;
      }

      setState({ file: candidate, info: null, buffer: null, loading: true, error: '' });

      try {
        const { buffer, info } = await decodeAudioFile(candidate, getContext());
        setState({ file: candidate, info, buffer, loading: false, error: '' });
      } catch (error) {
        setState({ file: null, info: null, buffer: null, loading: false, error: error.message });
      }
    },
    [getContext, maxSizeBytes],
  );

  const reset = useCallback(() => {
    setState({ file: null, info: null, buffer: null, loading: false, error: '' });
  }, []);

  return { ...state, load, reset };
}

/** Default parameter values straight from the schema. */
export function defaultParams(schema = []) {
  return Object.fromEntries(schema.map((param) => [param.key, param.defaultValue]));
}
