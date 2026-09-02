// src/tools/TextToSpeech.test.jsx
// The voice catalogue comes from a free-tier backend that can take half a minute
// to wake up, so the picker has three states rather than one. All three are
// pinned here — including that pressing Generate while the list is missing does
// not bury the reason it is missing.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import TextToSpeech from './TextToSpeech';
import { getJson, postFormBlob } from '../lib/api';

vi.mock('../lib/api', () => ({
  getJson: vi.fn(),
  postFormBlob: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

// Deliberately out of locale order: the tool sorts, so the first language is
// whatever sorts first, not whatever the server happened to list first.
const VOICES = [
  { name: 'en-US-AriaNeural', locale: 'en-US', friendly_name: 'Aria', gender: 'Female' },
  { name: 'en-GB-SoniaNeural', locale: 'en-GB', friendly_name: 'Sonia', gender: 'Female' },
  { name: 'en-US-GuyNeural', locale: 'en-US', friendly_name: 'Guy', gender: 'Male' },
];

const language = () => screen.getByLabelText('Language');
const voice = () => screen.getByLabelText('Voice');
const scriptBox = () => screen.getByPlaceholderText(/Type or paste/);
const generate = () => screen.getByRole('button', { name: /Generat/ });
const optionsOf = (select) => [...select.querySelectorAll('option')].map((o) => o.textContent);

/** Mount with a catalogue that arrives, and wait until it has. */
async function ready() {
  getJson.mockResolvedValue(VOICES);
  const view = render(<TextToSpeech />);
  await waitFor(() => expect(language().disabled).toBe(false));
  return view;
}

/** Mount with a catalogue that never arrives at all. */
async function failing() {
  getJson.mockRejectedValue(new Error('Could not reach the API.'));
  const view = render(<TextToSpeech />);
  await screen.findByText('Voice list unavailable');
  return view;
}

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom has no blob URLs, and the tool mints one for every result.
  URL.createObjectURL = vi.fn(() => 'blob:speech');
  URL.revokeObjectURL = vi.fn();
});

describe('while the voice catalogue is in flight', () => {
  it('says so in the pickers instead of leaving two blank boxes', () => {
    getJson.mockReturnValue(new Promise(() => {}));
    render(<TextToSpeech />);

    expect(optionsOf(language())).toEqual(['Loading voices…']);
    expect(optionsOf(voice())).toEqual(['Loading voices…']);
    expect(language().disabled).toBe(true);
    expect(language().getAttribute('aria-busy')).toBe('true');
  });

  it('blames the wait rather than the person when Generate is pressed early', () => {
    getJson.mockReturnValue(new Promise(() => {}));
    render(<TextToSpeech />);

    fireEvent.click(generate());

    expect(screen.getByRole('alert').textContent).toMatch(/Still loading the voice list/);
    expect(postFormBlob).not.toHaveBeenCalled();
  });
});

describe('once the catalogue lands', () => {
  it('groups voices by language and starts on the first of each', async () => {
    await ready();

    expect(optionsOf(language())).toEqual(['en-GB', 'en-US']);
    expect(language().value).toBe('en-GB');
    expect(optionsOf(voice())).toEqual(['Sonia · Female']);
  });

  it('drops a voice that no longer belongs to the chosen language', async () => {
    await ready();

    fireEvent.change(language(), { target: { value: 'en-US' } });

    expect(optionsOf(voice())).toEqual(['Aria · Female', 'Guy · Male']);
    expect(voice().value).toBe('en-US-AriaNeural');
  });

  it('posts the script once and offers the result back as audio', async () => {
    await ready();
    postFormBlob.mockResolvedValue(new Blob(['audio'], { type: 'audio/mpeg' }));

    fireEvent.change(scriptBox(), { target: { value: 'Two lines of narration.' } });
    fireEvent.click(generate());

    await waitFor(() => expect(postFormBlob).toHaveBeenCalledTimes(1));
    expect(postFormBlob).toHaveBeenCalledWith('/generate', {
      voice: 'en-GB-SoniaNeural',
      rate: '+0%',
      auto_speed: 'false',
      text: 'Two lines of narration.',
    });

    await waitFor(() => expect(document.querySelector('audio')).toBeTruthy());
    expect(document.querySelector('audio').getAttribute('src')).toBe('blob:speech');
  });

  it('needs a target time before Auto Speed can be used, and then sends it', async () => {
    await ready();
    postFormBlob.mockResolvedValue(new Blob(['audio']));

    fireEvent.change(scriptBox(), { target: { value: 'Narration.' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /Auto Speed/ }));
    fireEvent.click(generate());

    expect(screen.getByRole('alert').textContent).toMatch(/Enter a target time/);
    expect(postFormBlob).not.toHaveBeenCalled();

    fireEvent.change(screen.getByPlaceholderText('1:30'), { target: { value: '1:30' } });
    fireEvent.click(generate());

    await waitFor(() => expect(postFormBlob).toHaveBeenCalled());
    expect(postFormBlob.mock.calls[0][1]).toMatchObject({
      auto_speed: 'true',
      target_time: '1:30',
    });
  });

  it('sends an uploaded transcript to the file endpoint instead', async () => {
    const { container } = await ready();
    postFormBlob.mockResolvedValue(new Blob(['audio']));

    fireEvent.click(screen.getByRole('radio', { name: /Upload file/ }));

    const file = new File(['one line'], 'script.txt', { type: 'text/plain' });
    fireEvent.change(container.querySelector('input[type="file"]'), {
      target: { files: [file] },
    });

    fireEvent.click(generate());

    await waitFor(() => expect(postFormBlob).toHaveBeenCalled());
    const [path, payload] = postFormBlob.mock.calls[0];
    expect(path).toBe('/generate-from-file');
    expect(payload.file).toBe(file);
    expect(payload.text).toBeUndefined();
  });
});

describe('when the catalogue cannot be loaded at all', () => {
  it('says why, next to the pickers the failure explains', async () => {
    await failing();

    expect(optionsOf(language())).toEqual(['Voices unavailable']);
    expect(screen.getByRole('alert').textContent).toContain('Could not reach the API.');
  });

  it('keeps that reason on screen when Generate is pressed', async () => {
    await failing();

    fireEvent.click(generate());

    const said = screen.getAllByRole('alert').map((node) => node.textContent);
    // The regression this guards: a validation line replacing the only
    // explanation of why there was nothing to choose from in the first place.
    expect(said.some((text) => text.includes('Could not reach the API.'))).toBe(true);
    expect(said.some((text) => /voice list could not be loaded/.test(text))).toBe(true);
    expect(postFormBlob).not.toHaveBeenCalled();
  });

  it('retries in place rather than asking for a page reload', async () => {
    await failing();

    getJson.mockResolvedValue(VOICES);
    fireEvent.click(screen.getByRole('button', { name: /Try again/ }));

    await waitFor(() => expect(language().disabled).toBe(false));
    expect(getJson).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Voice list unavailable')).toBeNull();
    expect(optionsOf(language())).toEqual(['en-GB', 'en-US']);
  });
});
