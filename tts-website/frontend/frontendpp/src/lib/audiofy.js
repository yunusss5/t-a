// src/lib/audiofy.js
// ---------------------------------------------------------------------------
// The DSP behind the Audiofy suite: trim, merge, effects, analysis and synthesis
// over decoded AudioBuffers — everything the 50 client-side audio tools share.
//
// Ported from Audiofy's AudioEngine singleton, with the two changes that make it
// live here rather than as a global object: the half-dozen methods that existed
// twice under identical names exist once, and nothing reaches for window state.
// Functions that allocate AudioBuffers take a `createBuffer(channels, length,
// sampleRate)` factory — the caller owns the AudioContext, so a tool can unmount
// and close it without this module holding a hidden reference.
//
// Filter-based operations render through an OfflineAudioContext instead: the
// graph runs faster than real time and the biquad nodes are exactly what the
// real-time path would use, so previews and exports agree.
// ---------------------------------------------------------------------------

/** Read a File (or recorded Blob) into a decoded AudioBuffer plus its details. */
export async function decodeAudioFile(file, context) {
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor && !context) {
    throw new Error('This browser does not support the Web Audio API.');
  }

  const bytes = await file.arrayBuffer();
  // decodeAudioData detaches the buffer it is given, so the copy is what lets
  // the same file be processed twice (e.g. after changing a slider).
  let decoded;
  try {
    decoded = await (context || new Ctor()).decodeAudioData(bytes.slice(0));
  } catch {
    throw new Error('That file could not be decoded. Try an MP3, WAV, M4A, OGG or FLAC file.');
  }

  return {
    buffer: decoded,
    info: {
      name: file.name || 'recording',
      size: file.size,
      duration: decoded.duration,
      sampleRate: decoded.sampleRate,
      channels: decoded.numberOfChannels,
    },
  };
}

/** `samples` peak values (0..1) for drawing a waveform of one pixel-column each. */
export function waveformData(buffer, samples = 1000) {
  const data = buffer.getChannelData(0);
  const blockSize = Math.max(1, Math.floor(data.length / samples));
  const peaks = new Float32Array(samples);

  for (let i = 0; i < samples; i += 1) {
    const start = i * blockSize;
    let sum = 0;
    for (let j = 0; j < blockSize; j += 1) {
      sum += Math.abs(data[start + j] || 0);
    }
    peaks[i] = sum / blockSize;
  }

  // Normalise against the loudest block so a quiet track still fills the canvas.
  let max = 0;
  for (let i = 0; i < samples; i += 1) if (peaks[i] > max) max = peaks[i];
  if (max > 0.0001) {
    for (let i = 0; i < samples; i += 1) peaks[i] /= max;
  }

  return peaks;
}

/* ------------------------------------------------------------- Edit ops ---- */

/** Keep only `[startSec, endSec)` of the buffer. */
export function trimBuffer(buffer, startSec, endSec, createBuffer) {
  const rate = buffer.sampleRate;
  const start = Math.max(0, Math.floor(startSec * rate));
  const end = Math.min(buffer.length, Math.floor(endSec * rate));
  const length = end - start;

  if (length <= 0) throw new Error('The selected range is empty.');

  const output = createBuffer(buffer.numberOfChannels, length, rate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch += 1) {
    output.getChannelData(ch).set(buffer.getChannelData(ch).subarray(start, end));
  }
  return output;
}

export function reverseBuffer(buffer, createBuffer) {
  const output = createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch += 1) {
    const src = buffer.getChannelData(ch);
    const dst = output.getChannelData(ch);
    for (let i = 0, j = buffer.length - 1; i < buffer.length; i += 1, j -= 1) {
      dst[i] = src[j];
    }
  }
  return output;
}

/** Repeat the buffer `times` times, optionally with a short crossfade between repeats. */
export function loopBuffer(buffer, times, { crossfadeSec = 0 } = {}, createBuffer) {
  const count = Math.max(1, Math.round(times));
  if (count === 1 && !crossfadeSec) return buffer;

  const fade = crossfadeSec > 0 ? Math.min(Math.floor(crossfadeSec * buffer.sampleRate), Math.floor(buffer.length / 2)) : 0;
  const output = createBuffer(
    buffer.numberOfChannels,
    buffer.length * count - fade * (count - 1),
    buffer.sampleRate,
  );

  const stride = buffer.length - fade;
  for (let ch = 0; ch < buffer.numberOfChannels; ch += 1) {
    const src = buffer.getChannelData(ch);
    const dst = output.getChannelData(ch);
    dst.set(src.subarray(0, buffer.length));

    for (let n = 1; n < count; n += 1) {
      const writeAt = n * stride;
      for (let i = 0; i < fade; i += 1) {
        // Equal-power overlap between the tail of the previous repeat and the
        // head of the new one — a plain cut here is what makes loop points click.
        const ratio = i / fade;
        dst[writeAt + i] = src[buffer.length - fade + i] * (1 - ratio) + src[i] * ratio;
      }
      dst.set(src.subarray(fade), writeAt + fade);
    }
  }

  return output;
}

