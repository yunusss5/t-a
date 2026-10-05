// src/tools/registry.js
// Single source of truth for the tool catalogue: navigation, the home grid, the
// command palette and the routes are all generated from this list.
//
// The copy — names, taglines, meta descriptions, keywords — lives in
// catalogue.js, which is plain data with no imports so the build step can read
// it from Node. This module pairs each entry with the two things only the
// browser bundle can supply: its icon and its lazily-imported component.

import { lazy } from 'react';
import {
  AudioLines, Baseline, Binary, Braces, CalendarClock, CaseSensitive, Clock, Eraser,
  FileType2, Image, KeyRound, MessageCircle, Mic, Music4, Notebook, Palette, PenLine,
  QrCode, Ruler, ScanSearch, Sparkles, Type, Volume2, Wand2, SquarePlay,
} from 'lucide-react';
import { ACTIVE_CATALOGUE, ACTIVE_CATEGORIES } from './catalogue';
import { AUDIOFY_CATEGORIES, AUDIOFY_TOOLS } from './audiofy/registry';

export const CATEGORIES = ACTIVE_CATEGORIES;

/**
 * id → { icon, component }. Every tool is lazy-loaded so the first paint only
 * ships the shell; tool chunks are fetched on navigation.
 */
const IMPLEMENTATIONS = {
  'seo-studio': { icon: Sparkles, component: lazy(() => import('./SeoStudio')) },
  'youtube-toolkit': { icon: SquarePlay, component: lazy(() => import('./YoutubeToolkit')) },
  summarizer: { icon: Wand2, component: lazy(() => import('./Summarizer')) },
  'content-analyzer': { icon: ScanSearch, component: lazy(() => import('./ContentAnalyzer')) },
  'ai-studio': { icon: PenLine, component: lazy(() => import('./AiStudio')) },
  'ai-assistant': { icon: MessageCircle, component: lazy(() => import('./AssistantTool')) },
  'text-to-speech': { icon: Volume2, component: lazy(() => import('./TextToSpeech')) },
  'speech-to-text': { icon: Mic, component: lazy(() => import('./SpeechToText')) },
  'audio-studio': { icon: AudioLines, component: lazy(() => import('./AudioStudio')) },
  'audiofy-suite': { icon: Music4, component: lazy(() => import('./audiofy/AudiofySuite')) },
  'subtitle-studio': { icon: FileType2, component: lazy(() => import('./SubtitleStudio')) },
  'word-counter': { icon: Baseline, component: lazy(() => import('./WordCounter')) },
  'case-converter': { icon: CaseSensitive, component: lazy(() => import('./CaseConverter')) },
  'text-cleaner': { icon: Eraser, component: lazy(() => import('./TextCleaner')) },
  'lorem-generator': { icon: Type, component: lazy(() => import('./LoremGenerator')) },
  'image-studio': { icon: Image, component: lazy(() => import('./ImageStudio')) },
  'qr-generator': { icon: QrCode, component: lazy(() => import('./QrGenerator')) },
  'color-studio': { icon: Palette, component: lazy(() => import('./ColorStudio')) },
  'json-formatter': { icon: Braces, component: lazy(() => import('./JsonFormatter')) },
  encoder: { icon: Binary, component: lazy(() => import('./EncoderDecoder')) },
  'password-generator': { icon: KeyRound, component: lazy(() => import('./PasswordGenerator')) },
  'unit-converter': { icon: Ruler, component: lazy(() => import('./UnitConverter')) },
  'timestamp-calculator': { icon: Clock, component: lazy(() => import('./TimestampCalculator')) },
  'date-calculator': { icon: CalendarClock, component: lazy(() => import('./DateCalculator')) },
  notepad: { icon: Notebook, component: lazy(() => import('./Notepad')) },
};

const AUDIOFY_ACCENTS = Object.fromEntries(
  AUDIOFY_CATEGORIES.map(({ id, accent }) => [id, accent]),
);

const AUDIOFY_ENTRIES = AUDIOFY_TOOLS.map((tool) => ({
  id: tool.id,
  name: tool.name,
  tagline: tool.description,
  description: tool.description,
  category: 'audio',
  accent: AUDIOFY_ACCENTS[tool.category],
  keywords: [tool.name, tool.categoryLabel, tool.id.replaceAll('-', ' ')],
  href: `/tools/audiofy-suite#${tool.id}`,
  audioSubtool: true,
  icon: tool.icon,
}));

export const TOOLS = [
  ...ACTIVE_CATALOGUE.map((tool) => ({ ...tool, ...IMPLEMENTATIONS[tool.id] })),
  ...AUDIOFY_ENTRIES,
];

export const getTool = (id) => TOOLS.find((tool) => tool.id === id);

export const toolsByCategory = (categoryId) =>
  TOOLS.filter((tool) => tool.category === categoryId);

/**
 * Sibling tools to link at the foot of a tool page.
 *
 * Derived rather than hand-listed per tool: 23 hand-maintained `related` arrays
 * rot the moment a tool is added. Same category first — that is the strongest
 * "you probably also want this" signal here — then the remaining tools fill any
 * gap, so every page links somewhere useful even from a one-tool category.
 */
export function relatedTools(tool, limit = 4) {
  if (!tool) return [];

  const sameCategory = TOOLS.filter(
    (item) => item.id !== tool.id && item.category === tool.category,
  );
  const fillers = TOOLS.filter(
    (item) => item.id !== tool.id && item.category !== tool.category,
  );

  return [...sameCategory, ...fillers].slice(0, limit);
}

/** Fuzzy-ish search across name, tagline and keywords for the palette + home. */
export function searchTools(query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return TOOLS;

  const terms = needle.split(/\s+/);

  return TOOLS.filter((tool) => {
    const haystack = [tool.name, tool.tagline, tool.category, ...(tool.keywords || [])]
      .join(' ')
      .toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}
