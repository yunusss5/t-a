// src/components/shell/Sidebar.test.jsx
// The same element is page furniture on a desktop and a modal overlay on a
// phone, and the difference is entirely invisible in the markup: role, inertness
// and where the focus goes. All three are the sort of thing that breaks without
// anything looking broken, which is why they are pinned here.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Sidebar from './Sidebar';

/** Drive useMediaQuery: `true` puts the shell below the 900px drawer breakpoint. */
function setViewportMatches(matches) {
  window.matchMedia = (query) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  });
}

function mount(props = {}) {
  const view = render(
    <MemoryRouter>
      <Sidebar open={false} onClose={() => {}} favourites={[]} {...props} />
    </MemoryRouter>,
  );

  return { ...view, panel: view.container.querySelector('#app-sidebar') };
}

afterEach(() => {
  setViewportMatches(false);
});

describe('Sidebar as a mobile drawer', () => {
  it('announces itself as a modal dialog once open', () => {
    setViewportMatches(true);
    const { panel } = mount({ open: true });

    expect(panel.getAttribute('role')).toBe('dialog');
    expect(panel.getAttribute('aria-modal')).toBe('true');
    expect(panel.getAttribute('aria-label')).toBe('Tool navigation');
  });

  it('takes itself out of the tab order while closed', () => {
    setViewportMatches(true);
    const { panel } = mount({ open: false });

    // A translated-off drawer is still on screen as far as the browser is
    // concerned; without inert, Tab walks 20-odd invisible links.
    expect(panel.hasAttribute('inert')).toBe(true);
    expect(panel.getAttribute('role')).toBeNull();
  });

  it('moves focus to the way out, not to the first of 23 links', () => {
    setViewportMatches(true);
    mount({ open: true });

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close menu' }));
  });

  it('keeps Tab inside the drawer instead of letting it reach the page behind', () => {
    setViewportMatches(true);
    const { panel } = mount({ open: true });

    const focusable = [...panel.querySelectorAll('a[href], button:not([disabled])')];
    const last = focusable[focusable.length - 1];
    last.focus();

    fireEvent.keyDown(last, { key: 'Tab' });
    expect(panel.contains(document.activeElement)).toBe(true);
  });

  it('hands focus back to whatever opened it', () => {
    setViewportMatches(true);
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();

    const { unmount } = mount({ open: true });
    expect(document.activeElement).not.toBe(opener);

    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});

describe('Sidebar as a desktop rail', () => {
  it('is a plain landmark that never steals focus or goes inert', () => {
    setViewportMatches(false);
    const body = document.body;
    body.focus();

    const { panel } = mount({ open: false });

    expect(panel.getAttribute('role')).toBeNull();
    expect(panel.getAttribute('aria-modal')).toBeNull();
    expect(panel.hasAttribute('inert')).toBe(false);
    expect(panel.contains(document.activeElement)).toBe(false);
  });

  it('lists every tool with the count on the all-tools link', () => {
    setViewportMatches(false);
    mount();

    const all = screen.getByRole('link', { name: /All tools/ });
    const count = Number(all.querySelector('.side-count').textContent);
    // The rail is how a crawler and a keyboard user reach every tool, so the
    // count and the number of links have to agree.
    expect(count).toBeGreaterThan(0);
    expect(screen.getAllByRole('link').length).toBeGreaterThanOrEqual(count);
  });

  it('closes on navigation, so the drawer is never left open behind a page', () => {
    setViewportMatches(true);
    const onClose = vi.fn();
    mount({ open: true, onClose });

    fireEvent.click(screen.getAllByRole('link')[1]);
    expect(onClose).toHaveBeenCalled();
  });
});