/** Join buffers in order with an optional silence gap and crossfade between items. */
export function mergeBuffers(buffers, { gapSec = 0, crossfadeSec = 0 } = {}, createBuffer) {
  if (!buffers?.length) throw new Error('Add at least one audio file to merge.');

  const rate = buffers[0].sampleRate;
  const channels = Math.max(...buffers.map((buffer) => buffer.numberOfChannels));
  const gap = Math.floor(gapSec * rate);
  const fade = Math.min(
    Math.floor(crossfadeSec * rate),
    ...buffers.map((buffer) => Math.floor(buffer.length / 2)),
  );

  let total = buffers[buffers.length - 1].length;
  for (let i = 0; i < buffers.length - 1; i += 1) {
    total += buffers[i].length + gap - fade;
  }

  const output = createBuffer(channels, total, rate);
  let offset = 0;

  buffers.forEach((buffer, index) => {
    for (let ch = 0; ch < channels; ch += 1) {
      const src = buffer.getChannelData(Math.min(ch, buffer.numberOfChannels - 1));
      const dst = output.getChannelData(ch);

      for (let i = 0; i < buffer.length; i += 1) {
        let sample = src[i];

        // Fade into whatever the previous file left behind, and duck the tail
        // that the next file will fade into. Both must happen per-channel so a
        // mono/stereo mix does not pan the fade region to one side.
        if (index > 0 && fade > 0 && i < fade) {
          sample = dst[offset + i] * (1 - i / fade) + sample * (i / fade);
        }
        if (index < buffers.length - 1 && fade > 0 && i >= buffer.length - fade) {
          sample *= (buffer.length - i) / fade;
        }

        dst[offset + i] = sample;
      }
    }

    offset += buffer.length;
    if (index < buffers.length - 1) offset += gap - fade;
  });

  return output;
}

/* ----------------------------------------------------------- Gain ops ---- */

/** Multiply every sample by `gain`, clamped to ±1 like a real DAC would. */
export function gainBuffer(buffer, gain, createBuffer) {
  const output = createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch += 1) {
    const src = buffer.getChannelData(ch);
    const dst = output.getChannelData(ch);
    for (let i = 0; i < buffer.length; i += 1) {
      const value = src[i] * gain;
      dst[i] = value > 1 ? 1 : value < -1 ? -1 : value;
    }
  }
  return output;
}

/** Scale so the loudest sample lands on `targetPeak` (0..1). */
export function normalizeBuffer(buffer, targetPeak = 0.95, createBuffer) {
  let peak = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch += 1) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i += 1) {
      const magnitude = Math.abs(data[i]);
      if (magnitude > peak) peak = magnitude;
    }
  }
  if (peak === 0) return buffer;
  return gainBuffer(buffer, targetPeak / peak, createBuffer);
}

const FADE_CURVES = {
  linear: (ratio) => ratio,
  exponential: (ratio) => ratio * ratio,
  logarithmic: (ratio) => Math.sqrt(ratio),
  sCurve: (ratio) => (ratio < 0.5 ? 2 * ratio * ratio : 1 - (-2 * ratio + 2) ** 2 / 2),
};

/** Fade the head and/or tail of the buffer over the given seconds. A fade set
    longer than the file simply fades the whole file — clamped, not an error. */
export function fadeBuffer(buffer, { fadeInSec = 0, fadeOutSec = 0, curve = 'linear' } = {}, createBuffer) {
  const shape = FADE_CURVES[curve] || FADE_CURVES.linear;
  const rate = buffer.sampleRate;
  const inSamples = Math.min(Math.floor(fadeInSec * rate), buffer.length);
  const outSamples = Math.min(Math.floor(fadeOutSec * rate), buffer.length);

  if (!inSamples && !outSamples) return buffer;

  const output = createBuffer(buffer.numberOfChannels, buffer.length, rate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch += 1) {
    const src = buffer.getChannelData(ch);
    const dst = output.getChannelData(ch);
    for (let i = 0; i < buffer.length; i += 1) {
      let gain = 1;
      if (i < inSamples) gain *= shape(i / inSamples);
      const fromEnd = buffer.length - i;
      if (fromEnd <= outSamples) gain *= shape(fromEnd / outSamples);
      dst[i] = src[i] * gain;
    }
  }
  return output;
}

/* -------------------------------------------------------- Restoration ---- */

/** Find runs quieter than `thresholdDb` lasting at least `minSec` — [{start,end}] seconds. */
export function findSilentRegions(buffer, { thresholdDb = -40, minSec = 0.5 } = {}) {
  const data = buffer.getChannelData(0);
  const rate = buffer.sampleRate;
  const threshold = 10 ** (thresholdDb / 20);
  const windowSize = Math.max(1, Math.floor(rate * 0.02));
  const minWindows = Math.max(1, Math.ceil((minSec * rate) / windowSize));

  const regions = [];
  let runStart = -1;
  let runLength = 0;

  for (let i = 0; i < data.length; i += windowSize) {
    const end = Math.min(i + windowSize, data.length);
    let sumSq = 0;
    for (let j = i; j < end; j += 1) sumSq += data[j] * data[j];
    const rms = Math.sqrt(sumSq / (end - i));

    if (rms < threshold) {
      if (runStart < 0) runStart = i;
      runLength += 1;
    } else if (runStart >= 0) {
      if (runLength >= minWindows) {
        regions.push({ start: runStart / rate, end: i / rate });
      }
      runStart = -1;
      runLength = 0;
    }
  }
  if (runStart >= 0 && runLength >= minWindows) {
    regions.push({ start: runStart / rate, end: data.length / rate });
  }

  return regions;
}

