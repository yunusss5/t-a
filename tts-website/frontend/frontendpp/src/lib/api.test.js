// src/lib/api.test.js
// The one module that talks to the backend. Its job is not really fetching —
// it is turning every way a request can fail into a sentence someone can act
// on, which is the part that silently regresses.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getJson, postForm, postFormBlob } from './api';

/** A fetch Response, as much of one as these helpers actually touch. */
function reply(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: async () => body,
    blob: async () => new Blob([JSON.stringify(body)]),
  };
}

/** A gateway timeout page and friends: a body that is not JSON at all. */
function nonJson(status) {
  return {
    ok: false,
    status,
    json: async () => {
      throw new SyntaxError('Unexpected token < in JSON');
    },
  };
}

/** The path the helper actually asked for, ignoring whichever origin is configured. */
const requestedPath = () => new URL(fetch.mock.calls[0][0]).pathname;
const sentBody = () => fetch.mock.calls[0][1].body;

beforeEach(() => {
  global.fetch = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getJson', () => {
  it('returns the parsed body for a healthy response', async () => {
    fetch.mockResolvedValue(reply([{ name: 'en-GB-SoniaNeural' }]));

    await expect(getJson('/voices')).resolves.toEqual([{ name: 'en-GB-SoniaNeural' }]);
    expect(requestedPath()).toBe('/voices');
  });

  it('turns an unreachable backend into advice, not "Failed to fetch"', async () => {
    fetch.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(getJson('/voices')).rejects.toThrow(/Could not reach the API/);
  });

  it('passes an abort through untouched, so a cancelled load is not a failure', async () => {
    fetch.mockRejectedValue(new DOMException('The user aborted a request.', 'AbortError'));

    // The caller distinguishes the two by name; rewrapping it would show a
    // connection error to someone who simply navigated away.
    await expect(getJson('/voices')).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('repeats FastAPI’s own detail rather than a status code', async () => {
    fetch.mockResolvedValue(reply({ detail: 'Text is too long.' }, { ok: false, status: 400 }));

    await expect(getJson('/voices')).rejects.toThrow('Text is too long.');
  });

  it('joins the messages of a validation error', async () => {
    const detail = [{ msg: 'field required' }, { msg: 'must be a string' }];
    fetch.mockResolvedValue(reply({ detail }, { ok: false, status: 422 }));

    await expect(getJson('/voices')).rejects.toThrow('field required, must be a string');
  });
});

describe('a host that is asleep rather than broken', () => {
  it.each([502, 503])('explains the ~30 second wake-up on %i', async (status) => {
    fetch.mockResolvedValue(nonJson(status));

    // Free hosting spins down when idle, and "Request failed (503)" reads as a
    // broken app to someone who only needs to press the button again.
    await expect(getJson('/voices')).rejects.toThrow(/waking up/);
  });

  it('falls back to the status when the body explains nothing', async () => {
    fetch.mockResolvedValue(nonJson(500));

    await expect(getJson('/voices')).rejects.toThrow('Request failed (500).');
  });
});

describe('form posts', () => {
  it('drops empty values and keeps a File as itself', async () => {
    fetch.mockResolvedValue(reply({ ok: true }));
    const file = new File(['one line'], 'script.txt', { type: 'text/plain' });

    await postForm('/generate', {
      voice: 'en-GB-SoniaNeural',
      rate: '',
      target_time: null,
      missing: undefined,
      auto_speed: false,
      file,
    });

    const body = sentBody();
    expect(body.get('voice')).toBe('en-GB-SoniaNeural');
    // A File must survive as a File or multipart parsing on the server breaks;
    // everything else is stringified, including `false`, which is meaningful.
    expect(body.get('file')).toBe(file);
    expect(body.get('auto_speed')).toBe('false');
    expect(body.has('rate')).toBe(false);
    expect(body.has('target_time')).toBe(false);
    expect(body.has('missing')).toBe(false);
  });

  it('hands back the raw blob for the audio endpoints', async () => {
    fetch.mockResolvedValue(reply({ audio: true }));

    const blob = await postFormBlob('/generate', { text: 'hello' });
    expect(blob).toBeInstanceOf(Blob);
    expect(fetch.mock.calls[0][1].method).toBe('POST');
  });

  it('reports an unreachable backend the same way for a post', async () => {
    fetch.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(postFormBlob('/generate', { text: 'hello' })).rejects.toThrow(
      /Could not reach the API/,
    );
  });
});
