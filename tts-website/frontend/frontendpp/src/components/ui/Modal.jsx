// src/components/ui/Modal.jsx
// One dialog implementation for the whole app.
//
// Everything a dialog owes the user is here rather than repeated per modal:
// a labelled `aria-modal` container, focus moved in and restored on close,
// Tab held inside, Escape and scrim-click to dismiss, the page behind locked
// against scrolling, and enter/exit motion that reduced-motion turns off.

import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import useFocusTrap from '../../hooks/useFocusTrap';
import useScrollLock from '../../hooks/useScrollLock';
import { cx } from '../../lib/utils';

export default function Modal({
  open,
  onClose,
  title,
  lead,
  children,
  footer,
  labelledBy,
  size = 'md',
  className,
}) {
  const sheetRef = useRef(null);
  const generatedId = useId();
  const titleId = labelledBy || `${generatedId}-title`;
  const reduceMotion = useReducedMotion();

  useFocusTrap(sheetRef, open);
  useScrollLock(open);

  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      // Stopping propagation keeps one Escape from also closing whatever is
      // behind this dialog.
      event.stopPropagation();
      onClose();
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open, onClose]);

  // Portalled to <body>: a dialog nested inside the shell inherits its
  // transforms and stacking context, which is how modals end up clipped.
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="modal-layer">
          <motion.div
            className="modal-scrim"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.18 }}
          />

          <motion.div
            ref={sheetRef}
            className={cx('modal-sheet', `modal-${size}`, className)}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            tabIndex={-1}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: reduceMotion ? 0 : 0.24, ease: [0.16, 1, 0.3, 1] }}
          >
            <button
              type="button"
              className="icon-btn modal-close"
              onClick={onClose}
              aria-label="Close dialog"
            >
              <X size={16} />
            </button>

            {title && <h2 id={titleId}>{title}</h2>}
            {lead && <p className="modal-lead">{lead}</p>}
            {children}
            {footer && <div className="modal-foot">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