/**
 * Remove the given silent regions, leaving `paddingSec` on each side of every
 * cut so words do not butt against each other. The kept pieces are crossfaded
 * by `crossfadeMs` so joins do not click.
 */
export function removeSilence(buffer, regions, { paddingSec = 0.05, crossfadeMs = 50 } = {}, createBuffer) {
  if (!regions.length) return buffer;

  const rate = buffer.sampleRate;
  const padding = Math.floor(paddingSec * rate);
  const fade = Math.floor((crossfadeMs / 1000) * rate);

  // Turn the silent regions into the loud ranges worth keeping.
  const kept = [];
  let cursor = 0;
  regions.forEach(({ start, end }) => {
    const from = Math.max(0, Math.floor(start * rate) + padding);
    const to = Math.min(buffer.length, Math.floor(end * rate) - padding);
    if (from > cursor) kept.push([cursor, Math.min(from, buffer.length)]);
    cursor = Math.max(cursor, to);
  });
  if (cursor < buffer.length) kept.push([cursor, buffer.length]);

  const total = kept.reduce((sum, [from, to]) => sum + (to - from), 0);
  if (total <= 1) {
    throw new Error('Every part of the file is silent. Lower the threshold.');
  }

  const output = createBuffer(buffer.numberOfChannels, total, rate);
  let offset = 0;

  kept.forEach(([from, to], index) => {
    const overlap = index > 0 ? Math.min(fade, to - from) : 0;
    for (let ch = 0; ch < buffer.numberOfChannels; ch += 1) {
      const src = buffer.getChannelData(ch);
      const dst = output.getChannelData(ch);

      for (let i = 0; i < to - from; i += 1) {
        let sample = src[from + i];
        if (overlap > 0 && i < overlap) {
          const ratio = i / overlap;
          sample = dst[offset + i] * (1 - ratio) + sample * ratio;
        }
        dst[offset + i] = sample;
      }
    }
    offset += to - from - overlap;
  });

  return output;
}

/**
 * Noise gate: an envelope follower rides the signal level, and anything under
 * the threshold is attenuated by `reduction` (0..1). The attack/release
 * smoothing is what stops the gating from tracking individual wave cycles.
 */
export function noiseGate(buffer, { thresholdDb = -40, reduction = 0.7 } = {}, createBuffer) {
  const threshold = 10 ** (thresholdDb / 20);
  const attack = 0.01;
  const release = 0.05;

  const output = createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch += 1) {
    const src = buffer.getChannelData(ch);
    const dst = output.getChannelData(ch);
    let envelope = 0;

    for (let i = 0; i < buffer.length; i += 1) {
      const magnitude = Math.abs(src[i]);
      envelope =
        magnitude > envelope
          ? envelope * (1 - attack) + magnitude * attack
          : envelope * (1 - release) + magnitude * release;

      let gain = 1;
      if (envelope < threshold) {
        gain = 1 - reduction * (1 - envelope / threshold);
      }
      dst[i] = src[i] * gain;
    }
  }
  return output;
}

/* --------------------------------------------------------- Filter ops ---- */

/**
 * Chain an arbitrary series of biquad filters over the buffer:
 * `filters` = [{ type, frequency, gain?, q? }]. This is the shared engine for
 * the EQ, the bass/treble boosters and any future tone-shaping tool.
 */
export async function filterChainBuffer(buffer, filters) {
  const active = filters.filter((filter) => (filter.gain ?? 1) !== 0);
  if (!active.length) return buffer;

  const context = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  const source = context.createBufferSource();
  source.buffer = buffer;

  let node = source;
  active.forEach(({ type, frequency, gain = 0, q }) => {
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    if (type !== 'lowshelf' && type !== 'highshelf') filter.Q.value = q ?? 1.4;
    filter.gain.value = gain;
    node.connect(filter);
    node = filter;
  });

  node.connect(context.destination);
  source.start(0);
  return context.startRendering();
}

/** 10-band graphic EQ. `gainsDb` is an array of 10 values, 31 Hz → 16 kHz. */
export function eqBuffer(buffer, gainsDb) {
  const BANDS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
  return filterChainBuffer(
    buffer,
    BANDS.map((frequency, index) => ({ type: 'peaking', frequency, gain: gainsDb[index] || 0, q: 1.4 })),
  );
}

/** Convolution reverb with a synthesised decaying-noise impulse. */
export async function reverbBuffer(buffer, { decaySec = 2, mix = 0.3 } = {}) {
  if (decaySec <= 0 || mix <= 0) return buffer;

  const rate = buffer.sampleRate;
  const tail = Math.floor(decaySec * rate);
  const impulse = new OfflineAudioContext(2, tail, rate).createBuffer(2, tail, rate);

  for (let ch = 0; ch < 2; ch += 1) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < tail; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / tail) ** 2;
    }
  }

  const context = new OfflineAudioContext(buffer.numberOfChannels, buffer.length + tail, rate);
  const source = context.createBufferSource();
  source.buffer = buffer;

  const convolver = context.createConvolver();
  convolver.buffer = impulse;

  const dry = context.createGain();
  dry.gain.value = 1 - mix;
  const wet = context.createGain();
  wet.gain.value = mix;

  source.connect(dry).connect(context.destination);
  source.connect(convolver).connect(wet).connect(context.destination);
  source.start(0);
  return context.startRendering();
}

