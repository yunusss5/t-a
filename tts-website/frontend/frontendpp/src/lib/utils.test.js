// src/lib/utils.test.js
// The small helpers every tool leans on. Formatting is the visible half; the
// clipboard and download paths matter because they are the last step of almost
// every tool and they fail differently in every browser.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import toast from 'react-hot-toast';
import { clamp, copyText, cx, downloadText, formatBytes, formatDuration } from './utils';

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

describe('formatDuration', () => {
  it('omits the hour until there is one', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(9)).toBe('0:09');
    expect(formatDuration(95)).toBe('1:35');
    expect(formatDuration(599)).toBe('9:59');
  });

  it('pads minutes once an hour appears', () => {
    expect(formatDuration(3600)).toBe('1:00:00');
    expect(formatDuration(3725)).toBe('1:02:05');
  });

  it('treats nonsense as zero rather than printing NaN', () => {
    expect(formatDuration(undefined)).toBe('0:00');
    expect(formatDuration('abc')).toBe('0:00');
    expect(formatDuration(-30)).toBe('0:00');
  });
});

describe('formatBytes', () => {
  it('switches unit at each threshold', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1023)).toBe('1023 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.00 MB');
  });
});

describe('clamp and cx', () => {
  it('keeps a value inside its range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(99, 0, 10)).toBe(10);
  });

  it('drops falsy class names so conditionals can be inlined', () => {
    // These are what `active && 'is-active'` collapses to at a call site.
    expect(cx('btn', false, null, undefined, '', 'btn-soft')).toBe('btn btn-soft');
    expect(cx()).toBe('');
  });
});

describe('copyText', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does nothing at all for an empty value', async () => {
    const writeText = vi.fn();
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    expect(await copyText('')).toBe(false);
    expect(await copyText(null)).toBe(false);
    expect(writeText).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('uses the clipboard API and confirms with the caller’s label', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    expect(await copyText('hello', 'Title copied')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
    expect(toast.success).toHaveBeenCalledWith('Title copied');
  });

  it('falls back to a hidden textarea when the clipboard is unavailable', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('insecure context')) },
    });
    document.execCommand = vi.fn(() => true);

    expect(await copyText('hello')).toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith('copy');
    // The helper element is removed again, so nothing is left in the tree.
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('tells the visitor to select manually when both routes are blocked', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('blocked')) },
    });
    document.execCommand = vi.fn(() => {
      throw new Error('blocked');
    });

    expect(await copyText('hello')).toBe(false);
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining('select the text manually'),
    );
  });
});

describe('downloadText', () => {
  it('names the file and revokes the object URL it created', () => {
    vi.useFakeTimers();
    const createObjectURL = vi.fn(() => 'blob:x');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });

    const click = vi.fn();
    const created = [];
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const element = realCreate(tag);
      if (tag === 'a') {
        element.click = click;
        created.push(element);
      }
      return element;
    });

    downloadText('chapters.txt', '0:00 Intro');

    expect(created[0].download).toBe('chapters.txt');
    expect(click).toHaveBeenCalledOnce();
    expect(document.querySelector('a')).toBeNull();

    // The URL outlives the click by design; only the timer releases it.
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:x');

    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
});
