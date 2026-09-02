// src/hooks/useMediaQuery.js
import { useCallback, useMemo, useSyncExternalStore } from 'react';

/**
 * Subscribes to a media query and re-renders on change.
 *
 * `useSyncExternalStore` rather than `useState` + `useEffect`: matchMedia *is*
 * an external store, so this reads the live value during render instead of
 * painting a wrong first frame and correcting it. The server snapshot returns
 * false because the static prerender is desktop-first.
 */
export default function useMediaQuery(query) {
  const list = useMemo(
    () => (typeof window === 'undefined' ? null : window.matchMedia(query)),
    [query],
  );

  const subscribe = useCallback(
    (onChange) => {
      if (!list) return () => {};
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [list],
  );

  return useSyncExternalStore(
    subscribe,
    () => (list ? list.matches : false),
    () => false,
  );
}