/** Feedback delay. The output runs three tail lengths past the input so the
    final repeats have somewhere to land. */
export function echoBuffer(buffer, { delaySec = 0.3, feedback = 0.3, mix = 0.4 } = {}, createBuffer) {
  const rate = buffer.sampleRate;
  const delay = Math.max(1, Math.floor(delaySec * rate));
  const output = createBuffer(
    buffer.numberOfChannels,
    buffer.length + delay * 3,
    rate,
  );

  for (let ch = 0; ch < buffer.numberOfChannels; ch += 1) {
    const src = buffer.getChannelData(ch);
    const dst = output.getChannelData(ch);

    for (let i = 0; i < output.length; i += 1) {
      const dry = i < buffer.length ? src[i] : 0;
      const tap1 = i >= delay ? dst[i - delay] * feedback : 0;
      const tap2 = i >= delay * 2 ? dst[i - delay * 2] * feedback * feedback : 0;
      const value = dry * (1 - mix) + (tap1 + tap2) * mix;
      dst[i] = value > 1 ? 1 : value < -1 ? -1 : value;
    }
  }
  return output;
}

/** Tanh soft-clip saturation; `tone` below 0.5 darkens the driven signal. */
export function distortBuffer(buffer, { drive = 3, tone = 0.5, mix = 1 } = {}, createBuffer) {
  const output = createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);

  for (let ch = 0; ch < buffer.numberOfChannels; ch += 1) {
    const src = buffer.getChannelData(ch);
    const dst = output.getChannelData(ch);

    for (let i = 0; i < buffer.length; i += 1) {
      let driven = Math.tanh(src[i] * drive);
      if (tone < 0.5 && i > 0) {
        // One-pole lowpass blended in by how dark the tone setting is.
        driven = driven * (0.5 + tone) + dst[i - 1] * (0.5 - tone);
      }
      dst[i] = (src[i] * (1 - mix) + driven * mix) * 0.7;
    }
  }
  return output;
}

/** Modulated short delay — the doubling/width effect. */
export function chorusBuffer(buffer, { depth = 0.5, rate = 1.5, mix = 0.5 } = {}, createBuffer) {
  const rate_ = buffer.sampleRate;
  const baseDelay = Math.floor(0.02 * rate_);
  const output = createBuffer(buffer.numberOfChannels, buffer.length, rate_);

  for (let ch = 0; ch < buffer.numberOfChannels; ch += 1) {
    const src = buffer.getChannelData(ch);
    const dst = output.getChannelData(ch);

    for (let i = 0; i < buffer.length; i += 1) {
      const lfo = Math.sin(2 * Math.PI * rate * (i / rate_));
      const delay = baseDelay + Math.floor(depth * 0.01 * rate_ * lfo);
      const delayed = i - delay >= 0 ? src[i - delay] : 0;
      dst[i] = src[i] * (1 - mix) + delayed * mix;
    }
  }
  return output;
}

/** Millisecond-scale sweeping delay with feedback — the jet effect. */
export function flangerBuffer(buffer, { depth = 0.7, rate = 0.5, feedback = 0.4 } = {}, createBuffer) {
  const rate_ = buffer.sampleRate;
  const delayLines = Math.floor(0.006 * rate_) + 1;
  const output = createBuffer(buffer.numberOfChannels, buffer.length, rate_);

  for (let ch = 0; ch < buffer.numberOfChannels; ch += 1) {
    const src = buffer.getChannelData(ch);
    const dst = output.getChannelData(ch);
    const delayLine = new Float32Array(delayLines);
    let write = 0;

    for (let i = 0; i < buffer.length; i += 1) {
      const lfo = Math.sin(2 * Math.PI * rate * (i / rate_));
      const delay = Math.floor(0.001 * rate_ + depth * 0.004 * rate_ * ((lfo + 1) / 2));
      const read = (write - delay + delayLines * 2) % delayLines;
      const delayed = delayLine[read];

      delayLine[write] = src[i] + delayed * feedback;
      write = (write + 1) % delayLines;

      dst[i] = src[i] * 0.7 + delayed * 0.5;
    }
  }
  return output;
}

/** Multiply the signal by a sine carrier — the metallic ring-mod sound. */
export function ringModBuffer(buffer, { frequency = 200, mix = 0.5 } = {}, createBuffer) {
  const rate = buffer.sampleRate;
  const output = createBuffer(buffer.numberOfChannels, buffer.length, rate);

  for (let ch = 0; ch < buffer.numberOfChannels; ch += 1) {
    const src = buffer.getChannelData(ch);
    const dst = output.getChannelData(ch);

    for (let i = 0; i < buffer.length; i += 1) {
      const carrier = Math.sin((2 * Math.PI * frequency * i) / rate);
      dst[i] = src[i] * (1 - mix) + src[i] * carrier * mix;
    }
  }
  return output;
}

/* ------------------------------------------------------------ Stereo ---- */

/**
 * Constant-ish pan: `pan` -1..1. Mono input is duplicated, so panning a mono
 * clip actually moves it instead of silencing one channel.
 */
