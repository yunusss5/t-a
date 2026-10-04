// src/tools/audiofy/defs-convert.jsx
// The Convert category. Browsers can decode a dozen formats but can only
// *encode* a couple, so every converter here exports PCM WAV — the same honest
// outcome the original suite shipped (its "MP3" export wrote a WAV), now with
// the UI saying so instead of offering bitrate buttons that did nothing.

import { FileAudio, Film, Gauge, Music2, Waves } from 'lucide-react';
import { BufferTool } from './toolkit';
import { quantizeBuffer, resampleBuffer } from '../../lib/audiofy';
import { formatBytes, formatDuration } from '../../lib/utils';

const WAV_NOTE =
  'Browser audio encoders only cover a few formats reliably, so this tool exports ' +
  'uncompressed PCM WAV — lossless, and playable everywhere.';

const estimateStats = (buffer, bitDepth = 16) => [
  { label: 'Duration', value: formatDuration(buffer.duration) },
  { label: 'Channels', value: buffer.numberOfChannels === 1 ? 'Mono' : 'Stereo' },
  { label: 'Sample rate', value: `${(buffer.sampleRate / 1000).toFixed(1)} kHz` },
  { label: 'WAV size', value: `~${formatBytes(44 + buffer.length * buffer.numberOfChannels * (bitDepth / 8))}` },
];

export const CONVERT_TOOLS = [
  {
    id: 'mp3-converter',
    name: 'MP3 Converter',
    icon: Music2,
    description: 'Decode an MP3 (or any audio file) and export a clean WAV copy.',
    component: BufferTool,
    definition: {
      processHint: 'Convert to WAV',
      filename: () => '-converted',
      run: ({ buffer }) => ({ buffer, stats: estimateStats(buffer), note: WAV_NOTE, toast: 'Converted to WAV' }),
    },
  },

  {
    id: 'wav-converter',
    name: 'WAV Converter',
    icon: FileAudio,
    description: 'Re-encode any audio as WAV, at 16-bit or 24-bit depth.',
    component: BufferTool,
    definition: {
      processHint: 'Convert to WAV',
      filename: () => '-converted',
      params: [
        {
          key: 'bitDepth',
          label: 'Bit depth',
          kind: 'segmented',
          defaultValue: '16',
          options: [
            { value: '16', label: '16-bit' },
            { value: '24', label: '24-bit' },
          ],
        },
      ],
      run: ({ buffer, params }) => ({
        buffer,
        bitDepth: Number(params.bitDepth),
        stats: estimateStats(buffer, Number(params.bitDepth)),
        note: WAV_NOTE,
        toast: `Converted to ${params.bitDepth}-bit WAV`,
      }),
    },
  },

  {
    id: 'ogg-converter',
    name: 'OGG Converter',
    icon: Waves,
    description: 'Turn an OGG file into a WAV every editor will accept.',
    component: BufferTool,
    definition: {
      processHint: 'Convert to WAV',
      filename: () => '-converted',
      run: ({ buffer }) => ({ buffer, stats: estimateStats(buffer), note: WAV_NOTE, toast: 'Converted to WAV' }),
    },
  },

  {
    id: 'm4a-converter',
    name: 'M4A Converter',
    icon: Music2,
    description: 'Unpack M4A/AAC audio into a lossless WAV copy.',
    component: BufferTool,
    definition: {
      processHint: 'Convert to WAV',
      filename: () => '-converted',
      run: ({ buffer }) => ({ buffer, stats: estimateStats(buffer), note: WAV_NOTE, toast: 'Converted to WAV' }),
    },
  },

  {
    id: 'video-to-audio',
    name: 'Video to Audio',
    icon: Film,
    description: 'Pull the soundtrack out of any video file your browser can play.',
    component: BufferTool,
    definition: {
      accept: 'video/*',
      fileNoun: 'a video file',
      fileHint: 'MP4, WebM, MOV and other browser-supported video',
      processHint: 'Extract audio',
      filename: () => '-audio',
      run: ({ buffer }) => ({
        buffer,
        stats: estimateStats(buffer),
        note: 'Only the audio track is decoded — the picture is discarded.',
        toast: 'Audio extracted',
      }),
    },
  },

  {
    id: 'audio-compressor',
    name: 'Audio Compressor',
    icon: Gauge,
    description: 'Shrink a WAV by reducing its bit depth — with the size math shown.',
    component: BufferTool,
    definition: {
      processHint: 'Compress',
      bitDepthSource: 'level',
      params: [
        {
          key: 'level',
          label: 'Compression level',
          kind: 'segmented',
          defaultValue: 'medium',
          options: [
            { value: 'low', label: 'Low · 16-bit' },
            { value: 'medium', label: 'Medium · 12-bit' },
            { value: 'high', label: 'High · 8-bit' },
          ],
        },
      ],
      run: ({ buffer, params, createBuffer }) => {
        const bits = { low: 16, medium: 12, high: 8 }[params.level] || 16;
        const crushed = quantizeBuffer(buffer, bits, createBuffer);
        const newSize = 44 + buffer.length * buffer.numberOfChannels * 2;

        return {
          buffer: crushed,
          stats: [
            { label: 'Bit depth', value: `${bits}-bit` },
            { label: 'WAV size', value: `~${formatBytes(newSize)}` },
          ],
          note: 'This reduces bit depth, which is what makes the file smaller. Heavy levels add quantisation noise — listen before shipping.',
          toast: 'Compressed',
        };
      },
    },
  },

  {
    id: 'sample-rate',
    name: 'Sample Rate Changer',
    icon: Waves,
    description: 'Resample audio between 8 kHz voice and 96 kHz studio rates.',
    component: BufferTool,
    definition: {
      processHint: 'Resample',
      filename: (params) => `-${params.rate / 1000}khz`,
      params: [
        {
          key: 'rate',
          label: 'Target sample rate',
          kind: 'select',
          defaultValue: '48000',
          options: [
            { value: '8000', label: '8 kHz — telephone' },
            { value: '22050', label: '22.05 kHz — legacy' },
            { value: '44100', label: '44.1 kHz — CD' },
            { value: '48000', label: '48 kHz — video standard' },
            { value: '96000', label: '96 kHz — studio' },
          ],
        },
      ],
      run: async ({ buffer, params }) => {
        const target = Number(params.rate);
        const resampled = await resampleBuffer(buffer, target);
        return {
          buffer: resampled,
          stats: [
            { label: 'Source rate', value: `${(buffer.sampleRate / 1000).toFixed(1)} kHz` },
            { label: 'Target rate', value: `${(target / 1000).toFixed(1)} kHz` },
            { label: 'New duration', value: formatDuration(resampled.duration) },
          ],
          note: 'Upsampling past the source rate does not add detail — it only changes the container.',
          toast: `Resampled to ${(target / 1000).toFixed(1)} kHz`,
        };
      },
    },
  },
];
