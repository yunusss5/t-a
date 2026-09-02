// src/components/ai/SeoPolish.test.jsx
// The optional model pass over the flagship tool's output. Two things matter
// more than the rest: with no model connected this renders nothing at all, and
// the deterministic package it sits beside is never replaced by the rewrite.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SeoPolish from './SeoPolish';
import { aiStatus, polishSeo } from '../../lib/ai';
import toast from 'react-hot-toast';

vi.mock('../../lib/ai', () => ({
  aiStatus: vi.fn(),
  polishSeo: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

const ONLINE = { enabled: true, provider: 'ollama', model: 'qwen2.5:7b' };

/** Long enough for the server to ground a rewrite (200+ characters). */
const TRANSCRIPT = 'I rebuilt my desk setup on a three hundred pound budget. '.repeat(6);

const PACKAGE = {
  topic: 'Budget desk setup',
  titles: [
    { title: 'Desk setup for under £300' },
    { title: 'The £300 desk build' },
    { title: 'Three hundred pounds, one desk' },
    { title: 'Budget desk, honest review' },
    { title: 'What I would buy again' },
    { title: 'The monitor arm changed everything' },
    { title: 'A seventh title nobody asked for' },
  ],
  description: 'A full walk-through of a three hundred pound desk rebuild, with the two mistakes.',
};

const REPLY = {
  hook: 'Three hundred pounds, and the best thing I bought cost twenty.',
  titles: ['The £300 desk that works', 'One arm, twice the desk'],
  description: 'A budget desk rebuild, what earned its place and what came straight back off.',
  notes: 'Kept to the two purchases you actually named.',
  model: 'qwen2.5:7b',
};

/** The one action button, whatever it currently says — including "Rewriting…". */
const rewrite = () => screen.getByRole('button', { name: /Rewrit/ });

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('with no model connected', () => {
  it('renders nothing, so the tool is exactly what it was without one', async () => {
    aiStatus.mockResolvedValue({ enabled: false, detail: 'AI_PROVIDER is not set.' });
    const { container } = render(<SeoPolish transcript={TRANSCRIPT} {...PACKAGE} />);

    await waitFor(() => expect(aiStatus).toHaveBeenCalled());
    expect(container.firstChild).toBeNull();
    // Not even a hint that a feature is missing here.
    expect(screen.queryByText(/model/i)).toBeNull();
  });

  it('renders nothing while the status is still unknown, rather than flashing a panel', () => {
    aiStatus.mockReturnValue(new Promise(() => {}));
    const { container } = render(<SeoPolish transcript={TRANSCRIPT} {...PACKAGE} />);

    expect(container.firstChild).toBeNull();
  });
});

describe('with a model connected', () => {
  beforeEach(() => {
    aiStatus.mockResolvedValue(ONLINE);
  });

  const ready = async () => {
    const view = render(<SeoPolish transcript={TRANSCRIPT} {...PACKAGE} />);
    await screen.findByRole('heading', { name: /Polish with the model/ });
    return view;
  };

  it('names the model doing the rewriting and calls itself optional', async () => {
    await ready();
    expect(screen.getByText('Optional · qwen2.5:7b')).toBeTruthy();
  });

  it('says the package above does not change', async () => {
    await ready();
    expect(screen.getByText(/does not change/)).toBeTruthy();
  });

  it('refuses a transcript too thin to stay grounded, and offers no button', async () => {
    render(<SeoPolish transcript="Two sentences, not two hundred characters." {...PACKAGE} />);

    expect(await screen.findByText('Not enough material')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Rewrite/ })).toBeNull();
  });

  it('treats a missing transcript as too thin rather than sending an empty request', async () => {
    render(<SeoPolish {...PACKAGE} />);

    expect(await screen.findByText('Not enough material')).toBeTruthy();
    expect(polishSeo).not.toHaveBeenCalled();
  });

  it('sends the transcript and the package — titles as plain strings, six at most', async () => {
    polishSeo.mockResolvedValue(REPLY);
    await ready();

    fireEvent.click(rewrite());
    await waitFor(() => expect(polishSeo).toHaveBeenCalled());

    const [request] = polishSeo.mock.calls[0];
    expect(request.transcript).toBe(TRANSCRIPT);
    expect(request.seoPackage.topic).toBe('Budget desk setup');
    expect(request.seoPackage.description).toBe(PACKAGE.description);
    expect(request.seoPackage.titles).toEqual([
      'Desk setup for under £300',
      'The £300 desk build',
      'Three hundred pounds, one desk',
      'Budget desk, honest review',
      'What I would buy again',
      'The monitor arm changed everything',
    ]);
    // No instruction is composed here: the task lives on the server.
    expect(Object.keys(request).sort()).toEqual(['seoPackage', 'transcript']);
  });

  it('accepts titles that are already strings', async () => {
    polishSeo.mockResolvedValue(REPLY);
    render(<SeoPolish transcript={TRANSCRIPT} topic="T" titles={['One', 'Two']} description="D" />);
    fireEvent.click(await screen.findByRole('button', { name: /Rewrite/ }));

    await waitFor(() => expect(polishSeo).toHaveBeenCalled());
    expect(polishSeo.mock.calls[0][0].seoPackage.titles).toEqual(['One', 'Two']);
  });

  it('shows a placeholder while the model works, in a region that announces itself', async () => {
    let settle;
    polishSeo.mockReturnValue(new Promise((resolve) => { settle = resolve; }));
    await ready();

    fireEvent.click(rewrite());

    const waiting = await screen.findByRole('status', { name: /Waiting for the rewrite/ });
    expect(waiting.closest('[aria-live="polite"]')).toBeTruthy();
    expect(rewrite().getAttribute('aria-busy')).toBe('true');

    settle(REPLY);
    await screen.findByText(REPLY.hook);
  });

  it('shows the rewrite beside the original, with the model credited', async () => {
    polishSeo.mockResolvedValue(REPLY);
    await ready();

    fireEvent.click(rewrite());

    expect(await screen.findByText(REPLY.hook)).toBeTruthy();
    expect(screen.getByText(REPLY.description)).toBeTruthy();
    expect(screen.getByText('The £300 desk that works')).toBeTruthy();
    expect(screen.getByText('2 options')).toBeTruthy();
    expect(screen.getByText(REPLY.notes)).toBeTruthy();
    expect(screen.getByText(/Written by qwen2.5:7b/)).toBeTruthy();
    // A length is shown per title, since a title has a budget on YouTube.
    expect(screen.getByText(`${REPLY.titles[0].length} chars`)).toBeTruthy();
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Rewrite ready'));
  });

  it('offers a second pass once an answer is in', async () => {
    polishSeo.mockResolvedValue(REPLY);
    await ready();

    fireEvent.click(rewrite());
    expect(await screen.findByRole('button', { name: 'Rewrite again' })).toBeTruthy();
  });

  it('discards the rewrite without touching anything else', async () => {
    polishSeo.mockResolvedValue(REPLY);
    await ready();

    fireEvent.click(rewrite());
    fireEvent.click(await screen.findByRole('button', { name: /Discard/ }));

    expect(screen.queryByText(REPLY.hook)).toBeNull();
    expect(screen.queryByRole('button', { name: /Discard/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Rewrite' })).toBeTruthy();
  });

  it('survives a reply with no titles instead of taking the page down', async () => {
    polishSeo.mockResolvedValue({ hook: 'Just a hook.', model: 'qwen2.5:7b' });
    await ready();

    fireEvent.click(rewrite());

    expect(await screen.findByText('Just a hook.')).toBeTruthy();
    expect(screen.queryByText(/options$/)).toBeNull();
  });

  it('reports a failure in the model’s own words and leaves the button usable', async () => {
    polishSeo.mockRejectedValue(new Error('The model returned nothing usable.'));
    await ready();

    fireEvent.click(rewrite());

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('The model could not finish');
    expect(alert.textContent).toContain('The model returned nothing usable.');
    await waitFor(() => expect(rewrite().disabled).toBe(false));
  });

  it('clears a stale error when the next attempt starts', async () => {
    polishSeo.mockRejectedValueOnce(new Error('Timed out.'));
    polishSeo.mockResolvedValueOnce(REPLY);
    await ready();

    fireEvent.click(rewrite());
    await screen.findByRole('alert');

    fireEvent.click(rewrite());
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });
});
