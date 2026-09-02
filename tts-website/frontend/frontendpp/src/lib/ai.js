// src/lib/ai.js
// ---------------------------------------------------------------------------
// The browser half of the AI layer.
//
// It knows five endpoints and nothing else: no provider names, no prompts, no
// model ids, and — deliberately — no credentials. Whichever model the server is
// pointed at (Ollama on a laptop, llama.cpp, vLLM, a hosted OpenAI-compatible
// endpoint) is a server-side environment variable, so switching it never
// touches this file and no key ever reaches a bundle.
//
// The other rule here: a missing model is a normal state, not an error. The
// status call resolves to an "off" report rather than rejecting, so a page can
// render an honest "connect a model" panel instead of a red failure.
// ---------------------------------------------------------------------------

import { getJson, postForm, postFormStream } from './api';

/** What a caller sees when the backend has no model configured or is asleep. */
const OFFLINE = {
  enabled: false,
  provider: 'none',
  model: null,
  tasks: [],
  tones: [],
  max_input_chars: 0,
  reachable: null,
  detail: 'The AI features are switched off on this server.',
};

let cached = null;

/**
 * Is a model connected, and which tasks does it offer?
 *
 * Cached for the lifetime of the page: the answer is a deployment property, and
 * every AI surface asks on mount. Pass `{ refresh: true }` behind a visible
 * "retry" control, which is the only case where the answer can have changed.
 */
export function aiStatus({ refresh = false, probe = true } = {}) {
  if (refresh) cached = null;

  cached ??= getJson(`/api/ai/status?probe=${probe ? 'true' : 'false'}`)
    .then((body) => ({ ...OFFLINE, ...body }))
    .catch(() => ({ ...OFFLINE, detail: 'Could not reach the API to check for a model.' }));

  return cached;
}

/** One writing task, answered in full. Rejects with a sentence worth showing. */
export function assist({ task, content, tone }) {
  return postForm('/api/ai/assist', { task, content, tone });
}

/** Rewrite a generated SEO package. The caller keeps the original to revert to. */
export function polishSeo({ transcript, seoPackage, count = 5 }) {
  return postForm('/api/ai/seo-polish', {
    transcript,
    package: JSON.stringify(seoPackage || {}),
    count,
  });
}

/** Follow-up video ideas, each grounded in the transcript. */
export function suggestIdeas({ transcript, count = 6 }) {
  return postForm('/api/ai/ideas', { transcript, count });
}

/**
 * The same assist task, streamed.
 *
 * Frames are `{delta}`, then either `{done: true}` or `{error}`. A failure after
 * the first byte cannot change the status code, so it arrives as a frame — which
 * is why this throws on `error` rather than treating the stream as successful.
 *
 * Returns the full text, so a caller that only wants the end result can await it
 * and ignore `onDelta`.
 */
export async function streamAssist({ task, content, tone, onDelta, signal }) {
  const response = await postFormStream('/api/ai/assist/stream', { task, content, tone }, { signal });

  // No streams in this environment (or a proxy that buffered the whole body):
  // fall back to the text, which is the same frames, just all at once.
  if (!response.body?.getReader) {
    return drain(splitFrames(await response.text()).frames, onDelta);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const { frames, rest } = splitFrames(buffer);
      buffer = rest;
      text += drain(frames, onDelta);
    }
  } finally {
    // An abort mid-read leaves the connection open otherwise.
    reader.cancel().catch(() => {});
  }

  return text + drain(splitFrames(buffer).frames, onDelta);
}

/**
 * Pull whole `data: …` frames out of a buffer, leaving any partial tail behind.
 *
 * A chunk boundary can land in the middle of a frame — or in the middle of a
 * multi-byte character, which is why the decoder above is in streaming mode.
 */
function splitFrames(buffer) {
  const parts = buffer.split('\n\n');
  const rest = parts.pop() ?? '';
  const frames = [];

  for (const part of parts) {
    const line = part.split('\n').find((candidate) => candidate.startsWith('data:'));
    if (!line) continue;
    try {
      frames.push(JSON.parse(line.slice(5)));
    } catch {
      // A frame we cannot parse is a frame we ignore: the stream is still good.
    }
  }

  return { frames, rest };
}

/** Apply frames in order, returning the text they carried. */
function drain(frames, onDelta) {
  let text = '';

  for (const frame of frames) {
    if (frame.error) throw new Error(frame.error);
    if (typeof frame.delta !== 'string') continue;
    text += frame.delta;
    onDelta?.(frame.delta);
  }

  return text;
}