export function panBuffer(buffer, pan = 0, createBuffer) {
  const srcL = buffer.getChannelData(0);
  const srcR = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : srcL;
  const leftGain = pan >= 0 ? 1 - pan : 1;
  const rightGain = pan <= 0 ? 1 + pan : 1;

  const output = createBuffer(2, buffer.length, buffer.sampleRate);
  const outL = output.getChannelData(0);
  const outR = output.getChannelData(1);
  for (let i = 0; i < buffer.length; i += 1) {
    outL[i] = srcL[i] * leftGain;
    outR[i] = srcR[i] * rightGain;
  }
  return output;
}

/** LFO panning — `shape` is sine, triangle or square; `depth` 0..1. */
export function autoPanBuffer(buffer, { rate = 1, depth = 0.8, shape = 'sine' } = {}, createBuffer) {
  const rate_ = buffer.sampleRate;
  const srcL = buffer.getChannelData(0);
  const srcR = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : srcL;

  const output = createBuffer(2, buffer.length, rate_);
  const outL = output.getChannelData(0);
  const outR = output.getChannelData(1);

  for (let i = 0; i < buffer.length; i += 1) {
    const t = i / rate_;
    let lfo;
    if (shape === 'triangle') {
      lfo = Math.abs(((t * rate * 2) % 2) - 1) * 2 - 1;
    } else if (shape === 'square') {
      lfo = Math.sin(2 * Math.PI * rate * t) >= 0 ? 1 : -1;
    } else {
      lfo = Math.sin(2 * Math.PI * rate * t);
    }

    const pan = lfo * depth;
    outL[i] = srcL[i] * (pan >= 0 ? 1 - pan : 1);
    outR[i] = srcR[i] * (pan <= 0 ? 1 + pan : 1);
  }
  return output;
}

/** The rotating "8D" effect: a circular pan plus a small Haas delay for depth. */
export function rotate8DBuffer(buffer, { speed = 0.5, intensity = 0.8 } = {}, createBuffer) {
  const rate = buffer.sampleRate;
  const srcL = buffer.getChannelData(0);
  const srcR = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : srcL;
  const haas = Math.floor(rate * 0.012);

  const output = createBuffer(2, buffer.length, rate);
  const outL = output.getChannelData(0);
  const outR = output.getChannelData(1);

  for (let i = 0; i < buffer.length; i += 1) {
    const angle = (2 * Math.PI * speed * i) / rate;
    // Mix each channel between centre and its point on the rotation circle.
    const leftGain = 1 - intensity + intensity * ((Math.cos(angle) + 1) / 2);
    const rightGain = 1 - intensity + intensity * ((Math.sin(angle) + 1) / 2);

    const delayedR = i >= haas ? srcR[i - haas] * 0.3 : 0;
    outL[i] = Math.max(-1, Math.min(1, srcL[i] * leftGain + srcR[i] * leftGain * 0.3));
    outR[i] = Math.max(-1, Math.min(1, srcR[i] * rightGain + delayedR * rightGain));
  }
  return output;
}

/**
 * Mid-side vocal cancellation: centre-panned content (usually the vocal) is
 * subtracted from both channels. `strength` above 1 over-subtracts, which keeps
 * more of the music's centre at the cost of some ambience.
 */
export function vocalRemoveBuffer(buffer, { strength = 1 } = {}, createBuffer) {
  if (buffer.numberOfChannels < 2) return buffer;

  const srcL = buffer.getChannelData(0);
  const srcR = buffer.getChannelData(1);
  const output = createBuffer(2, buffer.length, buffer.sampleRate);
  const outL = output.getChannelData(0);
  const outR = output.getChannelData(1);

  for (let i = 0; i < buffer.length; i += 1) {
    const mid = ((srcL[i] + srcR[i]) / 2) * strength;
    outL[i] = srcL[i] - mid;
    outR[i] = srcR[i] - mid;
  }
  return output;
}

/* -------------------------------------------------------- Time/pitch ---- */

/** Tape-style pitch shift: resample by 2^(semitones/12). Duration moves with it. */
export function pitchShiftBuffer(buffer, semitones, createBuffer) {
  if (!semitones) return buffer;

  const ratio = 2 ** (semitones / 12);
  const newLength = Math.floor(buffer.length / ratio);
  const output = createBuffer(buffer.numberOfChannels, newLength, buffer.sampleRate);

  for (let ch = 0; ch < buffer.numberOfChannels; ch += 1) {
    const src = buffer.getChannelData(ch);
    const dst = output.getChannelData(ch);
    for (let i = 0; i < newLength; i += 1) {
      const position = i * ratio;
      const index = Math.floor(position);
      const frac = position - index;
      const s0 = src[index] || 0;
      const s1 = src[index + 1] || 0;
      dst[i] = s0 * (1 - frac) + s1 * frac;
    }
  }
  return output;
}

/** Render the buffer at a new sample rate through an OfflineAudioContext. */
export async function resampleBuffer(buffer, targetRate) {
  if (buffer.sampleRate === targetRate) return buffer;

  const context = new OfflineAudioContext(
    buffer.numberOfChannels,
    Math.max(1, Math.ceil(buffer.duration * targetRate)),
    targetRate,
  );
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  source.start(0);
  return context.startRendering();
}

/** Crush to `bitDepth` levels — what 8-bit style "compression" meant here. */
export function quantizeBuffer(buffer, bitDepth = 8, createBuffer) {
  const levels = 2 ** bitDepth;
  const step = 2 / levels;

  const output = createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch += 1) {
    const src = buffer.getChannelData(ch);
    const dst = output.getChannelData(ch);
    for (let i = 0; i < buffer.length; i += 1) {
      dst[i] = Math.round(src[i] / step) * step;
    }
  }
  return output;
}

