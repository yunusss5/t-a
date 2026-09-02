// src/components/ui/Display.jsx
// Read-only result components: copy rows, chip lists, stats, score ring, dropzone.

import { useId, useRef, useState } from 'react';
import { Check, Copy, UploadCloud } from 'lucide-react';
import { copyText, cx, formatBytes } from '../../lib/utils';

/** A value with a copy button — the workhorse of the SEO output. */
export function CopyRow({ label, value, meta, multiline = false, tone }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const ok = await copyText(value, `${label || 'Text'} copied`);
    if (!ok) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className={cx('copy-row', multiline && 'copy-row-block', tone && `tone-${tone}`)}>
      <div className="copy-row-body">
        {label && <span className="copy-row-label">{label}</span>}
        <span className={cx('copy-row-value', multiline && 'pre')}>{value}</span>
        {meta && <span className="copy-row-meta">{meta}</span>}
      </div>
      <button type="button" className="icon-btn" onClick={handleCopy} aria-label={`Copy ${label || 'value'}`}>
        {copied ? <Check size={15} /> : <Copy size={15} />}
      </button>
    </div>
  );
}

/** Clickable chips (hashtags, keywords). Clicking one copies it. */
export function Chips({ items, onItemClick, tone = 'accent', empty = 'Nothing found yet.' }) {
  if (!items?.length) return <p className="muted-line">{empty}</p>;

  return (
    <div className="chip-wrap">
      {items.map((item, index) => {
        const label = typeof item === 'string' ? item : item.label;
        const badge = typeof item === 'string' ? null : item.badge;

        return (
          <button
            key={`${label}-${index}`}
            type="button"
            className={cx('chip', `chip-${tone}`)}
            onClick={() => (onItemClick ? onItemClick(label) : copyText(label, 'Copied'))}
            title="Click to copy"
            aria-label={onItemClick ? label : `Copy ${label}`}
          >
            {label}
            {badge != null && <span className="chip-badge">{badge}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** A single number with a caption. */
export function Stat({ label, value, hint, tone }) {
  return (
    <div className={cx('stat', tone && `stat-${tone}`)}>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
      {hint && <span className="stat-hint">{hint}</span>}
    </div>
  );
}

export function StatRow({ children }) {
  return <div className="stat-row">{children}</div>;
}

/** Circular 0–100 score gauge, drawn with an SVG stroke-dash trick. */
export function ScoreRing({ score, label = 'SEO score', size = 128 }) {
  const value = Math.max(0, Math.min(100, Math.round(score || 0)));
  const radius = (size - 14) / 2;
  const circumference = 2 * Math.PI * radius;
  const tone = value >= 80 ? 'good' : value >= 55 ? 'ok' : 'low';

  return (
    <div
      className={cx('score-ring', `score-${tone}`)}
      style={{ width: size }}
      // The ring is a picture of a number; role="meter" is what makes the
      // number itself available, and the SVG becomes decoration.
      role="meter"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="ring-track" cx={size / 2} cy={size / 2} r={radius} strokeWidth="9" fill="none" />
        <circle
          className="ring-value"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth="9"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - value / 100)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="score-center">
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}

/** Pass/fail checklist rendered under the score ring. */
export function CheckList({ checks }) {
  return (
    <ul className="check-list">
      {checks.map((check) => (
        <li key={check.label} className={check.passed ? 'pass' : 'fail'}>
          {/* The glyph is a colour-coded shorthand; the words behind it are what
              a screen reader reads, so pass/fail is never colour-only. */}
          <span className="check-mark" aria-hidden="true">
            {check.passed ? '✓' : '!'}
          </span>
          <span className="sr-only">{check.passed ? 'Passed: ' : 'Needs work: '}</span>
          {check.label}
        </li>
      ))}
    </ul>
  );
}

/** Drag-and-drop file picker. */
export function Dropzone({ file, onFile, accept, hint, icon, label = 'Choose a file' }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const hintId = useId();

  const pick = (candidate) => {
    if (candidate) onFile(candidate);
  };

  return (
    <>
      <div
        className={cx('dropzone', dragging && 'dragging', file && 'has-file')}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          pick(event.dataTransfer.files?.[0]);
        }}
        role="button"
        tabIndex={0}
        aria-label={label}
        aria-describedby={hintId}
        // Space as well as Enter: a native button fires on both, and this stands
        // in for one. Space also has to be prevented or the page scrolls.
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          inputRef.current?.click();
        }}
      >
        <div className="dropzone-icon" aria-hidden="true">
          {icon || <UploadCloud size={26} />}
        </div>
        <p className="dropzone-title">{file ? file.name : 'Drop a file here, or click to browse'}</p>
        <p className="dropzone-hint" id={hintId}>
          {file ? formatBytes(file.size) : hint}
        </p>
      </div>
      {/* Announced separately: the title above changes silently for anyone who
          is not watching it. */}
      <p className="sr-only" aria-live="polite">
        {file ? `Selected ${file.name}, ${formatBytes(file.size)}` : ''}
      </p>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        hidden
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => pick(event.target.files?.[0])}
      />
    </>
  );
}

// Re-exported so tools can pull every result component from one module.
export { EmptyState } from './Primitives';
