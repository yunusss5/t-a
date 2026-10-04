// src/lib/audiofy.test.js
// The DSP functions are pure — buffers come from a factory, not from an
// AudioContext — so the whole library can be exercised without a browser
// audio stack. The fake buffer below mirrors the three things the functions
// actually use: per-channel Float32Arrays, length and sampleRate.

import { describe, expect, it } from 'vitest';
import {
  buildId3v2Tag, detectBPM, detectKey, estimateWavBytes, fadeBuffer, findSilentRegions,
  gainBuffer, loopBuffer, mergeBuffers, normalizeBuffer, removeSilence, reverseBuffer,
  ringModBuffer, stripId3, trimBuffer, vocalRemoveBuffer, waveformData, withId3Tag,
} from './audiofy';

/** Minimal AudioBuffer stand-in. */
function fakeBuffer(channels, length, sampleRate = 44100) {
  return {
    numberOfChannels: channels,
    length,
    sampleRate,
    duration: length / sampleRate,
    getChannelData(ch) {
      if (!this._data) {
        this._data = Array.from({ length: channels }, () => new Float32Array(length));
      }
      return this._data[ch];
    },
  };
}

const createBuffer = (channels, length, sampleRate) => fakeBuffer(channels, length, sampleRate);

/** A ramp: sample i is (i / length) * 2 - 1, so every index is distinguishable. */
function ramp(buffer) {
  const data = buffer.getChannelData(0);
  for (let i = 0; i < buffer.length; i += 1) data[i] = (i / buffer.length) * 2 - 1;
  return buffer;
}

describe('gain and normalize', () => {
  it('scales samples and clamps against the ±1 ceiling', () => {
    const buffer = fakeBuffer(1, 4);
    const data = buffer.getChannelData(0);
    data.set([0.5, -0.5, 0.9, -0.9]);

    const out = gainBuffer(buffer, 2, createBuffer).getChannelData(0);
    expect([...out]).toEqual([1, -1, 1, -1]);
  });

  it('normalizes the loudest sample to the target peak', () => {
    const buffer = fakeBuffer(1, 4);
    buffer.getChannelData(0).set([0.1, 0.4, -0.2, 0]);

    const out = normalizeBuffer(buffer, 0.8, createBuffer).getChannelData(0);
    expect(out[1]).toBeCloseTo(0.8);
    expect(out[0]).toBeCloseTo(0.2);
  });

  it('leaves a silent buffer alone instead of dividing by zero', () => {
    const out = normalizeBuffer(fakeBuffer(1, 4), 0.9, createBuffer);
    expect(out.getChannelData(0).every((v) => v === 0)).toBe(true);
  });
});

describe('fades', () => {
  it('brings a linear fade-in to silence at the first sample', () => {
    const buffer = ramp(fakeBuffer(1, 44100, 44100));
    const out = fadeBuffer(buffer, { fadeInSec: 0.5, fadeOutSec: 0 }, createBuffer).getChannelData(0);
    expect(out[0]).toBeCloseTo(0);
    // Mid-fade: half the original level.
    expect(out[11025]).toBeCloseTo(buffer.getChannelData(0)[11025] * 0.5);
    // Past the fade the signal is untouched.
    expect(out[33000]).toBeCloseTo(buffer.getChannelData(0)[33000]);
  });

  it('fades out to silence at the last sample', () => {
    const buffer = ramp(fakeBuffer(1, 44100, 44100));
    const out = fadeBuffer(buffer, { fadeInSec: 0, fadeOutSec: 0.25 }, createBuffer).getChannelData(0);
    expect(out[44099]).toBeCloseTo(0);
    expect(out[22050]).toBeCloseTo(buffer.getChannelData(0)[22050]);
  });
});