/** Dynamics-compressor pass (the "Audio Compressor" tool's level stage). */
export async function compressDynamics(buffer, { thresholdDb = -24, ratio = 4, attack = 0.01, release = 0.25, makeupDb = 0 } = {}) {
  const context = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  const source = context.createBufferSource();
  source.buffer = buffer;

  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = thresholdDb;
  compressor.ratio.value = ratio;
  compressor.attack.value = attack;
  compressor.release.value = release;
  compressor.knee.value = 12;

  const makeup = context.createGain();
  makeup.gain.value = 10 ** (makeupDb / 20);

  source.connect(compressor).connect(makeup).connect(context.destination);
  source.start(0);
  return context.startRendering();
}

/* --------------------------------------------------------- Analysis ---- */

/** Energy-peak tempo estimate, folded into 60–180 BPM. Returns 0 when unsure. */
export function detectBPM(buffer) {
  const data = buffer.getChannelData(0);
  const rate = buffer.sampleRate;
  const hop = Math.floor(rate * 0.01);

  const energy = [];
  for (let i = 0; i < data.length; i += hop) {
    const end = Math.min(i + hop, data.length);
    let sum = 0;
    for (let j = i; j < end; j += 1) sum += data[j] * data[j];
    energy.push(sum / (end - i));
  }
  if (energy.length < 10) return 0;

  const average = energy.reduce((a, b) => a + b, 0) / energy.length;
  const peaks = [];
  for (let i = 1; i < energy.length - 1; i += 1) {
    if (energy[i] > average * 1.5 && energy[i] > energy[i - 1] && energy[i] > energy[i + 1]) {
      peaks.push(i);
    }
  }

  const intervals = [];
  for (let i = 1; i < peaks.length; i += 1) {
    const seconds = (peaks[i] - peaks[i - 1]) * 0.01;
    if (seconds > 0.2 && seconds < 2) intervals.push(seconds);
  }
  if (intervals.length < 3) return 0;

  intervals.sort((a, b) => a - b);
  let bpm = 60 / intervals[Math.floor(intervals.length / 2)];
  while (bpm < 60) bpm *= 2;
  while (bpm > 180) bpm /= 2;
  return Math.round(bpm);
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Chromagram over a Hann-windowed FFT → root note and major/minor mode. */
export function detectKey(buffer) {
  const fftSize = 8192;
  const data = buffer.getChannelData(0);
  if (data.length < fftSize) return { note: '—', mode: '', full: 'Not enough audio', chroma: new Array(12).fill(0) };

  const pitchClasses = new Array(12).fill(0);
  const numWindows = Math.min(30, Math.floor(data.length / fftSize));
  const hop = Math.floor((data.length - fftSize) / Math.max(numWindows, 1));

  for (let w = 0; w < numWindows; w += 1) {
    const magnitudes = computeFFT(data, w * hop, fftSize);
    for (let i = 1; i < fftSize / 2; i += 1) {
      const frequency = (i * buffer.sampleRate) / fftSize;
      if (frequency < 80 || frequency > 2000) continue;

      const midi = 12 * Math.log2(frequency / 440) + 69;
      pitchClasses[(Math.round(midi) % 12 + 12) % 12] += magnitudes[i];
    }
  }

  let maxIndex = 0;
  let maxTotal = 0;
  let sum = 0;
  for (let i = 0; i < 12; i += 1) {
    sum += pitchClasses[i];
    if (pitchClasses[i] > maxTotal) {
      maxTotal = pitchClasses[i];
      maxIndex = i;
    }
  }

  const majorThird = (maxIndex + 4) % 12;
  const minorThird = (maxIndex + 3) % 12;
  const isMinor = pitchClasses[minorThird] > pitchClasses[majorThird];
  const note = NOTE_NAMES[maxIndex];
  const mode = isMinor ? 'minor' : 'major';

  return {
    note,
    mode,
    full: `${note} ${mode}`,
    confidence: sum ? maxTotal / sum : 0,
    // Normalised chroma for the 12-bar display.
    chroma: pitchClasses.map((value) => (maxTotal ? value / maxTotal : 0)),
  };
}

/** Radix-2 Cooley–Tukey FFT, returned as magnitudes for the first half. */
export function computeFFT(data, start, size) {
  const re = new Float32Array(size);
  const im = new Float32Array(size);

  for (let i = 0; i < size; i += 1) {
    const window = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
    re[i] = (data[start + i] || 0) * window;
  }

  const bits = Math.log2(size);
  for (let i = 0; i < size; i += 1) {
    let j = 0;
    for (let b = 0; b < bits; b += 1) {
      j = (j << 1) | ((i >> b) & 1);
    }
    if (j > i) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }

  for (let len = 2; len <= size; len *= 2) {
    const halfLen = len / 2;
    const angle = (-2 * Math.PI) / len;
    for (let i = 0; i < size; i += len) {
      for (let k = 0; k < halfLen; k += 1) {
        const wRe = Math.cos(angle * k);
        const wIm = Math.sin(angle * k);
        const uRe = re[i + k];
        const uIm = im[i + k];
        const vRe = wRe * re[i + k + halfLen] - wIm * im[i + k + halfLen];
        const vIm = wRe * im[i + k + halfLen] + wIm * re[i + k + halfLen];
        re[i + k + halfLen] = uRe - vRe;
        im[i + k + halfLen] = uIm - vIm;
        re[i + k] = uRe + vRe;
        im[i + k] = uIm + vIm;
      }
    }
  }

  const magnitudes = new Float32Array(size / 2);
  for (let i = 0; i < size / 2; i += 1) {
    magnitudes[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]);
  }
  return magnitudes;
}

