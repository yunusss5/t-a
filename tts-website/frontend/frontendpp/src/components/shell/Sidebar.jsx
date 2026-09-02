// src/components/shell/Sidebar.jsx
import { useEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutGrid, Star, X } from 'lucide-react';
import { CATEGORIES, TOOLS, getTool } from '../../tools/registry';
import { cx } from '../../lib/utils';
import useFocusTrap from '../../hooks/useFocusTrap';
import useMediaQuery from '../../hooks/useMediaQuery';

// Matches the breakpoint in shell.css where the rail becomes an overlay drawer.
const DRAWER_QUERY = '(max-width: 900px)';

/**
 * Persistent left rail. On mobile it slides in as an overlay, driven by the
 * `open` prop from AppShell.
 */
export default function Sidebar({ open, onClose, favourites = [] }) {
  const favouriteTools = favourites.map(getTool).filter(Boolean);
  const panelRef = useRef(null);
  const closeRef = useRef(null);

  // A translated-off drawer is still in the tab order, so a keyboard user
  // tabbing the page walks 20-odd invisible links. `inert` removes the whole
  // subtree from focus and the a11y tree — but only while it *is* a drawer,
  // since on desktop the same element is the permanent, always-usable rail.
  const isDrawer = useMediaQuery(DRAWER_QUERY);

  // Open on a phone it is a modal overlay; on a desktop the identical element is
  // page furniture. Only the first is a dialog, and only the first is trapped.
  const isModal = isDrawer && open;

  useFocusTrap(panelRef, isModal);

  // Focus has to move into the drawer, or Tab keeps walking the page behind the
  // scrim — invisible to the person doing it. The close button is the first stop
  // rather than the first of 23 links, so the way out is what gets announced;
  // preventScroll keeps the browser from scrolling the panel mid-slide, and
  // useFocusTrap hands focus back to the menu button on close.
  useEffect(() => {
    if (isModal) closeRef.current?.focus({ preventScroll: true });
  }, [isModal]);

  return (
    <>
      <div
        className={cx('sidebar-scrim', open && 'visible')}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        id="app-sidebar"
        ref={panelRef}
        className={cx('sidebar', open && 'open')}
        inert={isDrawer && !open}
        // Announced as a modal only while it behaves like one. On desktop it
        // stays a plain complementary landmark.
        role={isModal ? 'dialog' : undefined}
        aria-modal={isModal ? 'true' : undefined}
        aria-label="Tool navigation"
      >
        <div className="sidebar-head">
          <NavLink to="/" className="brand" onClick={onClose}>
            <span className="brand-mark">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M11 5L6 9H2v6h4l5 4V5Z" fill="currentColor" />
                <path
                  d="M15.5 8.5a5 5 0 0 1 0 7M18.4 5.6a9 9 0 0 1 0 12.8"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <span className="brand-text">
              <strong>VoiceForge</strong>
              <small>Creator Toolkit</small>
            </span>
          </NavLink>

          <button
            type="button"
            ref={closeRef}
            className="icon-btn sidebar-close"
            onClick={onClose}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="sidebar-nav">
          <NavLink
            to="/"
            end
            className={({ isActive }) => cx('side-link', 'side-link-home', isActive && 'active')}
            onClick={onClose}
          >
            <LayoutGrid size={17} />
            All tools
            <span className="side-count">{TOOLS.length}</span>
          </NavLink>

          {favouriteTools.length > 0 && (
            <div className="side-group">
              <p className="side-group-label">
                <Star size={12} /> Favourites
              </p>
              {favouriteTools.map((tool) => (
                <SideTool key={tool.id} tool={tool} onClose={onClose} />
              ))}
            </div>
          )}

          {CATEGORIES.map((category) => {
            const tools = TOOLS.filter((tool) => tool.category === category.id);
            if (!tools.length) return null;

            return (
              <div className="side-group" key={category.id}>
                <p className="side-group-label">{category.label}</p>
                {tools.map((tool) => (
                  <SideTool key={tool.id} tool={tool} onClose={onClose} />
                ))}
              </div>
            );
          })}
        </nav>

        <div className="sidebar-foot">
          <p>Free · no sign-up · nothing stored on our servers</p>
        </div>
      </aside>
    </>
  );
}

function SideTool({ tool, onClose }) {
  const Icon = tool.icon;

  return (
    <NavLink
      to={`/tools/${tool.id}`}
      className={({ isActive }) => cx('side-link', isActive && 'active')}
      onClick={onClose}
      title={tool.tagline}
      data-accent={tool.accent}
    >
      <Icon size={16} className="side-link-icon" />
      <span className="side-link-text">{tool.name}</span>
    </NavLink>
  );
}
