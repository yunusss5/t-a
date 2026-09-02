// src/components/shell/AppShell.jsx
import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Heart, Menu, Moon, Search, Sun } from 'lucide-react';
import Sidebar from './Sidebar';
import CommandPalette from './CommandPalette';
import SupportModal from './SupportModal';
import useLocalStorage from '../../hooks/useLocalStorage';
import useScrollLock from '../../hooks/useScrollLock';

// Kept in step with the two canvas colours in tokens.css so the mobile browser
// chrome matches the page instead of framing it in white.
const THEME_COLOR = { light: '#f7f7fa', dark: '#0d0c12' };

// The inline script in index.html already resolved the theme before the first
// paint — stored value, else the OS preference. Seeding from its answer keeps
// React's first render in agreement with what is already on screen; defaulting
// to 'light' here would flash a dark-mode visitor white on every load.
const INITIAL_THEME =
  typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark'
    ? 'dark'
    : 'light';

/**
 * Chrome shared by every page: ambient background, sidebar, top bar, command
 * palette and the theme toggle. Children render inside the scrolling main area.
 */
export default function AppShell({ children, favourites }) {
  const [theme, setTheme] = useLocalStorage('vf.theme', INITIAL_THEME);
  const [menuOpen, setMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const location = useLocation();

  useScrollLock(menuOpen || paletteOpen || supportOpen);

  // One theming hook for the whole app: every token in tokens.css keys off
  // `:root[data-theme]`, so nothing else has to know the theme.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', THEME_COLOR[theme] || THEME_COLOR.light);
  }, [theme]);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }

      // Escape closes the drawer; the palette and modal handle their own.
      if (event.key === 'Escape') setMenuOpen(false);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Jump to the top on navigation. Instantly, not smoothly: a smooth scroll on
  // a route change animates past content that is already gone. The mobile
  // drawer closes itself — every Sidebar link calls onClose.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [location.pathname]);

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <div className="ambient" aria-hidden="true">
        <span className="orb orb-1" />
        <span className="orb orb-2" />
        <span className="orb orb-3" />
        <span className="grid-veil" />
      </div>

      <Sidebar open={menuOpen} onClose={closeMenu} favourites={favourites} />

      <div className="shell-main">
        <header className="topbar">
          <button
            type="button"
            className="icon-btn topbar-menu"
            onClick={() => setMenuOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={menuOpen}
            aria-controls="app-sidebar"
          >
            <Menu size={18} />
          </button>

          <Link to="/" className="topbar-brand">
            VoiceForge
          </Link>

          <button
            type="button"
            className="palette-trigger"
            onClick={() => setPaletteOpen(true)}
            aria-label="Search tools"
          >
            <Search size={15} />
            <span>Search tools</span>
            <kbd>Ctrl</kbd>
            <kbd>K</kbd>
          </button>

          <div className="topbar-actions">
            <button
              type="button"
              className="ui-btn ui-btn-soft support-btn"
              onClick={() => setSupportOpen(true)}
            >
              <Heart size={15} />
              <span>Support</span>
            </button>

            <button
              type="button"
              className="icon-btn"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </header>

        <main className="shell-content" id="main">
          {children}
        </main>

        <footer className="shell-footer">
          <span>VoiceForge Creator Toolkit · © {new Date().getFullYear()} Tikri AI</span>
          <span className="footer-note">
            Files are processed in your browser or streamed straight back — nothing is kept.
          </span>
        </footer>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <SupportModal open={supportOpen} onClose={() => setSupportOpen(false)} />
    </div>
  );
}