/** Peak / true-peak / RMS / LUFS-style loudness read-out, all in dB. */
export function measureLoudness(buffer) {
  const data = buffer.getChannelData(0);
  let sumSq = 0;
  let peak = 0;
  let truePeak = 0;

  for (let i = 0; i < data.length; i += 1) {
    const magnitude = Math.abs(data[i]);
    if (magnitude > peak) peak = magnitude;
    sumSq += data[i] * data[i];

    // 4x linear oversample between neighbours — a cheap stand-in for a proper
    // reconstructive true-peak meter, but it catches the intersample peaks that
    // a plain sample-max misses.
    if (i > 0) {
      const mid1 = (data[i - 1] + data[i]) / 2;
      const mid2 = (data[i - 1] + mid1) / 2;
      const mid3 = (mid1 + data[i]) / 2;
      truePeak = Math.max(truePeak, Math.abs(mid1), Math.abs(mid2), Math.abs(mid3));
    }
  }

  const rms = Math.sqrt(sumSq / (data.length || 1));
  const toDb = (value) => 20 * Math.log10(value || 0.0001);
  const peakDb = toDb(peak);
  const truePeakDb = toDb(Math.max(truePeak, peak));

  return {
    peak: peakDb,
    truePeak: truePeakDb,
    rms: toDb(rms),
    lufs: toDb(rms) - 3,
    headroom: -peakDb,
  };
}

/** Stereo correlation / width / phase health, sampled every 10th frame. */
export function analyzeStereo(buffer) {
  if (buffer.numberOfChannels < 2) {
    return { stereo: false, message: 'This file is mono — there is no stereo image to check.' };
  }

  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);
  let sumLR = 0;
  let sumLL = 0;
  let sumRR = 0;
  let outOfPhase = 0;
  let total = 0;

  for (let i = 0; i < left.length; i += 10) {
    const l = left[i];
    const r = right[i];
    sumLR += l * r;
    sumLL += l * l;
    sumRR += r * r;
    if (Math.abs(l + r) < Math.abs(l - r)) outOfPhase += 1;
    total += 1;
  }

  const correlation = sumLR / Math.sqrt((sumLL * sumRR || 1));
  return {
    stereo: true,
    correlation,
    width: ((1 - correlation) / 2) * 100,
    phaseIssuePercent: (outOfPhase / (total || 1)) * 100,
    monoCompatible: correlation > 0.2,
  };
}

/* ------------------------------------------------------- Synthesis ---- */

const OSCILLATORS = {
  sine: (phase) => Math.sin(phase),
  square: (phase) => (Math.sin(phase) >= 0 ? 1 : -1),
  sawtooth: (phase) => 2 * ((phase / (2 * Math.PI)) % 1) - 1,
  triangle: (phase) => 2 * Math.abs(2 * ((phase / (2 * Math.PI)) % 1) - 1) - 1,
};

/** Render a test tone into a buffer (sine / square / sawtooth / triangle). */
export function generateTone({ durationSec = 1, frequency = 440, waveform = 'sine', amplitude = 0.8, sampleRate = 44100, channels = 2 } = {}, createBuffer) {
  const shape = OSCILLATORS[waveform] || OSCILLATORS.sine;
  const length = Math.floor(durationSec * sampleRate);
  const output = createBuffer(channels, length, sampleRate);
  const fadeIn = Math.min(Math.floor(0.005 * sampleRate), Math.floor(length / 2));

  for (let ch = 0; ch < channels; ch += 1) {
    const dst = output.getChannelData(ch);
    for (let i = 0; i < length; i += 1) {
      // 5 ms fade at each edge — a raw square wave cut mid-cycle audibly clicks.
      let gain = 1;
      if (i < fadeIn) gain = i / fadeIn;
      if (i > length - fadeIn) gain = (length - i) / fadeIn;
      dst[i] = shape(2 * Math.PI * frequency * (i / sampleRate)) * amplitude * gain;
    }
  }
  return output;
}

/** Short beep used as the tone watermark. */
export function generateBeep({ durationSec = 0.5, frequency = 880, sampleRate = 44100, amplitude = 0.5 } = {}) {
  const length = Math.floor(durationSec * sampleRate);
  const data = new Float32Array(length);
  const fadeIn = Math.min(Math.floor(0.005 * sampleRate), Math.floor(length / 2));

  for (let i = 0; i < length; i += 1) {
    let gain = 1;
    if (i < fadeIn) gain = i / fadeIn;
    if (i > length - fadeIn) gain = (length - i) / fadeIn;
    data[i] = Math.sin(2 * Math.PI * frequency * (i / sampleRate)) * amplitude * gain;
  }
  return data;
}

