// src/components/Header.jsx
import React from 'react';

function Header({ darkMode, toggleDarkMode, openAbout, currentPage, setCurrentPage }) {
  return (
    <header className="app-header">
      <div className="header-left">
        <div className="logo-badge">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path d="M11 5L6 9H2V15H6L11 19V5Z" fill="currentColor"/>
            <path d="M15.54 8.46C16.4774 9.39764 17.004 10.6692 17.004 11.995C17.004 13.3208 16.4774 14.5924 15.54 15.53" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            <path d="M18.36 5.64C20.0975 7.37764 21.0748 9.73443 21.0748 12.195C21.0748 14.6556 20.0975 17.0124 18.36 18.75" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity="0.6"/>
          </svg>
          <span className="app-name">VoiceForge</span>
        </div>
      </div>

      <nav className="header-nav">
        <button
          className={`nav-link ${currentPage === 'home' ? 'active' : ''}`}
          onClick={() => setCurrentPage('home')}
        >
          Home
        </button>
        <button
          className={`nav-link ${currentPage === 'tikri' ? 'active' : ''}`}
          onClick={() => setCurrentPage('tikri')}
        >
          Tikri AI
        </button>
        <button className="nav-link about" onClick={openAbout}>
          About
        </button>
      </nav>

      <div className="header-right">
        <button className="theme-toggle" onClick={toggleDarkMode} aria-label="Toggle theme">
          {darkMode ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="5" />
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </button>
      </div>
    </header>
  );
}

export default Header;