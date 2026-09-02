// src/tools/AiStudio.test.jsx
// The AI tool's three states — checking, no model, model connected — and the
// promise the panel makes about the request: a task id, the material and a tone,
// never an instruction the page composed.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AiStudio from './AiStudio';
import { aiStatus, streamAssist } from '../lib/ai';
import toast from 'react-hot-toast';

vi.mock('../lib/ai', () => ({
  aiStatus: vi.fn(),
  streamAssist: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

const ONLINE = {
  enabled: true,
  provider: 'ollama',
  model: 'qwen2.5:7b',
  max_input_chars: 4000,
  tones: ['plain', 'warm'],
  tasks: [
    { id: 'hooks', label: 'Opening hooks', hint: 'Five ways to start' },
    { id: 'titles', label: 'Title options' },
  ],
};

const MATERIAL = 'A twenty minute video about rebuilding a desk setup on a budget.';

/** A promise the test resolves when it wants to. */
function deferred() {
  let settle;
  const promise = new Promise((resolve, reject) => {
    settle = { resolve, reject };
  });
  return { promise, ...settle };
}

const material = () => screen.getByRole('textbox');
const generate = () => screen.getByRole('button', { name: /Generate|Writing/ });

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('while the status is unknown', () => {
  it('holds the layout with a skeleton instead of flashing an offline panel', () => {
    aiStatus.mockReturnValue(deferred().promise);
    render(<AiStudio />);

    expect(screen.getByRole('status', { name: /Checking for a connected model/ })).toBeTruthy();
    expect(screen.queryByText('No model is connected')).toBeNull();
  });
});

describe('with no model connected', () => {
  it('explains what is missing and repeats the server’s own reason', async () => {
    aiStatus.mockResolvedValue({ enabled: false, detail: 'AI_PROVIDER is not set.' });
    render(<AiStudio />);

    expect(await screen.findByText('No model is connected')).toBeTruthy();
    expect(screen.getByText('AI_PROVIDER is not set.')).toBeTruthy();
    // Nothing to type into: the tool does not pretend to work.
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('offers a retry that asks the server again rather than reloading the page', async () => {
    aiStatus.mockResolvedValue({ enabled: false });
    render(<AiStudio />);

    fireEvent.click(await screen.findByRole('button', { name: /Check again/ }));
    await waitFor(() => expect(aiStatus).toHaveBeenCalledWith({ refresh: true }));
  });

  it('names the free local route, since that is the whole answer for most people', async () => {
    aiStatus.mockResolvedValue({ enabled: false });
    render(<AiStudio />);

    expect(await screen.findByText(/ollama pull qwen2.5:7b/)).toBeTruthy();
    expect(screen.getByText(/AI_PROVIDER=ollama/)).toBeTruthy();
  });
});

describe('with a model connected', () => {
  beforeEach(() => {
    aiStatus.mockResolvedValue(ONLINE);
  });

  const ready = async () => {
    render(<AiStudio />);
    await screen.findByRole('button', { name: /Generate/ });
  };

  it('offers the server’s tasks and tones, and nothing it invented itself', async () => {
    await ready();

    const tasks = [...document.querySelectorAll('#ai-task option')].map((o) => o.value);
    const tones = [...document.querySelectorAll('#ai-tone option')].map((o) => o.value);

    expect(tasks).toEqual(['hooks', 'titles']);
    expect(tones).toEqual(['plain', 'warm']);
    // The hint for the selected task comes from the server too.
    expect(screen.getByText('Five ways to start')).toBeTruthy();
  });

  it('shows which model is answering, so the output can be judged', async () => {
    await ready();
    expect(screen.getByText('qwen2.5:7b · ollama')).toBeTruthy();
  });

  it('will not send a request too short to answer', async () => {
    await ready();
    expect(generate().disabled).toBe(true);

    fireEvent.change(material(), { target: { value: 'too short' } });
    expect(generate().disabled).toBe(true);

    fireEvent.change(material(), { target: { value: MATERIAL } });
    expect(generate().disabled).toBe(false);
  });

  it('limits the material to the length the server accepts', async () => {
    await ready();
    expect(material().maxLength).toBe(4000);
  });

  it('sends a task id, the material and a tone — never a prompt', async () => {
    streamAssist.mockResolvedValue('an answer');
    await ready();

    fireEvent.change(document.querySelector('#ai-task'), { target: { value: 'titles' } });
    fireEvent.change(material(), { target: { value: MATERIAL } });
    fireEvent.click(generate());

    await waitFor(() => expect(streamAssist).toHaveBeenCalled());
    const [request] = streamAssist.mock.calls[0];

    expect(request.task).toBe('titles');
    expect(request.content).toBe(MATERIAL);
    expect(request.tone).toBe('plain');
    expect(Object.keys(request).sort()).toEqual(['content', 'onDelta', 'signal', 'task', 'tone']);
  });

  it('paints each delta as it arrives rather than waiting for the end', async () => {
    const pending = deferred();
    streamAssist.mockImplementation(async ({ onDelta }) => {
      onDelta('Half a sentence ');
      await pending.promise;
      onDelta('and the rest.');
      return 'Half a sentence and the rest.';
    });

    await ready();
    fireEvent.change(material(), { target: { value: MATERIAL } });
    fireEvent.click(generate());

    expect(await screen.findByText('Half a sentence')).toBeTruthy();
    pending.resolve();
    expect(await screen.findByText('Half a sentence and the rest.')).toBeTruthy();
  });

  it('asks for no deltas at all when streaming is switched off', async () => {
    streamAssist.mockResolvedValue('the whole answer');
    await ready();

    fireEvent.click(screen.getByRole('checkbox', { name: /Stream the answer/ }));
    fireEvent.change(material(), { target: { value: MATERIAL } });
    fireEvent.click(generate());

    await waitFor(() => expect(streamAssist).toHaveBeenCalled());
    expect(streamAssist.mock.calls[0][0].onDelta).toBeUndefined();
    expect(await screen.findByText('the whole answer')).toBeTruthy();
  });

  it('offers a stop control while it runs, and aborts the request with it', async () => {
    const pending = deferred();
    streamAssist.mockImplementation(({ signal }) =>
      pending.promise.then(() => {
        if (signal.aborted) throw new DOMException('aborted', 'AbortError');
        return 'done';
      }),
    );

    await ready();
    fireEvent.change(material(), { target: { value: MATERIAL } });
    fireEvent.click(generate());

    const stop = await screen.findByRole('button', { name: /Stop/ });
    const { signal } = streamAssist.mock.calls[0][0];
    expect(signal.aborted).toBe(false);

    fireEvent.click(stop);
    expect(signal.aborted).toBe(true);

    pending.resolve();
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Stopped'));
    // An abort is not a failure, so nothing red is shown.
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the model’s own sentence when a stream fails part way through', async () => {
    streamAssist.mockRejectedValue(new Error('The model stopped after two lines.'));
    await ready();

    fireEvent.change(material(), { target: { value: MATERIAL } });
    fireEvent.click(generate());

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('The model stopped after two lines.');
    // The button comes back: a failure here is worth retrying.
    await waitFor(() => expect(generate().disabled).toBe(false));
  });

  it('announces the answer politely and never as markup', async () => {
    streamAssist.mockResolvedValue('<b>not bold</b>');
    await ready();

    fireEvent.change(material(), { target: { value: MATERIAL } });
    fireEvent.click(generate());

    const output = await screen.findByText('<b>not bold</b>');
    expect(output.querySelector('b')).toBeNull();
    expect(output.closest('.ai-output').getAttribute('aria-live')).toBe('polite');
  });

  it('drops a sample in so the tool can be tried without writing anything', async () => {
    await ready();

    fireEvent.click(screen.getByRole('button', { name: /Use sample/ }));
    expect(material().value.length).toBeGreaterThan(100);
    expect(generate().disabled).toBe(false);
  });

  it('confirms with the task name once an answer lands', async () => {
    streamAssist.mockResolvedValue('an answer');
    await ready();

    fireEvent.change(material(), { target: { value: MATERIAL } });
    fireEvent.click(generate());

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Opening hooks ready'));
  });
});
