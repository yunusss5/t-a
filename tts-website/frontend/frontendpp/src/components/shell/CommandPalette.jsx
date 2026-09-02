// src/components/shell/CommandPalette.jsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { CornerDownLeft, Search } from 'lucide-react';
import { searchTools, TOOLS } from '../../tools/registry';
import { cx } from '../../lib/utils';
import useFocusTrap from '../../hooks/useFocusTrap';

/** Ctrl/⌘+K launcher. Arrow keys move, Enter opens, Escape closes. */
export default function CommandPalette({ open, onClose }) {
  // The body only exists while the palette is open, so its query and cursor
  // reset on unmount instead of needing an effect to clear them.
  return <AnimatePresence>{open && <PaletteBody onClose={onClose} />}</AnimatePresence>;
}

function PaletteBody({ onClose }) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef(null);
  const dialogRef = useRef(null);
  const listRef = useRef(null);
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();

  const results = useMemo(() => searchTools(query).slice(0, 8), [query]);
  const activeId = results[cursor] ? `palette-opt-${results[cursor].id}` : undefined;

  useFocusTrap(dialogRef);

  // Wait for the mount animation so focus doesn't fight the transform.
  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), reduceMotion ? 0 : 60);
    return () => clearTimeout(timer);
  }, [reduceMotion]);

  // Keep the highlighted row visible when the arrow keys walk past the fold.
  useEffect(() => {
    listRef.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  const search = (value) => {
    setQuery(value);
    setCursor(0);
  };

  const choose = (tool) => {
    if (!tool) return;
    navigate(`/tools/${tool.id}`);
    onClose();
  };

  const handleKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setCursor((current) => (current + 1) % Math.max(1, results.length));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setCursor((current) => (current - 1 + results.length) % Math.max(1, results.length));
    } else if (event.key === 'Home') {
      event.preventDefault();
      setCursor(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setCursor(Math.max(0, results.length - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose(results[cursor]);
    } else if (event.key === 'Escape') {
      onClose();
    }
  };

  return (
    <motion.div
      className="palette-scrim"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.16 }}
      onClick={onClose}
    >
      <motion.div
        ref={dialogRef}
        className="palette"
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -14, scale: 0.98 }}
        animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.98 }}
        transition={{ duration: reduceMotion ? 0.12 : 0.2, ease: [0.16, 1, 0.3, 1] }}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Search tools"
      >
        <div className="palette-input">
          <Search size={17} aria-hidden="true" />
          {/* Combobox + listbox rather than a plain input: it is the only way a
              screen reader is told which row the arrow keys have landed on,
              since focus itself never leaves the text field. */}
          <input
            ref={inputRef}
            value={query}
            placeholder={`Search ${TOOLS.length} tools…`}
            onChange={(event) => search(event.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="Search tools"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-results"
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck="false"
          />
          <kbd>esc</kbd>
        </div>

        <div
          className="palette-results"
          id="palette-results"
          role="listbox"
          aria-label="Tools"
          ref={listRef}
        >
          {results.length === 0 && <p className="palette-empty">No tool matches “{query}”.</p>}

          {results.map((tool, index) => {
            const Icon = tool.icon;

            return (
              <button
                key={tool.id}
                id={`palette-opt-${tool.id}`}
                type="button"
                role="option"
                aria-selected={index === cursor}
                tabIndex={-1}
                className={cx('palette-item', index === cursor && 'active')}
                onMouseEnter={() => setCursor(index)}
                onClick={() => choose(tool)}
                data-accent={tool.accent}
              >
                <span className="palette-icon">
                  <Icon size={16} />
                </span>
                <span className="palette-text">
                  <strong>{tool.name}</strong>
                  <small>{tool.tagline}</small>
                </span>
                <CornerDownLeft size={14} className="palette-enter" aria-hidden="true" />
              </button>
            );
          })}
        </div>

        <p className="sr-only" aria-live="polite">
          {results.length} {results.length === 1 ? 'tool' : 'tools'} found
        </p>
      </motion.div>
    </motion.div>
  );
}
