// src/lib/ai.test.js
// The AI client's contract with the server: an "off" status is a value rather
// than a rejection, and a stream is parsed frame by frame across arbitrary chunk
// boundaries — which is the part that breaks in real deployments.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const load = async () => {
  vi.resetModules();
  return import('./ai');
};

/** A Response-alike whose body arrives in the exact chunks given. */
function streamResponse(chunks, { ok = true, status = 200 } = {}) {
  const encoder = new TextEncoder();
  let index = 0;

  return {
    ok,
    status,
    body: {
      getReader: () => ({
        read: async () =>
          index < chunks.length
            ? { done: false, value: encoder.encode(chunks[index++]) }
            : { done: true, value: undefined },
        cancel: async () => {},
      }),
    },
    text: async () => chunks.join(''),
    json: async () => JSON.parse(chunks.join('')),
  };
}

const frame = (payload) => `data: ${JSON.stringify(payload)}\n\n`;

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('aiStatus', () => {
  it('reports the server answer when a model is connected', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ enabled: true, provider: 'ollama', model: 'qwen2.5:7b', tasks: [] }),
    });

    const { aiStatus } = await load();
    const status = await aiStatus();

    expect(status.enabled).toBe(true);
    expect(status.model).toBe('qwen2.5:7b');
    // Absent keys still come back, so no caller has to guard every field.
    expect(status.tones).toEqual([]);
  });

  it('resolves to an off report rather than rejecting when the API is unreachable', async () => {
    fetch.mockRejectedValue(new TypeError('Failed to fetch'));

    const { aiStatus } = await load();
    const status = await aiStatus();

    expect(status.enabled).toBe(false);
    expect(status.detail).toMatch(/could not reach/i);
  });

  it('asks once per page and again only when explicitly refreshed', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ enabled: false }) });

    const { aiStatus } = await load();
    await Promise.all([aiStatus(), aiStatus(), aiStatus()]);
    expect(fetch).toHaveBeenCalledTimes(1);

    await aiStatus({ refresh: true });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('never sends a probe request the caller did not ask for', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ enabled: false }) });

    const { aiStatus } = await load();
    await aiStatus({ probe: false });

    expect(fetch.mock.calls[0][0]).toContain('probe=false');
  });
});

describe('streamAssist', () => {
  it('joins deltas in order and returns the whole answer', async () => {
    fetch.mockResolvedValue(
      streamResponse([frame({ delta: 'Hello ' }), frame({ delta: 'world' }), frame({ done: true })]),
    );

    const { streamAssist } = await load();
    const seen = [];
    const text = await streamAssist({ task: 'hooks', content: 'x'.repeat(20), onDelta: (d) => seen.push(d) });

    expect(text).toBe('Hello world');
    expect(seen).toEqual(['Hello ', 'world']);
  });

  it('survives a chunk boundary in the middle of a frame', async () => {
    const whole = frame({ delta: 'one' }) + frame({ delta: 'two' }) + frame({ done: true });
    const cut = Math.floor(whole.length / 3);

    fetch.mockResolvedValue(streamResponse([whole.slice(0, cut), whole.slice(cut)]));

    const { streamAssist } = await load();
    expect(await streamAssist({ task: 'hooks', content: 'x'.repeat(20) })).toBe('onetwo');
  });

  it('survives a chunk boundary in the middle of a multi-byte character', async () => {
    const whole = frame({ delta: '— naïve — ' }) + frame({ done: true });
    const encoder = new TextEncoder();
    const bytes = encoder.encode(whole);

    // One byte into the em dash's three-byte sequence: a decoder without
    // `{ stream: true }` turns this into replacement characters.
    const cut = encoder.encode(whole.slice(0, whole.indexOf('—'))).length + 1;

    let index = 0;
    const parts = [bytes.slice(0, cut), bytes.slice(cut)];

    fetch.mockResolvedValue({
      ok: true,
      body: {
        getReader: () => ({
          read: async () =>
            index < parts.length ? { done: false, value: parts[index++] } : { done: true },
          cancel: async () => {},
        }),
      },
    });

    const { streamAssist } = await load();
    expect(await streamAssist({ task: 'hooks', content: 'x'.repeat(20) })).toBe('— naïve — ');
  });

  it('throws the sentence in an error frame, even after deltas have arrived', async () => {
    fetch.mockResolvedValue(
      streamResponse([frame({ delta: 'The first half ' }), frame({ error: 'The model stopped.' })]),
    );

    const { streamAssist } = await load();
    await expect(streamAssist({ task: 'hooks', content: 'x'.repeat(20) })).rejects.toThrow(
      'The model stopped.',
    );
  });

  it('ignores a frame it cannot parse instead of failing the stream', async () => {
    fetch.mockResolvedValue(
      streamResponse(['data: {not json}\n\n', frame({ delta: 'still here' }), frame({ done: true })]),
    );

    const { streamAssist } = await load();
    expect(await streamAssist({ task: 'hooks', content: 'x'.repeat(20) })).toBe('still here');
  });

  it('falls back to the buffered body when the environment has no reader', async () => {
    fetch.mockResolvedValue({
      ok: true,
      body: {},
      text: async () => frame({ delta: 'buffered' }) + frame({ done: true }),
    });

    const { streamAssist } = await load();
    expect(await streamAssist({ task: 'hooks', content: 'x'.repeat(20) })).toBe('buffered');
  });

  it('reports the server sentence when the stream fails before its first byte', async () => {
    fetch.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ detail: 'No model is connected on this server.' }),
    });

    const { streamAssist } = await load();
    await expect(streamAssist({ task: 'hooks', content: 'x'.repeat(20) })).rejects.toThrow(
      'No model is connected',
    );
  });

  it('passes an abort through as an AbortError rather than a network message', async () => {
    const abort = new DOMException('The user aborted a request.', 'AbortError');
    fetch.mockRejectedValue(abort);

    const { streamAssist } = await load();
    await expect(streamAssist({ task: 'hooks', content: 'x'.repeat(20) })).rejects.toMatchObject({
      name: 'AbortError',
    });
  });
});

describe('request payloads', () => {
  it('sends the package as JSON and never a prompt', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ titles: [] }) });

    const { polishSeo } = await load();
    await polishSeo({ transcript: 'a transcript', seoPackage: { topic: 'desks' }, count: 3 });

    const body = fetch.mock.calls[0][1].body;
    expect(body.get('transcript')).toBe('a transcript');
    expect(JSON.parse(body.get('package'))).toEqual({ topic: 'desks' });
    expect(body.get('count')).toBe('3');
    expect([...body.keys()]).not.toContain('prompt');
  });

  it('sends a task id, the material and a tone — nothing else', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ text: '' }) });

    const { assist } = await load();
    await assist({ task: 'titles', content: 'material', tone: 'plain' });

    const body = fetch.mock.calls[0][1].body;
    expect([...body.keys()].sort()).toEqual(['content', 'task', 'tone']);
  });
});