/** Mix a watermark (Float32Array) into the buffer at the chosen position(s). */
export function applyWatermark(buffer, watermark, { position = 'start', volume = 0.7, duck = true, everySec = 30 } = {}, createBuffer) {
  const rate = buffer.sampleRate;
  const channels = buffer.numberOfChannels;
  const length = watermark.length;
  const output = createBuffer(channels, buffer.length, rate);

  const positions = [];
  if (position === 'start') positions.push(Math.floor(0.1 * rate));
  else if (position === 'middle') positions.push(Math.max(0, Math.floor(buffer.length / 2 - length / 2)));
  else if (position === 'end') positions.push(Math.max(0, buffer.length - length - Math.floor(0.1 * rate)));
  else {
    for (let i = Math.floor(rate); i < buffer.length; i += everySec * rate) {
      positions.push(i);
    }
  }

  for (let ch = 0; ch < channels; ch += 1) {
    const src = buffer.getChannelData(ch);
    const dst = output.getChannelData(ch);
    for (let i = 0; i < buffer.length; i += 1) {
      let sample = src[i];
      for (const start of positions) {
        if (i >= start && i < start + length) {
          if (duck) sample *= 0.35;
          sample += watermark[i - start] * volume;
          break;
        }
      }
      dst[i] = Math.max(-1, Math.min(1, sample));
    }
  }
  return output;
}

/* ------------------------------------------------------------- ID3 ---- */

/** Remove an existing ID3v2 tag (if any) from MP3 bytes. */
export function stripId3(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  if (view.byteLength < 10) return arrayBuffer;
  if (view.getUint8(0) !== 0x49 || view.getUint8(1) !== 0x44 || view.getUint8(2) !== 0x33) {
    return arrayBuffer; // not "ID3"
  }

  const flags = view.getUint8(5);
  let size = ((view.getUint8(6) & 0x7f) << 21) | ((view.getUint8(7) & 0x7f) << 14)
    | ((view.getUint8(8) & 0x7f) << 7) | (view.getUint8(9) & 0x7f);
  if (flags & 0x40) size += 10; // extended header

  return arrayBuffer.slice(10 + size);
}

/** Build an ID3v2.3 tag from metadata; `coverBytes` is an image File's bytes. */
export function buildId3v2Tag({ title = '', artist = '', album = '', year = '', genre = '', track = '', comment = '' } = {}, cover = null) {
  const frames = [];

  const textFrame = (id, value) => {
    if (!value) return;
    const bytes = new TextEncoder().encode(value);
    const frame = new Uint8Array(10 + 1 + bytes.length);
    writeAscii(frame, 0, id);
    new DataView(frame.buffer).setUint32(4, bytes.length + 1);
    frame[10] = 0x00; // ISO-8859-1
    frame.set(bytes, 11);
    frames.push(frame);
  };

  textFrame('TIT2', title);
  textFrame('TPE1', artist);
  textFrame('TALB', album);
  textFrame('TYER', year);
  textFrame('TCON', genre);
  textFrame('TRCK', track);

  if (comment) {
    const bytes = new TextEncoder().encode(comment);
    const frame = new Uint8Array(10 + 4 + bytes.length);
    writeAscii(frame, 0, 'COMM');
    new DataView(frame.buffer).setUint32(4, bytes.length + 4);
    frame.set([0, 'e', 'n', 'g'], 10);
    frame.set(bytes, 14);
    frames.push(frame);
  }

  if (cover) {
    const mime = new TextEncoder().encode(cover.mime || 'image/jpeg');
    const data = cover.bytes;
    const frame = new Uint8Array(10 + 1 + mime.length + 1 + 1 + data.length);
    writeAscii(frame, 0, 'APIC');
    new DataView(frame.buffer).setUint32(4, frame.length - 10);
    let at = 10;
    frame[at] = 0; // text encoding
    frame.set(mime, at + 1);
    at += 1 + mime.length + 1;
    frame[at] = 3; // front cover
    at += 1;
    frame[at] = 0; // empty description
    frame.set(data, at + 1);
    frames.push(frame);
  }

  const bodySize = frames.reduce((sum, frame) => sum + frame.length, 0);
  const tag = new Uint8Array(10 + bodySize);
  writeAscii(tag, 0, 'ID3');
  tag[3] = 3; // version 2.3
  // Syncsafe integer: 4 × 7 bits, the size encoding ID3v2 mandates.
  tag[6] = (bodySize >> 21) & 0x7f;
  tag[7] = (bodySize >> 14) & 0x7f;
  tag[8] = (bodySize >> 7) & 0x7f;
  tag[9] = bodySize & 0x7f;

  let offset = 10;
  frames.forEach((frame) => {
    tag.set(frame, offset);
    offset += frame.length;
  });

  return tag;
}

/** Prepend a built tag to stripped MP3 bytes. */
export function withId3Tag(strippedBuffer, tagBytes) {
  const merged = new Uint8Array(tagBytes.length + strippedBuffer.byteLength);
  merged.set(tagBytes, 0);
  merged.set(new Uint8Array(strippedBuffer), tagBytes.length);
  return merged.buffer;
}

function writeAscii(target, offset, text) {
  for (let i = 0; i < text.length; i += 1) target[offset + i] = text.charCodeAt(i);
}

/* ---------------------------------------------------------- Helpers ---- */

/** Estimated WAV payload size, for the "how big will this be" stats. */
export function estimateWavBytes(buffer, bitDepth = 16) {
  const bytesPerSample = bitDepth / 8;
  return 44 + buffer.length * buffer.numberOfChannels * bytesPerSample;
}