describe('trim, reverse and loop', () => {
  it('keeps exactly the requested span', () => {
    const buffer = ramp(fakeBuffer(1, 100, 100));
    const out = trimBuffer(buffer, 0.25, 0.75, createBuffer);
    expect(out.length).toBe(50);
    expect(out.getChannelData(0)[0]).toBeCloseTo(buffer.getChannelData(0)[25]);
  });

  it('reverses sample order', () => {
    const buffer = ramp(fakeBuffer(1, 100));
    const out = reverseBuffer(buffer, createBuffer).getChannelData(0);
    expect(out[0]).toBeCloseTo(buffer.getChannelData(0)[99]);
    expect(out[99]).toBeCloseTo(buffer.getChannelData(0)[0]);
  });

  it('loops with crossfade eating into the total length', () => {
    const buffer = ramp(fakeBuffer(1, 1000, 1000));
    const noFade = loopBuffer(buffer, 3, {}, createBuffer);
    const faded = loopBuffer(buffer, 3, { crossfadeSec: 0.1 }, createBuffer);
    expect(noFade.length).toBe(3000);
    expect(faded.length).toBe(3000 - 2 * 100);
  });
});

describe('merge', () => {
  it('adds the gap between items and nothing at the end', () => {
    const a = fakeBuffer(1, 100, 100);
    const b = fakeBuffer(1, 200, 100);
    const merged = mergeBuffers([a, b], { gapSec: 0.5, crossfadeSec: 0 }, createBuffer);
    expect(merged.length).toBe(100 + 50 + 200);
  });

  it('fades the head of the next file into the previous tail', () => {
    const a = ramp(fakeBuffer(1, 100, 100));
    const b = fakeBuffer(1, 100, 100); // silent

    const merged = mergeBuffers([a, b], { gapSec: 0, crossfadeSec: 0.1 }, createBuffer);
    // The crossfade overlaps output samples 90–99: nearly all a at the start of
    // the region, nearly all b (silence) at its end.
    expect(merged.getChannelData(0)[90]).toBeGreaterThan(0.5);
    expect(merged.getChannelData(0)[99]).toBeLessThan(0.2);
  });

  it('throws on an empty list rather than producing an empty file', () => {
    expect(() => mergeBuffers([], {}, createBuffer)).toThrow();
  });
});

describe('silence detection and removal', () => {
  // 1 s of signal, 1 s of silence, 1 s of signal, at 1000 Hz.
  function speechAndSilence() {
    const buffer = fakeBuffer(1, 3000, 1000);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < 1000; i += 1) data[i] = Math.sin((2 * Math.PI * 40 * i) / 1000) * 0.5;
    for (let i = 2000; i < 3000; i += 1) data[i] = Math.sin((2 * Math.PI * 40 * i) / 1000) * 0.5;
    return buffer;
  }

  it('finds the quiet middle section', () => {
    const regions = findSilentRegions(speechAndSilence(), { thresholdDb: -30, minSec: 0.5 });
    expect(regions).toHaveLength(1);
    expect(regions[0].start).toBeGreaterThan(0.9);
    expect(regions[0].end).toBeLessThan(2.1);
  });

  it('removes the detected region and keeps the loud parts', () => {
    const buffer = speechAndSilence();
    const regions = findSilentRegions(buffer, { thresholdDb: -30, minSec: 0.5 });
    const cleaned = removeSilence(buffer, regions, { paddingSec: 0.05, crossfadeMs: 50 }, createBuffer);
    expect(cleaned.duration).toBeGreaterThan(1.8);
    expect(cleaned.duration).toBeLessThan(2.3);
  });

  it('throws when everything is silence and no padding is kept', () => {
    const buffer = fakeBuffer(1, 2000, 1000);
    const regions = findSilentRegions(buffer, { thresholdDb: -30, minSec: 0.1 });
    expect(() => removeSilence(buffer, regions, { paddingSec: 0 }, createBuffer)).toThrow();
  });
});

