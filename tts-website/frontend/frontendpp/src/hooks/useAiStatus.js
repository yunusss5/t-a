// src/hooks/useAiStatus.js
// Whether a model is connected, resolved once per page and shared by every AI
// surface. The status call never rejects (see lib/ai.js), so there is no error
// state here — "off, and here is why" is a value, not a failure.

import { useCallback, useEffect, useRef, useState } from 'react';
import { aiStatus } from '../lib/ai';

export function useAiStatus() {
  const [status, setStatus] = useState(null);
  const [checking, setChecking] = useState(true);

  // A status answer arriving after the page has moved on is not worth a warning
  // in someone's console, so the setters are gated on this rather than on a
  // per-call flag: `refresh` has no cleanup of its own to hang one from.
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const adopt = useCallback((result) => {
    if (!alive.current) return;
    setStatus(result);
    setChecking(false);
  }, []);

  // `checking` starts true, so the mount effect only has to ask — no state is
  // set synchronously here, which keeps this to one render per answer.
  useEffect(() => {
    aiStatus().then(adopt);
  }, [adopt]);

  /** Re-ask the server — wired to a visible "check again" button. */
  const refresh = useCallback(() => {
    setChecking(true);
    aiStatus({ refresh: true }).then(adopt);
  }, [adopt]);

  return {
    status,
    checking,
    refresh,
    enabled: !!status?.enabled,
    tasks: status?.tasks || [],
    tones: status?.tones || [],
    maxChars: status?.max_input_chars || 0,
  };
}
