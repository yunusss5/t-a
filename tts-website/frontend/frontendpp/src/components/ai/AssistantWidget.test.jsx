import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import AssistantWidget from './AssistantWidget';

describe('AssistantWidget', () => {
  it('keeps a visible assistant launcher and links to the full tool page', () => {
    render(
      <MemoryRouter>
        <AssistantWidget />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open AI Assistant' }));

    expect(screen.getByRole('textbox', { name: 'Message the assistant' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Full page' }).getAttribute('href'))
      .toBe('/tools/ai-assistant');
  });
});
