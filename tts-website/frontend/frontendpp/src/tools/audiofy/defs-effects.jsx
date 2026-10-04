// src/tools/audiofy/defs-effects.jsx
// The 18 members of the Effects category — every one a parametric BufferTool,
// with the originals' slider ranges carried over intact.

import {
  AudioLines, AudioWaveform, CloudFog, Disc3, Gauge, Magnet, Mic, Music4,
  Radio, Repeat2, SlidersHorizontal, Sparkles, Speaker, Waves, Wind, Zap,
} from 'lucide-react';
import { BufferTool, PresetRow } from './toolkit';
import { timeStretch } from '../../lib/audio';
import {
  autoPanBuffer, chorusBuffer, distortBuffer, echoBuffer, eqBuffer, filterChainBuffer,
  flangerBuffer, gainBuffer, noiseGate, normalizeBuffer, panBuffer, pitchShiftBuffer,
  reverbBuffer, ringModBuffer, rotate8DBuffer, vocalRemoveBuffer,
} from '../../lib/audiofy';
import { formatBytes, formatDuration } from '../../lib/utils';

const pct = (v) => `${v}%`;
const times = (v) => `${v.toFixed(2)}×`;

/** Size/duration trio shown by the heavier effects. */
const outStats = (buffer, extra = []) => [
  { label: 'Duration', value: formatDuration(buffer.duration) },
  { label: 'Channels', value: buffer.numberOfChannels === 1 ? 'Mono' : 'Stereo' },
  { label: 'WAV size', value: `~${formatBytes(44 + buffer.length * buffer.numberOfChannels * 2)}` },
  ...extra,
];

const BAND_LABELS = ['31 Hz', '62 Hz', '125 Hz', '250 Hz', '500 Hz', '1 kHz', '2 kHz', '4 kHz', '8 kHz', '16 kHz'];

const EQ_PRESETS = {
  Flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  'Bass boost': [8, 7, 5, 3, 1, 0, 0, 0, 0, 0],
  'Treble boost': [0, 0, 0, 0, 0, 1, 3, 5, 7, 8],
  Vocal: [-3, -2, 0, 2, 4, 4, 3, 1, 0, -1],
  'Lo-fi': [-3, -1, 2, 4, 3, 1, -1, -3, -5, -7],
};

