// src/components/ui/Primitives.jsx
// Layout + input building blocks every tool page is assembled from.

import { createContext, useContext, useEffect, useId, useMemo, useRef } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { cx } from '../../lib/utils';

/**
 * A glass card. `title`/`hint` render an optional header row.
 *
 * The title is an h2 because a panel sits directly under the tool page's single
 * h1 — an h3 there would skip a level, which is what a screen reader's heading
 * outline is built from. `headingLevel` is for the rare nested panel.
 */
export function Panel({ title, hint, actions, className, headingLevel = 2, children, ...rest }) {
  const Heading = `h${headingLevel}`;

  return (
    <section className={cx('panel', className)} {...rest}>
      {(title || actions) && (
        <header className="panel-head">
          <div>
            {title && <Heading className="panel-title">{title}</Heading>}
            {hint && <p className="panel-hint">{hint}</p>}
          </div>
          {actions && <div className="panel-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

/**
 * How a Field reaches the control it labels.
 *
 * A visible label that is not wired to its input is decoration: the field has no
 * accessible name, clicking the text does not focus the control, and a screen
 * reader announces "edit text, blank". Threading an id by hand through 60-odd
 * call sites is the kind of thing that gets forgotten once and then stays
 * forgotten, so the Field mints one and the control below claims it.
 *
 * `controlId` is for a labelable element (input, textarea, select). `labelId` is
 * for a composite — a radiogroup has no `for` target, so it points back at the
 * label with aria-labelledby instead.
 *
 * A Field labels exactly one control. Give a second one its own Field, or pass
 * `htmlFor` explicitly, rather than sharing an id between two elements.
 */
const FieldContext = createContext(null);

function useControlId(explicitId) {
  const field = useContext(FieldContext);
  return explicitId || field?.controlId;
}

/** Labelled form row. */
export function Field({ label, hint, htmlFor, children, className }) {
  const generated = useId();
  const controlId = htmlFor || `${generated}c`;
  const labelId = label ? `${generated}l` : undefined;

  const wiring = useMemo(() => ({ controlId, labelId }), [controlId, labelId]);

  return (
    <FieldContext.Provider value={wiring}>
      <div className={cx('field', className)}>
        {label && (
          <label className="field-label" id={labelId} htmlFor={controlId}>
            {label}
            {hint && <span className="field-hint">{hint}</span>}
          </label>
        )}
        {children}
      </div>
    </FieldContext.Provider>
  );
}

/** Textarea with a live character counter. */
export function TextArea({
  value,
  onChange,
  rows = 10,
  maxLength,
  counter = true,
  id,
  'aria-describedby': describedBy,
  ...rest
}) {
  const counterId = useId();
  const controlId = useControlId(id);

  return (
    <div className="textarea-shell">
      <textarea
        id={controlId}
        className="ui-textarea"
        rows={rows}
        maxLength={maxLength}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        // The counter is positioned over the field's corner, so sighted users
        // read it as part of the control; describedby is how everyone else does.
        aria-describedby={cx(counter && counterId, describedBy) || undefined}
        {...rest}
      />
      {counter && (
        <span className="textarea-counter" id={counterId}>
          {value.length.toLocaleString()}
          {maxLength ? ` / ${maxLength.toLocaleString()}` : ' chars'}
        </span>
      )}
    </div>
  );
}

export function Input({ value, onChange, className, id, ...rest }) {
  const controlId = useControlId(id);

  return (
    <input
      id={controlId}
      className={cx('ui-input', className)}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      {...rest}
    />
  );
}

export function Select({ value, onChange, options, className, id, ...rest }) {
  const controlId = useControlId(id);

  return (
    <div className={cx('select-shell', className)}>
      <select
        id={controlId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        {...rest}
      >
        {options.map((option) => {
          const item = typeof option === 'string' ? { value: option, label: option } : option;
          return (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          );
        })}
      </select>
    </div>
  );
}

/**
 * Slider with its value shown beside it.
 *
 * The read-out is markup rather than a CSS pseudo-element so it is announced
 * too, and `aria-valuetext` carries the unit — "512 pixels" rather than "512",
 * which is what a bare range reports.
 */
export function Range({ value, onChange, min = 0, max = 100, step, suffix = '', id, ...rest }) {
  const controlId = useControlId(id);
  const text = `${value}${suffix}`;

  return (
    <div className="range-row">
      <input
        id={controlId}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={suffix ? text : undefined}
        onChange={(event) => onChange(Number(event.target.value))}
        {...rest}
      />
      <span className="range-value">{text}</span>
    </div>
  );
}

/**
 * Pill-style single-choice control.
 *
 * A radiogroup, not a tablist: these switch a mode or a unit, and none of them
 * controls a tabpanel. That also buys the expected keyboard model — one tab
 * stop for the group, arrow keys to move between options — which the previous
 * all-buttons-are-tab-stops version did not have.
 */
export function Segmented({ value, onChange, options, size = 'md', label }) {
  const items = options.map((option) =>
    typeof option === 'string' ? { value: option, label: option } : option,
  );
  const groupRef = useRef(null);
  const selected = items.findIndex((item) => item.value === value);

  // Inside a Field the visible label is the group's name. A radiogroup cannot be
  // the target of `for`, so it is named by reference instead of by duplicating
  // the text into an aria-label that could then drift from what is on screen.
  const field = useContext(FieldContext);
  const labelledBy = !label && field?.labelId ? field.labelId : undefined;

  const move = (event) => {
    const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    const step = keys[event.key];
    if (!step) return;

    event.preventDefault();
    const next = (selected + step + items.length) % items.length;
    onChange(items[next].value);

    // Selection follows focus in a radiogroup, so the focus has to follow too.
    // Addressed by position rather than by value: an option value is arbitrary
    // text, and an attribute selector built from arbitrary text is a selector
    // that can be malformed.
    groupRef.current?.querySelectorAll('.segmented-item')[next]?.focus();
  };

  // Below ~400px a seven-option row is wider than the screen and `.segmented`
  // becomes a scrollport with its scrollbar hidden. If the selected option
  // starts outside it the control looks like nothing is selected at all, so
  // bring it into view. Written as scrollLeft arithmetic rather than
  // scrollIntoView, which also scrolls every ancestor — including the page.
  useEffect(() => {
    const group = groupRef.current;
    const item = group?.querySelectorAll('.segmented-item')[selected];
    if (!group || !item || group.scrollWidth <= group.clientWidth) return;

    const groupBox = group.getBoundingClientRect();
    const itemBox = item.getBoundingClientRect();

    if (itemBox.left < groupBox.left) {
      group.scrollLeft -= groupBox.left - itemBox.left;
    } else if (itemBox.right > groupBox.right) {
      group.scrollLeft += itemBox.right - groupBox.right;
    }
  }, [selected]);

  return (
    <div
      ref={groupRef}
      className={cx('segmented', `segmented-${size}`)}
      role="radiogroup"
      aria-label={label}
      aria-labelledby={labelledBy}
      onKeyDown={move}
    >
      {items.map((item, index) => {
        const active = item.value === value;

        return (
          <button
            key={item.value}
            type="button"
            role="radio"
            aria-checked={active}
            // When the current value matches no option — a preset row next to a
            // free-text field — the group would otherwise have no tab stop at
            // all, so the first option holds it.
            tabIndex={active || (selected === -1 && index === 0) ? 0 : -1}
            data-value={item.value}
            className={cx('segmented-item', active && 'active')}
            onClick={() => onChange(item.value)}
          >
            {item.icon}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

/** Primary / ghost / soft action button with a built-in loading state. */
export function Button({ variant = 'primary', loading, icon, children, className, ...rest }) {
  return (
    <button
      type="button"
      className={cx('ui-btn', `ui-btn-${variant}`, className)}
      disabled={loading || rest.disabled}
      // Disabled alone says "unavailable"; aria-busy is what says "working".
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <Loader2 className="spin" size={16} aria-hidden="true" />
      ) : (
        icon
      )}
      {children}
    </button>
  );
}

export function EmptyState({ icon, title, children }) {
  return (
    <div className="empty-state">
      {icon && <div className="empty-icon">{icon}</div>}
      <p className="empty-title">{title}</p>
      {children && <p className="empty-body">{children}</p>}
    </div>
  );
}

/** Two-column layout: inputs on the left, results on the right. */
export function ToolGrid({ children, className }) {
  return <div className={cx('tool-grid', className)}>{children}</div>;
}

/* ----------------------------------------------------------- State feedback ---- */

const ALERT_ROLE = { danger: 'alert', warning: 'alert', info: 'status', success: 'status' };

/**
 * Inline message for an error, a warning or a confirmation.
 *
 * `role="alert"` interrupts a screen reader, which is right for a failure and
 * wrong for a hint, so the role follows the tone rather than being fixed.
 */
export function Alert({ tone = 'info', title, icon, children, className }) {
  return (
    <div className={cx('alert', `alert-${tone}`, className)} role={ALERT_ROLE[tone] || 'status'}>
      {icon && (
        <span className="alert-icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <div className="alert-body">
        {title && <strong className="alert-title">{title}</strong>}
        {children && <span className="alert-text">{children}</span>}
      </div>
    </div>
  );
}

/**
 * The one-line failure message that sits under a tool's action row.
 *
 * A component rather than eleven copies of `{error && <p className="error-note">}`
 * so `role="alert"` is guaranteed: without it, pressing Generate with an empty
 * field looks to a screen-reader user like a button that does nothing at all.
 * Renders nothing when there is no message, so callers pass the value straight
 * in and drop the guard.
 */
export function ErrorNote({ children, className }) {
  if (!children) return null;

  return (
    <p className={cx('error-note', className)} role="alert">
      {children}
    </p>
  );
}

/**
 * Loading placeholder. Give it the size of the content it stands in for —
 * a skeleton that is not the same box as the real thing causes the exact layout
 * shift it exists to avoid.
 */
export function Skeleton({ width, height, radius, className, style }) {
  return (
    <span
      className={cx('skeleton', className)}
      style={{ width, height, borderRadius: radius, ...style }}
      aria-hidden="true"
    />
  );
}

/** N shimmering lines, for a paragraph or a list that has not arrived yet. */
export function SkeletonText({ lines = 3, label = 'Loading' }) {
  return (
    <div className="skeleton-stack" role="status" aria-label={label}>
      {Array.from({ length: lines }, (_, index) => (
        <span key={index} className="skeleton skeleton-text" />
      ))}
    </div>
  );
}

/** Determinate progress / strength bar. */
export function Meter({ value, max = 100, label, tone, className }) {
  const pct = Math.max(0, Math.min(100, (Number(value) / max) * 100));

  return (
    <div
      className={cx('meter', tone && `meter-${tone}`, className)}
      role="meter"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className="meter-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Checkbox rendered as a track-and-knob toggle. */
export function Switch({ checked, onChange, label, hint, disabled }) {
  return (
    <label className={cx('switch', disabled && 'is-disabled')}>
      {/* A real checkbox, visually hidden: it brings the role, the state, the
          keyboard behaviour and form participation for free. */}
      <input
        type="checkbox"
        className="switch-input"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="switch-track" aria-hidden="true">
        <span className="switch-knob" />
      </span>
      <span className="switch-text">
        {label}
        {hint && <small>{hint}</small>}
      </span>
    </label>
  );
}

/**
 * Checkbox with a drawn box, for an option that applies on the next action.
 *
 * A Switch reads as "this is on now"; these sit in a group above a Generate
 * button and read as "include this next time", which is what a checkbox is for.
 * The native input is hidden the same way it is in Switch, so the box below can
 * carry the app's focus ring rather than the browser's — and the row is a 44px
 * target, label included, because these are often stacked five deep.
 */
export function Checkbox({ checked, onChange, label, hint, disabled }) {
  return (
    <label className={cx('check', disabled && 'is-disabled')}>
      <input
        type="checkbox"
        className="check-input"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="check-box" aria-hidden="true">
        <Check size={13} strokeWidth={3.25} />
      </span>
      <span className="check-text">
        {label}
        {hint && <small>{hint}</small>}
      </span>
    </label>
  );
}