describe('detection', () => {
  it('finds 120 BPM in a click track', () => {
    // Half-second clicks at 1000 Hz — energy peaks every 0.5 s.
    const buffer = fakeBuffer(1, 8000, 1000);
    const data = buffer.getChannelData(0);
    for (let click = 0; click < 16; click += 1) {
      const start = click * 500;
      for (let i = 0; i < 30; i += 1) data[start + i] = Math.sin((2 * Math.PI * 40 * i) / 1000);
    }

    expect(detectBPM(buffer)).toBe(120);
  });

  it('returns 0 when there is nothing rhythmic to find', () => {
    expect(detectBPM(fakeBuffer(1, 500, 1000))).toBe(0);
  });

  it('detects the root note of a sine tone', () => {
    // 220 Hz = A3, sampled at 44.1 kHz for two full FFT windows.
    const rate = 44100;
    const length = 8192 * 2;
    const buffer = fakeBuffer(1, length, rate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.sin((2 * Math.PI * 220 * i) / rate);

    const key = detectKey(buffer);
    expect(key.note).toBe('A');
    expect(['major', 'minor']).toContain(key.mode);
  });
});

describe('stereo tools', () => {
  it('cancels centre-panned content entirely at strength 1', () => {
    const buffer = fakeBuffer(2, 8);
    buffer.getChannelData(0).fill(0.5);
    buffer.getChannelData(1).fill(0.5);

    const out = vocalRemoveBuffer(buffer, { strength: 1 }, createBuffer);
    expect(out.getChannelData(0).every((v) => Math.abs(v) < 1e-6)).toBe(true);
  });

  it('ring modulates at the carrier frequency, zeroing DC input at mix 1', () => {
    const buffer = fakeBuffer(1, 1000, 1000);
    buffer.getChannelData(0).fill(0.5);

    const out = ringModBuffer(buffer, { frequency: 10, mix: 1 }, createBuffer).getChannelData(0);
    // 1000 Hz rate / 10 Hz carrier: exactly 100 carrier cycles, so 10 Hz
    // sine × 0.5 — the samples straddle zero symmetrically.
    expect(Math.max(...out)).toBeGreaterThan(0.4);
    expect(Math.min(...out)).toBeLessThan(-0.4);
  });
});

describe('waveformData', () => {
  it('normalizes peaks against the loudest block', () => {
    const buffer = fakeBuffer(1, 1000, 1000);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < 500; i += 1) data[i] = 0.25;
    for (let i = 500; i < 1000; i += 1) data[i] = 1;

    const peaks = waveformData(buffer, 100);
    expect(Math.max(...peaks)).toBeCloseTo(1);
    expect(peaks[10]).toBeCloseTo(0.25);
  });
});

describe('WAV sizing and ID3 tags', () => {
  it('estimates WAV size from channel count and bit depth', () => {
    expect(estimateWavBytes(fakeBuffer(2, 100), 16)).toBe(44 + 400);
    expect(estimateWavBytes(fakeBuffer(1, 100), 24)).toBe(44 + 300);
  });

  it('builds, embeds and strips an ID3v2 tag round-trip', () => {
    const audio = new Uint8Array([0xff, 0xfb, 0x90, 0x00, 1, 2, 3, 4, 5]).buffer;
    const tag = buildId3v2Tag({ title: 'Test Title', artist: 'Someone' });

    const tagged = new Uint8Array(withId3Tag(audio, tag));
    expect(tagged.length).toBe(tag.length + audio.byteLength);
    expect(String.fromCharCode(...tagged.slice(0, 3))).toBe('ID3');
    // TIT2 frame lives right after the 10-byte header.
    expect(String.fromCharCode(...tagged.slice(10, 14))).toBe('TIT2');

    const stripped = new Uint8Array(stripId3(tagged.buffer));
    expect([...stripped]).toEqual([...new Uint8Array(audio)]);
  });

  it('leaves non-ID3 bytes untouched when stripping', () => {
    const audio = new Uint8Array([0xff, 0xfb, 0x90, 0x00]).buffer;
    expect(stripId3(audio)).toBe(audio);
  });

  it('encodes the tag size as a syncsafe integer', () => {
    const tag = buildId3v2Tag({ title: 'x'.repeat(100) });
    const size = ((tag[6] & 0x7f) << 21) | ((tag[7] & 0x7f) << 14) | ((tag[8] & 0x7f) << 7) | (tag[9] & 0x7f);
    expect(size).toBe(tag.length - 10);
  });
});
