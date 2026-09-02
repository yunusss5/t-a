// src/components/ai/AiOffline.test.jsx
// The state every AI surface falls back to when no model is connected — which
// is the *default* state of the deployed site, not an edge case. What matters is
// that it never reads as breakage: it says what is missing, keeps the way to fix
// it out of the way until asked for, and lets the check be retried without
// firing twice.

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import AiOffline from './AiOffline';

describe('AiOffline', () => {
  it('explains the missing model instead of just looking broken', () => {
    render(<AiOffline />);

    expect(screen.getByRole('heading', { name: /no model is connected/i })).toBeTruthy();
    // The reassurance is the point: the other 22 tools need no model at all.
    expect(screen.getByText(/every other tool on the site is deterministic/i)).toBeTruthy();
  });

  it('nests under the panel heading at h3, so the page outline never skips a level', () => {
    const { container } = render(<AiOffline />);
    expect(container.querySelector('.ai-offline-title').tagName).toBe('H3');
  });

  it('lets each surface replace the body copy with its own sentence', () => {
    render(<AiOffline>An assistant here would rewrite hooks and titles.</AiOffline>);

    expect(screen.getByText(/would rewrite hooks and titles/i)).toBeTruthy();
    expect(screen.queryByText(/every other tool on the site is deterministic/i)).toBeNull();
  });

  it('surfaces the server’s own reason when there is one', () => {
    render(<AiOffline detail="Could not reach the API to check for a model." />);

    const status = screen.getByRole('status');
    expect(status.textContent).toContain('Could not reach the API');
  });

  it('shows no server block when the server said nothing', () => {
    render(<AiOffline />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('keeps the self-host steps collapsed until asked for', () => {
    const { container } = render(<AiOffline />);
    const details = container.querySelector('details');

    expect(details.open).toBe(false);

    fireEvent.click(details.querySelector('summary'));
    expect(details.open).toBe(true);
    expect(screen.getByText(/ollama pull qwen2\.5:7b/i)).toBeTruthy();
  });

  it('names the two provider settings a reader has to change', () => {
    render(<AiOffline />);

    // Both provider paths are documented, because the modular provider layer is
    // the reason either one works without a code change.
    expect(screen.getByText('AI_PROVIDER=ollama')).toBeTruthy();
    expect(screen.getByText('AI_PROVIDER=openai-compatible')).toBeTruthy();
  });

  it('promises that keys stay on the server', () => {
    render(<AiOffline />);
    expect(screen.getByText(/nothing is ever sent to the browser/i)).toBeTruthy();
  });

  it('opens the outbound link without handing it a window reference', () => {
    render(<AiOffline />);
    const link = screen.getByRole('link', { name: 'Ollama' });

    expect(link.getAttribute('target')).toBe('_blank');
    // Reverse tabnabbing: without these the target page can rewrite ours.
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.getAttribute('rel')).toContain('noreferrer');
  });

  it('offers no retry when there is nothing to retry', () => {
    render(<AiOffline />);
    expect(screen.queryByRole('button', { name: /check again/i })).toBeNull();
  });

  it('retries the check on request', () => {
    const onRetry = vi.fn();
    render(<AiOffline onRetry={onRetry} />);

    fireEvent.click(screen.getByRole('button', { name: /check again/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('locks the retry while a check is in flight', () => {
    const onRetry = vi.fn();
    render(<AiOffline onRetry={onRetry} checking />);

    const button = screen.getByRole('button', { name: /check again/i });
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');

    fireEvent.click(button);
    expect(onRetry).not.toHaveBeenCalled();
  });
});
