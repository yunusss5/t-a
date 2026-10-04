// src/tools/audiofy/defs-edit.jsx
// Parametric members of the Edit category — pure configuration over BufferTool.
// The bespoke members (trim, crop, merge, split) live in their own components.

import { Eraser, Mic, Repeat, Scissors, ArrowLeftRight, Tag } from 'lucide-react';
import { BufferTool } from './toolkit';
import {
  applyWatermark, fadeBuffer, findSilentRegions, generateBeep, mergeBuffers,
  removeSilence, reverseBuffer, vocalRemoveBuffer,
} from '../../lib/audiofy';
import { formatBytes, formatDuration as formatDurationShort } from '../../lib/utils';
import { formatTime } from './hooks';

/** Stats row shared by the tools that only report what came out. */
const sizeStats = (buffer) => [
  { label: 'Duration', value: formatTime(buffer.duration) },
  { label: 'Channels', value: buffer.numberOfChannels === 1 ? 'Mono' : 'Stereo' },
  { label: 'WAV size', value: `~${formatBytes(44 + buffer.length * buffer.numberOfChannels * 2)}` },
];

export const EDIT_TOOLS = [
  {
    id: 'silence-remover',
    name: 'Silence Remover',
    icon: Eraser,
    description: 'Detect quiet passages and cut them out automatically.',
    component: BufferTool,
    definition: {
      waveform: true,
      processHint: 'Detect and remove silence',
      params: [
        { key: 'thresholdDb', label: 'Silence threshold', kind: 'range', min: -70, max: -20, step: 1, defaultValue: -40, format: (v) => `${v} dB` },
        { key: 'minSec', label: 'Minimum silence length', kind: 'range', min: 0.1, max: 3, step: 0.1, defaultValue: 0.5, format: (v) => `${v.toFixed(1)} s` },
        { key: 'paddingSec', label: 'Padding kept around cuts', kind: 'range', min: 0, max: 0.5, step: 0.01, defaultValue: 0.05, format: (v) => `${Math.round(v * 1000)} ms` },
        { key: 'crossfadeMs', label: 'Join crossfade', kind: 'range', min: 0, max: 200, step: 10, defaultValue: 50, format: (v) => `${v} ms` },
      ],
      run: ({ buffer, params, createBuffer }) => {
        const regions = findSilentRegions(buffer, params);
        const removed = regions.reduce((sum, { start, end }) => sum + (end - start), 0);
        const cleaned = removeSilence(buffer, regions, params, createBuffer);

        return {
          buffer: cleaned,
          stats: [
            { label: 'Silent regions', value: String(regions.length) },
            { label: 'Removed', value: formatDurationShort(removed) },
            { label: 'New duration', value: formatTime(cleaned.duration) },
          ],
          note: regions.length
            ? undefined
            : 'No silence found at this threshold. Raise it (towards −20 dB) to catch quieter passages.',
          toast: regions.length ? `Removed ${regions.length} silent region${regions.length === 1 ? '' : 's'}` : 'Nothing to remove',
          status: regions.length
            ? `Cut ${formatDurationShort(removed)} of detected silence.`
            : 'Nothing met the threshold, so the audio is unchanged.',
        };
      },
    },
  },

  {
    id: 'audio-reverser',
    name: 'Audio Reverser',
    icon: ArrowLeftRight,
    description: 'Play the whole track backwards, ready to export.',
    component: BufferTool,
    definition: {
      waveform: true,
      processHint: 'Reverse audio',
      filename: () => '-reversed',
      run: ({ buffer, createBuffer }) => {
        const reversed = reverseBuffer(buffer, createBuffer);
        return { buffer: reversed, stats: sizeStats(reversed), toast: 'Audio reversed' };
      },
    },
  },

  {
    id: 'audio-looper',
    name: 'Audio Looper',
    icon: Repeat,
    description: 'Repeat a clip into a longer track, with optional gaps or crossfades.',
    component: BufferTool,
    definition: {
      waveform: true,
      processHint: 'Build loop',
      params: [
        { key: 'times', label: 'Repeats', kind: 'range', min: 1, max: 50, step: 1, defaultValue: 3, format: (v) => `${v}×` },
        { key: 'gapSec', label: 'Silence between repeats', kind: 'range', min: 0, max: 3, step: 0.1, defaultValue: 0, format: (v) => `${v.toFixed(1)} s` },
        { key: 'crossfadeSec', label: 'Crossfade between repeats', kind: 'range', min: 0, max: 2, step: 0.05, defaultValue: 0, format: (v) => `${v.toFixed(2)} s` },
      ],
      run: ({ buffer, params, createBuffer }) => {
        const merged = mergeBuffers(
          Array.from({ length: params.times }, () => buffer),
          { gapSec: params.gapSec, crossfadeSec: params.crossfadeSec },
          createBuffer,
        );
        return {
          buffer: merged,
          stats: [
            { label: 'Repeats', value: `${params.times}×` },
            { label: 'New duration', value: formatTime(merged.duration) },
            { label: 'WAV size', value: `~${formatBytes(44 + merged.length * merged.numberOfChannels * 2)}` },
          ],
          toast: `Looped ${params.times}×`,
        };
      },
    },
  },

  {
    id: 'audio-fader',
    name: 'Audio Fader',
    icon: Scissors,
    description: 'Fade in, fade out, or both — with four fade curves.',
    component: BufferTool,
    definition: {
      waveform: true,
      processHint: 'Apply fades',
      params: [
        { key: 'fadeInSec', label: 'Fade in', kind: 'range', min: 0, max: 20, step: 0.1, defaultValue: 2, format: (v) => `${v.toFixed(1)} s` },
        { key: 'fadeOutSec', label: 'Fade out', kind: 'range', min: 0, max: 20, step: 0.1, defaultValue: 2, format: (v) => `${v.toFixed(1)} s` },
        {
          key: 'curve',
          label: 'Curve',
          kind: 'segmented',
          defaultValue: 'linear',
          options: [
            { value: 'linear', label: 'Linear' },
            { value: 'exponential', label: 'Expo' },
            { value: 'logarithmic', label: 'Log' },
            { value: 'sCurve', label: 'S-curve' },
          ],
        },
      ],
      run: ({ buffer, params, createBuffer }) => {
        const faded = fadeBuffer(buffer, params, createBuffer);
        return {
          buffer: faded,
          stats: [
            { label: 'Fade in', value: `${params.fadeInSec.toFixed(1)} s` },
            { label: 'Fade out', value: `${params.fadeOutSec.toFixed(1)} s` },
            { label: 'Curve', value: params.curve },
          ],
          toast: 'Fades applied',
        };
      },
    },
  },

  {
    id: 'audio-watermark',
    name: 'Audio Watermark',
    icon: Tag,
    description: 'Stamp an identifying beep over the track — once or on a repeating cycle.',
    component: BufferTool,
    definition: {
      waveform: true,
      processHint: 'Apply watermark',
      params: [
        {
          key: 'position',
          label: 'Position',
          kind: 'segmented',
          defaultValue: 'start',
          options: [
            { value: 'start', label: 'Start' },
            { value: 'middle', label: 'Middle' },
            { value: 'end', label: 'End' },
            { value: 'every', label: 'Every 30s' },
          ],
        },
        { key: 'volume', label: 'Watermark volume', kind: 'range', min: 10, max: 100, step: 5, defaultValue: 70, format: (v) => `${v}%` },
        { key: 'duck', label: 'Duck the music under the beep', kind: 'switch', defaultValue: true, hint: 'Lowers the track where the beep plays' },
      ],
      run: ({ buffer, params, createBuffer }) => {
        const beep = generateBeep({ durationSec: 0.5, frequency: 880, sampleRate: buffer.sampleRate, amplitude: 0.5 });
        const stamped = applyWatermark(
          buffer,
          beep,
          { position: params.position, volume: params.volume / 100, duck: params.duck },
          createBuffer,
        );
        return {
          buffer: stamped,
          stats: sizeStats(stamped),
          note: 'The watermark is a synthesized 880 Hz beep. Voice watermarks need a recording — run one through Audio Merger instead.',
          toast: 'Watermark applied',
        };
      },
    },
  },

  {
    // Lives in the suite's Record & Voice category (categories are assigned in
    // registry.js); it is a parametric vocal-removal pass, so it ships here.
    id: 'karaoke-maker',
    name: 'Karaoke Maker',
    icon: Mic,
    description: 'Turn a stereo song into a karaoke backing track.',
    component: BufferTool,
    definition: {
      waveform: true,
      processHint: 'Make karaoke track',
      params: [
        { key: 'strength', label: 'Vocal cancellation', kind: 'range', min: 0, max: 150, step: 5, defaultValue: 100, format: (v) => `${v}%` },
      ],
      run: ({ buffer, params, createBuffer }) => {
        if (buffer.numberOfChannels < 2) {
          throw new Error('This file is mono. Karaoke cancellation needs a stereo track to subtract against.');
        }
        const output = vocalRemoveBuffer(buffer, { strength: params.strength / 100 }, createBuffer);
        return {
          buffer: output,
          stats: sizeStats(output),
          note: 'Centre-panned vocals are cancelled; leads panned hard left or right survive. Sing along before you commit!',
          toast: 'Karaoke track ready',
        };
      },
    },
  },
];
