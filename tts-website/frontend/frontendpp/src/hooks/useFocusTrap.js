// src/hooks/useFocusTrap.js
import { useEffect } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Keeps Tab inside an open overlay and hands focus back where it came from.
 *
 * Without this a keyboard user tabs straight out of a dialog and starts
 * operating the page behind it, which is invisible to them — the dialog still
 * looks focused. On close, focus returns to the element that opened the
 * overlay; dropping focus to `<body>` instead would send a screen reader back
 * to the top of the document.
 *
 * @param {React.RefObject<HTMLElement>} ref container to trap within
 * @param {boolean} active whether the trap is engaged
 */
export default function useFocusTrap(ref, active = true) {
  useEffect(() => {
    if (!active) return undefined;

    const container = ref.current;
    if (!container) return undefined;

    const previous = document.activeElement;

    const onKeyDown = (event) => {
      if (event.key !== 'Tab') return;

      const items = Array.from(container.querySelectorAll(FOCUSABLE)).filter(
        (node) => node.offsetParent !== null || node === document.activeElement,
      );

      // Nothing focusable inside: hold focus on the container so Tab cannot
      // walk into the page underneath.
      if (items.length === 0) {
        event.preventDefault();
        container.focus?.();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (!container.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      }
    };

    container.addEventListener('keydown', onKeyDown);

    return () => {
      container.removeEventListener('keydown', onKeyDown);
      // Only restore if the opener is still in the document and focus has not
      // already moved somewhere deliberate (a route change, say).
      if (previous instanceof HTMLElement && previous.isConnected) {
        previous.focus({ preventScroll: true });
      }
    };
  }, [ref, active]);
}
