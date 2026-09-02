// Loaded before every Vitest file (see vite.config.js `test.setupFiles`).
//
// jsdom implements neither matchMedia nor scrolling, and both are "not
// implemented" errors rather than graceful no-ops. These stubs are deliberately
// inert: the tests assert on markup and behaviour, not on animation frames.

if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  });
}

// Assigned unconditionally — jsdom *does* define these, it just throws.
window.scrollTo = () => {};
Element.prototype.scrollIntoView = () => {};
