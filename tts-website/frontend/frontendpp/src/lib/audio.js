// src/lib/audio.js
// ---------------------------------------------------------------------------
// The DSP behind the Audio Length tool. Pure functions over AudioBuffers, kept
// out of the component so they can be reasoned about — and tested — on their
// own.
// ---------------------------------------------------------------------------

/** Encode an AudioBuffer as a 16-bit PCM WAV. */
export function bufferToWav(buffer) {
  const channels = buffer.numberOfChannels;
  const { sampleRate, length } = buffer;
  const bytesPerSample = 2;
  const dataSize = length * channels * bytesPerSample;
  const view = new DataView(new ArrayBuffer(44 + dataSize));

  const writeString = (offset, text) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, 8 * bytesPerSample, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  // Channel arrays are hoisted out of the sample loop: getChannelData() inside
  // it meant one call per sample per channel — millions for a normal track.
  const data = Array.from({ length: channels }, (_, ch) => buffer.getChannelData(ch));

  let offset = 44;
  for (let i = 0; i < length; i += 1) {
    for (let ch = 0; ch < channels; ch += 1) {
      const sample = Math.max(-1, Math.min(1, data[ch][i]));
      // Asymmetric ranges: -1 maps to -32768, +1 to 32767.
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return view.buffer;
}

const FRAME = 2048;
const HOP = FRAME / 4; // 75% overlap
const SEARCH = FRAME / 8; // ± alignment search, in samples

function hann(size) {
  const window = new Float32Array(size);
  for (let i = 0; i < size; i += 1) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  return window;
}

/**
 * WSOLA time stretch: changes duration without moving pitch.
 *
 * `speed` > 1 shortens, < 1 lengthens. Overlapping frames are placed where they
 * correlate best with what has already been written, which is what keeps the
 * waveform's periodicity — and therefore the pitch — intact.
 *
 * Async on purpose: a four-minute track is tens of millions of multiply-adds,
 * and doing that synchronously freezes the tab. It yields every few frames so
 * the progress bar can paint.
 */
export async function timeStretch({ buffer, speed, createBuffer, onProgress, isCancelled }) {
  if (!Number.isFinite(speed) || Math.abs(speed - 1) < 0.001) return buffer;

  const channels = buffer.numberOfChannels;
  const outLength = Math.max(1, Math.round(buffer.length / speed));
  const output = createBuffer(channels, outLength, buffer.sampleRate);
  const window = hann(FRAME);
  const totalFrames = Math.ceil(outLength / HOP) * channels;
  let framesDone = 0;

  for (let ch = 0; ch < channels; ch += 1) {
    const input = buffer.getChannelData(ch);
    const out = output.getChannelData(ch);
    // Sum of the window values landing on each output sample. Dividing by it is
    // what makes overlap-add unity-gain; the previous fixed 1/sqrt(hop) scale
    // attenuated everything by ~27 dB and the result was near-silent.
    const weight = new Float32Array(outLength);

    let read = 0;
    let write = 0;

    while (read + FRAME <= input.length && write + FRAME <= outLength) {
      const from = Math.max(0, read - SEARCH);
      const to = Math.min(input.length - FRAME, read + SEARCH);

      let bestStart = Math.min(Math.max(read, from), to);
      let bestScore = -Infinity;

      for (let start = from; start <= to; start += 1) {
        let score = 0;
        for (let i = 0; i < HOP; i += 1) {
          const outIndex = write - HOP + i;
          if (outIndex < 0) continue;
          score += out[outIndex] * input[start + i];
        }
        if (score > bestScore) {
          bestScore = score;
          bestStart = start;
        }
      }

      for (let i = 0; i < FRAME; i += 1) {
        const outIndex = write + i;
        if (outIndex >= outLength) break;
        out[outIndex] += input[bestStart + i] * window[i];
        weight[outIndex] += window[i];
      }

      read = bestStart + Math.round(HOP * speed);
      write += HOP;
      framesDone += 1;

      if (framesDone % 24 === 0) {
        onProgress?.(Math.min(99, Math.round((framesDone / totalFrames) * 100)));
        // A macrotask, not a microtask: only this lets the browser paint.
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (isCancelled?.()) return null;
      }
    }

    let peak = 0;
    for (let i = 0; i < outLength; i += 1) {
      if (weight[i] > 1e-6) out[i] /= weight[i];
      const magnitude = Math.abs(out[i]);
      if (magnitude > peak) peak = magnitude;
    }

    // Only ever attenuates: a quiet recording should stay quiet.
    if (peak > 0.99) {
      const gain = 0.99 / peak;
      for (let i = 0; i < outLength; i += 1) out[i] *= gain;
    }
  }

  onProgress?.(100);
  return output;
}
