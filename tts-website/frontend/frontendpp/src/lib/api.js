// src/lib/api.js
// Single place that knows how to talk to the FastAPI backend.

// Absolute origin of the deployed backend. `??` rather than `||` on purpose:
// VITE_API_BASE='' is a meaningful value — it means "same origin", which is how
// a dev session talks to a local backend through the vite proxy.
export const VITE_API_BASE = import.meta.env.VITE_API_BASE ?? 'https://tts-backend-33xv.onrender.com';

const WAKE_RETRY_PATHS = new Set(['/voices', '/generate', '/generate-from-file']);
const WAKE_RETRY_DELAYS = [3000, 5000, 8000, 12000, 15000, 20000];

function waitForRetry(delay, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException('The request was aborted.', 'AbortError'));
      return;
    }

    let timeout;
    const abort = () => {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
      reject(signal.reason ?? new DOMException('The request was aborted.', 'AbortError'));
    };
    const finish = () => {
      signal?.removeEventListener('abort', abort);
      resolve();
    };

    signal?.addEventListener('abort', abort, { once: true });
    timeout = setTimeout(finish, delay);
  });
}

async function fetchWithWakeRetry(path, options) {
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(`${VITE_API_BASE}${path}`, options);
    const canRetry =
      WAKE_RETRY_PATHS.has(path) &&
      [502, 503, 504].includes(response.status) &&
      attempt < WAKE_RETRY_DELAYS.length;

    if (!canRetry) return response;
    await waitForRetry(WAKE_RETRY_DELAYS[attempt], options.signal);
  }
}

/**
 * Turn a plain object into FormData. The backend uses `Form(...)` params
 * everywhere, so every request is multipart — including file uploads, where a
 * File value is appended as-is.
 */
function toFormData(payload = {}) {
  const form = new FormData();

  Object.entries(payload).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    form.append(key, value instanceof File || value instanceof Blob ? value : String(value));
  });

  return form;
}

/** Pull FastAPI's `detail` out of an error response, whatever shape it is. */
async function readError(response) {
  try {
    const body = await response.json();
    if (typeof body.detail === 'string') return body.detail;
    if (Array.isArray(body.detail)) return body.detail.map((d) => d.msg).join(', ');
  } catch {
    // Non-JSON error body (gateway timeout pages, etc.) — fall through.
  }

  if ([502, 503, 504].includes(response.status)) {
    return 'The API is waking up (free hosting sleeps when idle). Try again in ~30 seconds.';
  }

  return `Request failed (${response.status}).`;
}

/** POST a form payload and parse the JSON response. */
export async function postForm(path, payload) {
  let response;

  try {
    response = await fetch(`${VITE_API_BASE}${path}`, {
      method: 'POST',
      body: toFormData(payload),
    });
  } catch (error) {
    throw new Error('Could not reach the API. Check your connection or the backend URL.', {
      cause: error,
    });
  }

  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}

/** POST a form payload and get the raw Blob back (used by the TTS endpoints). */
export async function postFormBlob(path, payload) {
  let response;

  try {
    response = await fetchWithWakeRetry(path, {
      method: 'POST',
      body: toFormData(payload),
    });
  } catch (error) {
    throw new Error('Could not reach the API. Check your connection or the backend URL.', {
      cause: error,
    });
  }

  if (!response.ok) throw new Error(await readError(response));
  return response.blob();
}

/**
 * GET and parse JSON.
 *
 * Wrapped like the POST helpers, and for the same reason: an unreachable
 * backend throws a bare "Failed to fetch", and showing that to someone tells
 * them nothing about what to do next. An abort is re-thrown untouched so a
 * caller can tell a cancelled request from a failed one.
 */
export async function getJson(path, { signal } = {}) {
  let response;

  try {
    response = await fetchWithWakeRetry(path, { signal });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new Error('Could not reach the API. Check your connection or the backend URL.', {
      cause: error,
    });
  }

  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}

/**
 * POST a form payload and hand back the live `Response`.
 *
 * For server-sent events, where the point is to read the body as it arrives
 * rather than after it finishes. The non-OK path still goes through
 * `readError`, because a stream that fails before the first byte fails with a
 * normal status code and a normal `detail`.
 */
export async function postFormStream(path, payload, { signal } = {}) {
  let response;

  try {
    response = await fetch(`${VITE_API_BASE}${path}`, {
      method: 'POST',
      body: toFormData(payload),
      signal,
    });
  } catch (error) {
    // An abort is the caller's own doing, so it is passed through untouched
    // instead of being reported to them as a connection problem.
    if (error?.name === 'AbortError') throw error;
    throw new Error('Could not reach the API. Check your connection or the backend URL.', {
      cause: error,
    });
  }

  if (!response.ok) throw new Error(await readError(response));
  return response;
}
