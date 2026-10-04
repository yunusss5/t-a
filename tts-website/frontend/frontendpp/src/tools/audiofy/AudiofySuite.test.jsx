// src/tools/audiofy/AudiofySuite.test.jsx
// The suite maps 50 ids to components through buildCatalogue(); a definition
// that is missing or wired to the wrong component would only ever surface as a
// runtime crash of the whole page (there is no error boundary), so every
// sub-tool view is rendered here instead.

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { default as Suite } from './AudiofySuite';
import { AUDIOFY_TOOLS, AUDIOFY_CATEGORIES, findAudiofyTool } from './registry';

// The suite renders router-aware content (the Text-to-Speech bridge links to
// the dedicated TTS page), so it needs the same router context the app gives it.
const renderSuite = (key) =>
  render(
    <MemoryRouter>
      <Suite key={key} />
    </MemoryRouter>,
  );

describe('audiofy catalogue integrity', () => {
  it('ships exactly the 50 ordered tools, each with a component and category', () => {
    expect(AUDIOFY_TOOLS).toHaveLength(50);
    AUDIOFY_TOOLS.forEach((tool) => {
      expect(tool.component, `${tool.id} has no component`).toBeTruthy();
      expect(AUDIOFY_CATEGORIES.map((c) => c.id), `${tool.id} category`).toContain(tool.category);
      expect(tool.description, `${tool.id} description`).toBeTruthy();
    });
    expect(new Set(AUDIOFY_TOOLS.map((t) => t.id)).size).toBe(50);
  });

  it('finds tools by id and nothing for unknown ids', () => {
    expect(findAudiofyTool('audio-trimmer').name).toBe('Audio Trimmer');
    expect(findAudiofyTool('nope')).toBeUndefined();
  });
});

describe('every sub-tool view renders', () => {
  AUDIOFY_TOOLS.forEach((tool) => {
    it(`renders ${tool.id}`, () => {
      window.location.hash = `#${tool.id}`;
      const { container, unmount } = renderSuite(tool.id);
      expect(container.textContent, `${tool.id} rendered empty`).toBeTruthy();
      expect(container.querySelector('h2'), `${tool.id} has a tool heading`).toBeTruthy();
      unmount();
      window.location.hash = '';
    });
  });
});
