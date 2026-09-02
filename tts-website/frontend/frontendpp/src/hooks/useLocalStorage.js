// src/hooks/useLocalStorage.js
import { useCallback, useEffect, useState } from 'react';

/**
 * useState that persists to localStorage. Used for the theme, recent tools,
 * favourites and the notepad — anything that should survive a refresh.
 */
export default function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const stored = window.localStorage.getItem(key);
      return stored === null ? initialValue : JSON.parse(stored);
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Private mode / quota exceeded — the app still works, it just won't persist.
    }
  }, [key, value]);

  const reset = useCallback(() => setValue(initialValue), [initialValue]);

  return [value, setValue, reset];
}
