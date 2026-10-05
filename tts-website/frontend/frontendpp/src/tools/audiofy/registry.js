// src/tools/audiofy/registry.js
// Assembles the Audiofy suite's tool list: the parametric definitions from the
// defs-* files plus the bespoke components, in the suite's fixed order (the
// original site's edit → convert → effects → analyze → record). The hub grid,
// its search and the deep-link lookup all read from here, exactly the way the
// app's top-level registry.js owns the outer catalogue.
//
// Category is assigned here, not in the def files: the defs are a pool of
// parametric tools, and the suite's grouping is a presentation decision.

import {
  AudioLines, AudioWaveform, Gauge, Mic, Scissors, SlidersHorizontal, Sparkles, Speaker, Waves,
} from 'lucide-react';

import { BufferTool } from './toolkit';
import { EDIT_TOOLS } from './defs-edit';
import { CONVERT_TOOLS } from './defs-convert';
import { EFFECT_TOOLS } from './defs-effects';
import { AudioCropper, AudioTrimmer, RingtoneMaker } from './custom-selection';
import { AudioJoiner, AudioMerger, AudioSplitter } from './custom-multi';
import {
  BpmDetector, KeyDetector, LoudnessMeter, MixChecker, Spectrum, WaveformImage,
} from './custom-inspect';
import { AudioRecorder, BpmTapper, ToneGenerator, VoiceRecorder } from './custom-studio';
import { AudioToVideo, MetadataEditor, TtsBridge } from './custom-media';

/** Category id → { label, accent }. Accents reuse the app's per-tool hues. */
export const AUDIOFY_CATEGORIES = [
  { id: 'edit', label: 'Edit & Cut', accent: 'violet' },
  { id: 'convert', label: 'Convert & Format', accent: 'sky' },
  { id: 'effects', label: 'Effects & DSP', accent: 'rose' },
  { id: 'analyze', label: 'Analyze & Meter', accent: 'emerald' },
  { id: 'record', label: 'Record & Voice', accent: 'amber' },
];

const CATEGORY_LABELS = Object.fromEntries(AUDIOFY_CATEGORIES.map((item) => [item.id, item.label]));

/** Bespoke tools: each is a hand-built component with its own flow. */
const BESPOKE_TOOLS = [
  { id: 'audio-trimmer', name: 'Audio Trimmer', icon: Scissors, category: 'edit', description: 'Cut a span out of any audio file, with live selection preview.', component: AudioTrimmer },
  { id: 'audio-cropper', name: 'Audio Cropper', icon: Scissors, category: 'edit', description: 'Keep exactly the portion you select and drop the rest.', component: AudioCropper },
  { id: 'audio-merger', name: 'Audio Merger', icon: AudioLines, category: 'edit', description: 'Join several files in order, with gaps or crossfades between them.', component: AudioMerger },
  { id: 'audio-joiner', name: 'Audio Joiner', icon: AudioLines, category: 'edit', description: 'Blend clips into one continuous track with smooth crossfades.', component: AudioJoiner },
  { id: 'audio-splitter', name: 'Audio Splitter', icon: SlidersHorizontal, category: 'edit', description: 'Slice a long file into equal parts or fixed-length chunks.', component: AudioSplitter },
  { id: 'bpm-tapper', name: 'BPM Tapper', icon: Gauge, category: 'edit', description: 'Tap along to find a tempo, or let the detector read it from a file.', component: BpmTapper },
  { id: 'metadata-editor', name: 'Metadata Editor', icon: AudioWaveform, category: 'edit', description: 'Write ID3 title, artist, album and cover art into MP3 files.', component: MetadataEditor },

  { id: 'audio-to-video', name: 'Audio to Video', icon: Speaker, category: 'convert', description: 'Render your track into a WebM video with an animated visual.', component: AudioToVideo },

  { id: 'bpm-detector', name: 'BPM Detector', icon: Gauge, category: 'analyze', description: 'Estimate a track’s tempo from its energy peaks.', component: BpmDetector },
  { id: 'key-detector', name: 'Key Detector', icon: AudioWaveform, category: 'analyze', description: 'Find the root note and major/minor mode of a track.', component: KeyDetector },
  { id: 'waveform-image', name: 'Waveform Image', icon: Waves, category: 'analyze', description: 'Render the waveform as a PNG in several styles and colours.', component: WaveformImage },
  { id: 'spectrum', name: 'Spectrum Analyzer', icon: AudioLines, category: 'analyze', description: 'Watch the live frequency spectrum while the file plays.', component: Spectrum },
  { id: 'loudness-meter', name: 'Loudness Meter', icon: AudioWaveform, category: 'analyze', description: 'Measure peak, true peak, RMS and an LUFS-style figure.', component: LoudnessMeter },
  { id: 'mix-checker', name: 'Mix Checker', icon: AudioLines, category: 'analyze', description: 'Check mono compatibility, phase and stereo width.', component: MixChecker },

  { id: 'audio-recorder', name: 'Audio Recorder', icon: Mic, category: 'record', description: 'Record any input straight from your microphone.', component: AudioRecorder },
  { id: 'voice-recorder', name: 'Voice Recorder', icon: Mic, category: 'record', description: 'Quick voice memos with noise suppression on.', component: VoiceRecorder },
  { id: 'ringtone-maker', name: 'Ringtone Maker', icon: Sparkles, category: 'record', description: 'Select a span, add fades, and export it ready for a phone.', component: RingtoneMaker },
  { id: 'audiofy-tts-bridge', name: 'Text to Speech Bridge', icon: Speaker, category: 'record', description: 'Send a text passage to the site’s neural voice tool and return with the audio ready to download.', component: TtsBridge },
  { id: 'tone-generator', name: 'Tone Generator', icon: Waves, category: 'record', description: 'Generate test tones from 20 Hz to 20 kHz, playable and exportable.', component: ToneGenerator },
];

