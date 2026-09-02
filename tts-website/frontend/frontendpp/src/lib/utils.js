// src/lib/utils.js
// Small shared helpers used across the tools.

import toast from 'react-hot-toast';

/** Copy text to the clipboard with a toast either way. */
export async function copyText(value, label = 'Copied') {
  const text = String(value ?? '');
  if (!text) return false;

  try {
    await navigator.clipboard.writeText(text);
    toast.success(label);
    return true;
  } catch {
    // Clipboard API needs a secure context; fall back to a hidden textarea.
    try {
      const helper = document.createElement('textarea');
      helper.value = text;
      helper.setAttribute('readonly', '');
      helper.style.position = 'fixed';
      helper.style.opacity = '0';
      document.body.appendChild(helper);
      helper.select();
      document.execCommand('copy');
      document.body.removeChild(helper);
      toast.success(label);
      return true;
    } catch {
      toast.error('Copy blocked by the browser — select the text manually.');
      return false;
    }
  }
}

/** Trigger a download for a string payload (txt, srt, json, csv…). */
export function downloadText(filename, content, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  downloadBlob(filename, blob);
}

/** Trigger a download for any Blob and clean up the object URL. */
export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 95 -> "1:35", 3725 -> "1:02:05" */
export function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.round(Number(totalSeconds) || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const padded = String(secs).padStart(2, '0');
  if (!hours) return `${minutes}:${padded}`;
  return `${hours}:${String(minutes).padStart(2, '0')}:${padded}`;
}

/** 1536 -> "1.5 KB" */
export function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(2)} MB`;
}

/** Clamp a number into a range. */
export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export const cx = (...parts) => parts.filter(Boolean).join(' ');