export const EFFECT_TOOLS = [
  {
    id: 'volume-changer',
    name: 'Volume Changer',
    icon: Speaker,
    description: 'Boost or attenuate loudness, with clipping kept honest.',
    component: BufferTool,
    definition: {
      waveform: true,
      processHint: 'Apply volume',
      params: [
        { key: 'percent', label: 'Volume', kind: 'range', min: 0, max: 500, step: 5, defaultValue: 100, format: pct },
      ],
      run: ({ buffer, params, createBuffer }) => {
        const gain = params.percent / 100;
        const output = gainBuffer(buffer, gain, createBuffer);
        const db = gain > 0 ? (20 * Math.log10(gain)).toFixed(1) : '−∞';
        return {
          buffer: output,
          stats: outStats(output, [{ label: 'Applied gain', value: `${db} dB` }]),
          note: gain > 1.4
            ? 'Above +3 dB samples start clipping against the ceiling — the waveform flattens where it hits. Prefer normalizing for loudness.'
            : undefined,
          toast: 'Volume applied',
        };
      },
    },
  },

  {
    id: 'bass-booster',
    name: 'Bass Booster',
    icon: Disc3,
    description: 'Lift the sub, the body and the low-mids without touching the top.',
    component: BufferTool,
    definition: {
      waveform: true,
      processHint: 'Boost bass',
      params: [
        { key: 'sub', label: 'Sub (below 80 Hz)', kind: 'range', min: 0, max: 18, step: 1, defaultValue: 0, format: (v) => `+${v} dB` },
        { key: 'bass', label: 'Bass (150 Hz)', kind: 'range', min: 0, max: 18, step: 1, defaultValue: 0, format: (v) => `+${v} dB` },
        { key: 'mid', label: 'Low-mids (350 Hz)', kind: 'range', min: 0, max: 12, step: 1, defaultValue: 0, format: (v) => `+${v} dB` },
      ],
      run: async ({ buffer, params }) => {
        const output = await filterChainBuffer(buffer, [
          { type: 'lowshelf', frequency: 80, gain: params.sub },
          { type: 'peaking', frequency: 150, gain: params.bass, q: 1 },
          { type: 'peaking', frequency: 350, gain: params.mid, q: 1 },
        ]);
        return { buffer: output, stats: outStats(output), toast: 'Bass boosted' };
      },
    },
  },

  {
    id: 'treble-booster',
    name: 'Treble Booster',
    icon: Sparkles,
    description: 'Add presence and air in the high shelf.',
    component: BufferTool,
    definition: {
      waveform: true,
      processHint: 'Boost treble',
      params: [
        { key: 'gain', label: 'Boost above 4 kHz', kind: 'range', min: 0, max: 15, step: 1, defaultValue: 0, format: (v) => `+${v} dB` },
      ],
      run: async ({ buffer, params }) => {
        const output = await filterChainBuffer(buffer, [
          { type: 'highshelf', frequency: 4000, gain: params.gain },
        ]);
        return { buffer: output, stats: outStats(output), toast: 'Treble boosted' };
      },
    },
  },

  {
    id: 'equalizer',
    name: 'Equalizer',
    icon: SlidersHorizontal,
    description: 'Ten-band graphic EQ with quick presets.',
    component: BufferTool,
    definition: {
      waveform: true,
      processHint: 'Apply EQ',
      settingsTitle: 'Equalizer',
      params: BAND_LABELS.map((label, index) => ({
        key: `band${index}`,
        label,
        kind: 'range',
        min: -12,
        max: 12,
        step: 1,
        defaultValue: 0,
        format: (v) => `${v > 0 ? '+' : ''}${v} dB`,
      })),
      extraControls: (params, patch) => (
        <PresetRow
          label="Presets"
          presets={Object.fromEntries(
            Object.entries(EQ_PRESETS).map(([name, gains]) => [
              name,
              Object.fromEntries(gains.map((gain, i) => [`band${i}`, gain])),
            ]),
          )}
          onPick={patch}
        />
      ),
      run: async ({ buffer, params }) => {
        const gains = Array.from({ length: 10 }, (_, i) => params[`band${i}`] || 0);
        const output = await eqBuffer(buffer, gains);
        return { buffer: output, stats: outStats(output), toast: 'EQ applied' };
      },
    },
  },

  {
    id: 'reverb',
    name: 'Reverb',
    icon: AudioLines,
    description: 'Room, hall and cathedral ambience from a convolution reverb.',
    component: BufferTool,
    definition: {
      waveform: true,
      processHint: 'Apply reverb',
      params: [
        { key: 'decaySec', label: 'Decay time', kind: 'range', min: 0.1, max: 6, step: 0.1, defaultValue: 1.5, format: (v) => `${v.toFixed(1)} s` },
        { key: 'mix', label: 'Wet mix', kind: 'range', min: 0, max: 100, step: 5, defaultValue: 30, format: pct },
      ],
      extraControls: (params, patch) => (
        <PresetRow
          label="Room presets"
          presets={{
            Small: { decaySec: 0.6, mix: 25 },
            Medium: { decaySec: 1.5, mix: 30 },
            Large: { decaySec: 2.5, mix: 35 },
            Cathedral: { decaySec: 4, mix: 45 },
          }}
          onPick={patch}
        />
      ),
      run: async ({ buffer, params }) => {
        const output = await reverbBuffer(buffer, { decaySec: params.decaySec, mix: params.mix / 100 });
        return { buffer: output, stats: outStats(output), toast: 'Reverb applied' };
      },
    },
  },

  {
    id: 'echo',
    name: 'Echo',
    icon: Radio,
    description: 'Delay with feedback — slaps, tails and space.',
    component: BufferTool,
    definition: {
      waveform: true,
      processHint: 'Apply echo',
      params: [
        { key: 'delayMs', label: 'Delay time', kind: 'range', min: 50, max: 1500, step: 10, defaultValue: 300, format: (v) => `${v} ms` },
        { key: 'feedback', label: 'Feedback', kind: 'range', min: 0, max: 85, step: 5, defaultValue: 30, format: pct },
        { key: 'mix', label: 'Echo mix', kind: 'range', min: 0, max: 100, step: 5, defaultValue: 40, format: pct },
      ],
      run: ({ buffer, params, createBuffer }) => {
        const output = echoBuffer(buffer, {
          delaySec: params.delayMs / 1000,
          feedback: params.feedback / 100,
          mix: params.mix / 100,
        }, createBuffer);
        return { buffer: output, stats: outStats(output), toast: 'Echo applied' };
      },
    },
  },

  {
    id: 'pitch-shifter',
    name: 'Pitch Shifter',
    icon: AudioWaveform,
    description: 'Shift pitch up or down by semitones — tape-style, so length moves too.',
    component: BufferTool,
    definition: {
      waveform: true,
      processHint: 'Shift pitch',
      params: [
        { key: 'semitones', label: 'Pitch shift', kind: 'range', min: -12, max: 12, step: 1, defaultValue: 0, format: (v) => `${v > 0 ? '+' : ''}${v} st` },
      ],
      run: ({ buffer, params, createBuffer }) => {
        const output = pitchShiftBuffer(buffer, params.semitones, createBuffer);
        return {
          buffer: output,
          stats: outStats(output, [{ label: 'New length', value: formatDuration(output.duration) }]),
          note: 'This is tape-style shifting: the track speeds up or slows down along with the pitch. For pitch-locked tempo, use the Tempo Changer.',
          toast: `Shifted ${params.semitones > 0 ? 'up' : 'down'} ${Math.abs(params.semitones)} semitones`,
        };
      },
    },
  },

  {
    id: 'tempo-changer',
    name: 'Tempo Changer',
    icon: Gauge,
    description: 'Speed the track up or down while the pitch stays put.',
    component: BufferTool,
    definition: {
      waveform: true,
      processHint: 'Change tempo',
      params: [
        { key: 'speed', label: 'Tempo', kind: 'range', min: 0.5, max: 2, step: 0.05, defaultValue: 1, format: times },
      ],
      extraControls: (params, patch) => (
        <PresetRow
          label="Speed presets"
          presets={{ '0.5×': { speed: 0.5 }, '0.75×': { speed: 0.75 }, '1.5×': { speed: 1.5 }, '2×': { speed: 2 } }}
          onPick={patch}
        />
      ),
      run: ({ buffer, params, createBuffer, onProgress }) =>
        timeStretch({
          buffer,
          speed: params.speed,
          createBuffer,
          onProgress,
        }).then((output) => ({
          buffer: output,
          stats: outStats(output, [{ label: 'Speed', value: times(params.speed) }]),
          toast: `Tempo set to ${times(params.speed)}`,
        })),
    },
  },

  {
    id: 'stereo-panner',
    name: 'Stereo Panner',
    icon: SlidersHorizontal,
    description: 'Set the left/right balance of the track.',
    component: BufferTool,
    definition: {
      waveform: true,
      processHint: 'Apply pan',
      params: [
        { key: 'pan', label: 'Pan', kind: 'range', min: -100, max: 100, step: 5, defaultValue: 0, format: (v) => (v === 0 ? 'Centre' : `${v > 0 ? 'R' : 'L'} ${Math.abs(v)}`) },
      ],
      run: ({ buffer, params, createBuffer }) => {
        const output = panBuffer(buffer, params.pan / 100, createBuffer);
        return { buffer: output, stats: outStats(output), toast: 'Panning applied' };
      },
    },
  },

  {
    id: 'auto-panner',
    name: 'Auto Panner',
    icon: Repeat2,
    description: 'Sweep the signal between channels on an LFO.',
    component: BufferTool,
    definition: {
      waveform: true,
      processHint: 'Apply auto-pan',
      params: [
        { key: 'rate', label: 'Sweep rate', kind: 'range', min: 0.1, max: 5, step: 0.1, defaultValue: 1, format: (v) => `${v.toFixed(1)} Hz` },
        { key: 'depth', label: 'Depth', kind: 'range', min: 0, max: 100, step: 5, defaultValue: 80, format: pct },
        {
          key: 'shape',
          label: 'LFO shape',
          kind: 'segmented',
          defaultValue: 'sine',
          options: [
            { value: 'sine', label: 'Sine' },
            { value: 'triangle', label: 'Triangle' },
            { value: 'square', label: 'Square' },
          ],
        },
      ],
      run: ({ buffer, params, createBuffer }) => {
        const output = autoPanBuffer(buffer, { rate: params.rate, depth: params.depth / 100, shape: params.shape }, createBuffer);
        return { buffer: output, stats: outStats(output), toast: 'Auto-pan applied' };
      },
    },
  },

  {
    id: '8d-audio',
    name: '8D Audio',
    icon: Disc3,
    description: 'The rotating spatial effect headphones were invented for.',
    component: BufferTool,
    definition: {
      waveform: true,
      processHint: 'Create 8D audio',
      params: [
        { key: 'speed', label: 'Rotation speed', kind: 'range', min: 0.1, max: 3, step: 0.1, defaultValue: 0.5, format: (v) => `${v.toFixed(1)} rev/s` },
        { key: 'intensity', label: 'Intensity', kind: 'range', min: 20, max: 100, step: 5, defaultValue: 80, format: pct },
      ],
      run: ({ buffer, params, createBuffer }) => {
        const output = rotate8DBuffer(buffer, { speed: params.speed, intensity: params.intensity / 100 }, createBuffer);
        return {
          buffer: output,
          stats: outStats(output),
          note: '8D audio only makes sense on headphones — on speakers the rotation largely disappears.',
          toast: '8D audio created',
        };
      },
    },
  },

  {
    id: 'vocal-remover',
    name: 'Vocal Remover',
    icon: Mic,
    description: 'Cancel centre-panned content — the classic karaoke pass.',
    component: BufferTool,
    definition: {
      waveform: true,
      processHint: 'Remove vocals',
      params: [
        { key: 'strength', label: 'Cancellation strength', kind: 'range', min: 0, max: 150, step: 5, defaultValue: 100, format: pct },
      ],
      run: ({ buffer, params, createBuffer }) => {
        if (buffer.numberOfChannels < 2) {
          throw new Error('This file is mono. Vocal removal needs a stereo track to cancel against.');
        }
        const output = vocalRemoveBuffer(buffer, { strength: params.strength / 100 }, createBuffer);
        return {
          buffer: output,
          stats: outStats(output),
          note: 'Only centre-panned material (usually the lead vocal) is removed; anything hard-panned survives.',
          toast: 'Vocals cancelled',
        };
      },
    },
  },

  {
    id: 'audio-normalizer',
    name: 'Audio Normalizer',
    icon: Waves,
    description: 'Bring the loudest moment to a target peak.',
    component: BufferTool,
    definition: {
      waveform: true,
      processHint: 'Normalize',
      params: [
        { key: 'peakDb', label: 'Target peak', kind: 'range', min: -6, max: 0, step: 0.5, defaultValue: -1, format: (v) => `${v} dB` },
      ],
      run: ({ buffer, params, createBuffer }) => {
        const target = 10 ** (params.peakDb / 20);
        const output = normalizeBuffer(buffer, target, createBuffer);
        return {
          buffer: output,
          stats: outStats(output, [{ label: 'Target peak', value: `${params.peakDb} dB` }]),
          toast: 'Normalized',
        };
      },
    },
  },

  {
    id: 'noise-reducer',
    name: 'Noise Reducer',
    icon: Wind,
    description: 'Gate hiss, hum and room tone with an envelope follower.',
    component: BufferTool,
    definition: {
      waveform: true,
      processHint: 'Reduce noise',
      params: [
        { key: 'thresholdDb', label: 'Gate threshold', kind: 'range', min: -60, max: -20, step: 1, defaultValue: -40, format: (v) => `${v} dB` },
        { key: 'reduction', label: 'Reduction', kind: 'range', min: 0, max: 100, step: 5, defaultValue: 70, format: pct },
      ],
      extraControls: (params, patch) => (
        <PresetRow
          label="Presets"
          presets={{
            Light: { thresholdDb: -50, reduction: 40 },
            Medium: { thresholdDb: -40, reduction: 70 },
            Aggressive: { thresholdDb: -30, reduction: 90 },
          }}
          onPick={patch}
        />
      ),
      run: ({ buffer, params, createBuffer }) => {
        const output = noiseGate(buffer, params, createBuffer);
        return { buffer: output, stats: outStats(output), toast: 'Noise reduced' };
      },
    },
  },

  {
    id: 'distortion',
    name: 'Distortion',
    icon: Zap,
    description: 'Warm tanh saturation with a tone control.',
    component: BufferTool,
    definition: {
      waveform: true,
      processHint: 'Apply distortion',
      params: [
        { key: 'drive', label: 'Drive', kind: 'range', min: 1, max: 15, step: 0.5, defaultValue: 3, format: times },
        { key: 'tone', label: 'Tone', kind: 'range', min: 0, max: 100, step: 5, defaultValue: 50, format: (v) => (v < 50 ? 'Dark' : v > 50 ? 'Bright' : 'Neutral') },
        { key: 'mix', label: 'Mix', kind: 'range', min: 0, max: 100, step: 5, defaultValue: 100, format: pct },
      ],
      run: ({ buffer, params, createBuffer }) => {
        const output = distortBuffer(buffer, { drive: params.drive, tone: params.tone / 100, mix: params.mix / 100 }, createBuffer);
        return { buffer: output, stats: outStats(output), toast: 'Distortion applied' };
      },
    },
  },

  {
    id: 'chorus',
    name: 'Chorus',
    icon: Music4,
    description: 'Modulated doubling for width and shimmer.',
    component: BufferTool,
    definition: {
      waveform: true,
      processHint: 'Apply chorus',
      params: [
        { key: 'depth', label: 'Depth', kind: 'range', min: 0, max: 100, step: 5, defaultValue: 50, format: pct },
        { key: 'rate', label: 'Rate', kind: 'range', min: 0.1, max: 5, step: 0.1, defaultValue: 1.5, format: (v) => `${v.toFixed(1)} Hz` },
        { key: 'mix', label: 'Mix', kind: 'range', min: 0, max: 100, step: 5, defaultValue: 50, format: pct },
      ],
      run: ({ buffer, params, createBuffer }) => {
        const output = chorusBuffer(buffer, { depth: params.depth / 100, rate: params.rate, mix: params.mix / 100 }, createBuffer);
        return { buffer: output, stats: outStats(output), toast: 'Chorus applied' };
      },
    },
  },

  {
    id: 'flanger',
    name: 'Flanger',
    icon: CloudFog,
    description: 'The sweeping jet-plane comb filter.',
    component: BufferTool,
    definition: {
      waveform: true,
      processHint: 'Apply flanger',
      params: [
        { key: 'depth', label: 'Depth', kind: 'range', min: 0, max: 100, step: 5, defaultValue: 70, format: pct },
        { key: 'rate', label: 'Rate', kind: 'range', min: 0.1, max: 3, step: 0.1, defaultValue: 0.5, format: (v) => `${v.toFixed(1)} Hz` },
        { key: 'feedback', label: 'Feedback', kind: 'range', min: 0, max: 85, step: 5, defaultValue: 40, format: pct },
      ],
      run: ({ buffer, params, createBuffer }) => {
        const output = flangerBuffer(buffer, { depth: params.depth / 100, rate: params.rate, feedback: params.feedback / 100 }, createBuffer);
        return { buffer: output, stats: outStats(output), toast: 'Flanger applied' };
      },
    },
  },

  {
    id: 'ring-modulator',
    name: 'Ring Modulator',
    icon: Magnet,
    description: 'Multiply by a carrier — Daleks, sci-fi and metallic clangs.',
    component: BufferTool,
    definition: {
      waveform: true,
      processHint: 'Apply ring mod',
      params: [
        { key: 'frequency', label: 'Carrier frequency', kind: 'range', min: 20, max: 2000, step: 10, defaultValue: 200, format: (v) => `${v} Hz` },
        { key: 'mix', label: 'Mix', kind: 'range', min: 0, max: 100, step: 5, defaultValue: 50, format: pct },
      ],
      run: ({ buffer, params, createBuffer }) => {
        const output = ringModBuffer(buffer, { frequency: params.frequency, mix: params.mix / 100 }, createBuffer);
        return { buffer: output, stats: outStats(output), toast: 'Ring mod applied' };
      },
    },
  },
];