/** Which category each parametric definition lands in. */
const PARAMETRIC_PLACEMENT = [
  ...EDIT_TOOLS.map((tool) => [tool, 'edit']),
  ...CONVERT_TOOLS.map((tool) => [tool, 'convert']),
  ...EFFECT_TOOLS.map((tool) => [tool, 'effects']),
];

/** The suite in its fixed order, per category. */
const ORDER = [
  // Edit & Cut
  'audio-trimmer', 'audio-merger', 'audio-splitter', 'audio-cropper', 'silence-remover',
  'audio-reverser', 'audio-looper', 'audio-fader', 'audio-joiner', 'bpm-tapper',
  'audio-watermark', 'metadata-editor',
  // Convert & Format
  'mp3-converter', 'wav-converter', 'ogg-converter', 'm4a-converter', 'audio-to-video',
  'video-to-audio', 'audio-compressor', 'sample-rate',
  // Effects & DSP
  'volume-changer', 'bass-booster', 'treble-booster', 'equalizer', 'reverb', 'echo',
  'pitch-shifter', 'tempo-changer', 'stereo-panner', '8d-audio', 'auto-panner',
  'vocal-remover', 'audio-normalizer', 'noise-reducer', 'distortion', 'chorus',
  'flanger', 'ring-modulator',
  // Analyze & Meter
  'bpm-detector', 'key-detector', 'waveform-image', 'spectrum', 'loudness-meter', 'mix-checker',
  // Record & Voice
  'audio-recorder', 'voice-recorder', 'ringtone-maker', 'karaoke-maker', 'audiofy-tts-bridge',
  'tone-generator',
];

function buildCatalogue() {
  const entries = [
    ...BESPOKE_TOOLS,
    ...PARAMETRIC_PLACEMENT.map(([tool, category]) => ({
      id: tool.id,
      name: tool.name,
      icon: tool.icon,
      category,
      description: tool.description,
      component: BufferTool,
      definition: tool.definition,
    })),
  ].map((tool) => ({ ...tool, categoryLabel: CATEGORY_LABELS[tool.category] }));

  const byId = Object.fromEntries(entries.map((tool) => [tool.id, tool]));

  // Order drives the grid; anything unmapped would silently vanish, so a
  // missing id surfaces as an error here rather than an empty card slot later.
  return ORDER.map((id) => {
    const tool = byId[id];
    if (!tool) throw new Error(`Audiofy: tool "${id}" is ordered but has no definition.`);
    return tool;
  });
}

export const AUDIOFY_TOOLS = buildCatalogue();

export function findAudiofyTool(id) {
  return AUDIOFY_TOOLS.find((tool) => tool.id === id);
}
