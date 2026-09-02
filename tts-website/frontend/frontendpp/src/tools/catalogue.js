// src/tools/catalogue.js
// ---------------------------------------------------------------------------
// The tool catalogue as plain data: no imports, no JSX, no React.
//
// It lives apart from registry.js on purpose. registry.js pairs each entry with
// its icon component and its lazy-loaded implementation, which makes it a
// browser-only module; this file is loadable straight from Node, so the build
// step that emits sitemap.xml and the per-route static HTML reads the exact
// same list the app renders instead of a second copy that drifts.
//
// `tagline` is the one-liner shown in the UI. `description` is the meta
// description for that tool's page — deliberately a different string, because a
// 60-character card subtitle makes a poor search snippet and a snippet written
// for search reads as padding inside a card.
// ---------------------------------------------------------------------------

export const CATEGORIES = [
  { id: 'seo', label: 'AI & SEO' },
  { id: 'audio', label: 'Audio & Voice' },
  { id: 'text', label: 'Text' },
  { id: 'media', label: 'Media' },
  { id: 'dev', label: 'Developer' },
  { id: 'daily', label: 'Everyday' },
];

/** `server: true` marks tools that call the FastAPI backend. */
export const CATALOGUE = [
  {
    id: 'seo-studio',
    name: 'SEO Content Studio',
    tagline: 'Transcript or YouTube link → titles, description, hashtags, keywords',
    description:
      'Paste a transcript or a YouTube link and get publish-ready titles, a description, hashtags, keywords and chapters in seconds. Free, no sign-up.',
    category: 'seo',
    accent: 'violet',
    badge: 'Flagship',
    server: true,
    keywords: ['seo', 'youtube', 'title', 'description', 'hashtag', 'keyword', 'tags', 'chapters'],
  },
  {
    id: 'youtube-toolkit',
    name: 'YouTube Toolkit',
    tagline: 'Grab metadata, every thumbnail size and the full transcript',
    description:
      "Pull any public YouTube video's metadata, every thumbnail resolution and its full transcript. Paste a link — nothing to install.",
    category: 'seo',
    accent: 'rose',
    server: true,
    keywords: ['youtube', 'thumbnail', 'transcript', 'captions', 'download', 'metadata'],
  },
  {
    id: 'summarizer',
    name: 'AI Summarizer',
    tagline: 'Condense any article or transcript into the points that matter',
    description:
      'Condense long articles, transcripts and notes down to the sentences that carry the meaning. Choose how short, then copy the result.',
    category: 'seo',
    accent: 'amber',
    server: true,
    keywords: ['summary', 'summarize', 'tldr', 'shorten', 'bullets'],
  },
  {
    id: 'content-analyzer',
    name: 'Content Analyzer',
    tagline: 'Readability, keyword density, reading and speaking time',
    description:
      'Check readability, keyword density, reading time and speaking time before you publish — a quick on-page audit for any draft.',
    category: 'seo',
    accent: 'emerald',
    server: true,
    keywords: ['readability', 'flesch', 'density', 'analyze', 'seo audit'],
  },
  {
    id: 'ai-studio',
    name: 'AI Writing Assistant',
    tagline: 'Hooks, titles, outlines and tighter scripts from your own material',
    description:
      'Turn a script, transcript or a one-line topic into opening hooks, title options, a description or a tighter cut — on an open model run server-side.',
    category: 'seo',
    accent: 'sky',
    server: true,
    keywords: ['ai', 'writing', 'assistant', 'hook', 'title', 'outline', 'rewrite', 'script', 'llm'],
  },
  {
    id: 'text-to-speech',
    name: 'Text to Speech',
    tagline: 'Neural voices in 100+ languages, exported as MP3',
    description:
      'Turn text into natural neural narration in 100+ languages and download it as MP3. Pick a voice, adjust rate and pitch, then export.',
    category: 'audio',
    accent: 'violet',
    badge: 'Popular',
    server: true,
    keywords: ['tts', 'voice', 'speech', 'mp3', 'narration', 'voiceover'],
  },
  {
    id: 'speech-to-text',
    name: 'Speech to Text',
    tagline: 'Live dictation straight from your microphone',
    description:
      'Dictate straight into your browser and copy the transcript. Live speech recognition with no upload and no account.',
    category: 'audio',
    accent: 'rose',
    keywords: ['dictation', 'stt', 'transcribe', 'voice typing', 'microphone'],
  },
  {
    id: 'audio-studio',
    name: 'Audio Length',
    tagline: 'Fit audio to an exact runtime without changing its pitch',
    description:
      'Stretch or shorten audio to an exact runtime — or a set speed — with the pitch left alone, then export a WAV. Files never leave your browser.',
    category: 'audio',
    accent: 'sky',
    keywords: ['audio', 'speed', 'length', 'time stretch', 'pitch', 'tempo', 'wav'],
  },
  {
    id: 'subtitle-studio',
    name: 'Subtitle Studio',
    tagline: 'Convert SRT / VTT / TXT / CSV and fix out-of-sync timings',
    description:
      'Convert between SRT, VTT, TXT and CSV, shift out-of-sync timings and tidy up caption files. A free subtitle converter and re-timer.',
    category: 'audio',
    accent: 'emerald',
    server: true,
    keywords: ['srt', 'vtt', 'subtitle', 'caption', 'sync', 'offset', 'convert'],
  },
  {
    id: 'word-counter',
    name: 'Word Counter',
    tagline: 'Live counts plus reading and speaking time estimates',
    description:
      'Live word, character, sentence and paragraph counts with reading and speaking time estimates as you type.',
    category: 'text',
    accent: 'sky',
    keywords: ['word count', 'character count', 'reading time', 'letters'],
  },
  {
    id: 'case-converter',
    name: 'Case Converter',
    tagline: 'Sentence, Title, camelCase, snake_case, kebab-case and more',
    description:
      'Switch text between sentence case, Title Case, UPPERCASE, camelCase, snake_case and kebab-case in one click.',
    category: 'text',
    accent: 'amber',
    keywords: ['uppercase', 'lowercase', 'title case', 'camel', 'snake', 'kebab'],
  },
  {
    id: 'text-cleaner',
    name: 'Text Cleaner',
    tagline: 'Strip extra spaces, blank lines, duplicates, emoji and HTML',
    description:
      'Strip double spaces, blank lines, duplicate lines, emoji and HTML tags, then sort or dedupe what is left.',
    category: 'text',
    accent: 'violet',
    keywords: ['clean', 'trim', 'whitespace', 'duplicate lines', 'sort', 'dedupe'],
  },
  {
    id: 'lorem-generator',
    name: 'Placeholder Text',
    tagline: 'Lorem ipsum by words, sentences or paragraphs',
    description:
      'Generate placeholder lorem ipsum by words, sentences or paragraphs for mockups and layout tests.',
    category: 'text',
    accent: 'emerald',
    keywords: ['lorem', 'ipsum', 'placeholder', 'dummy text', 'filler'],
  },
  {
    id: 'image-studio',
    name: 'Image Studio',
    tagline: 'Resize, compress and convert between PNG, JPG and WebP',
    description:
      'Resize, compress and convert images between PNG, JPG and WebP in the browser. Nothing is uploaded to a server.',
    category: 'media',
    accent: 'rose',
    keywords: ['compress', 'resize', 'webp', 'jpg', 'png', 'convert', 'optimise'],
  },
  {
    id: 'qr-generator',
    name: 'QR Code Generator',
    tagline: 'Custom colours, sizes and instant PNG or SVG download',
    description:
      'Create a QR code for any link or text with custom colours and size, then download it as a PNG or SVG.',
    category: 'media',
    accent: 'sky',
    keywords: ['qr', 'barcode', 'link', 'share', 'upi'],
  },
  {
    id: 'color-studio',
    name: 'Colour Studio',
    tagline: 'Build palettes, read HEX/RGB/HSL and check contrast',
    description:
      'Build colour palettes, convert between HEX, RGB and HSL, and check WCAG contrast ratios before you ship.',
    category: 'media',
    accent: 'violet',
    keywords: ['color', 'palette', 'hex', 'rgb', 'hsl', 'contrast', 'shades'],
  },
  {
    id: 'json-formatter',
    name: 'JSON Formatter',
    tagline: 'Pretty-print, minify and validate with precise error positions',
    description:
      'Pretty-print, minify and validate JSON, with the exact line and column of any syntax error.',
    category: 'dev',
    accent: 'amber',
    keywords: ['json', 'format', 'beautify', 'minify', 'validate', 'lint'],
  },
  {
    id: 'encoder',
    name: 'Encoder / Decoder',
    tagline: 'Base64, URL, HTML entities, hex and JWT payloads',
    description:
      'Encode and decode Base64, URLs, HTML entities and hex, and inspect JWT payloads without sending them anywhere.',
    category: 'dev',
    accent: 'emerald',
    keywords: ['base64', 'url encode', 'html entities', 'hex', 'jwt', 'decode'],
  },
  {
    id: 'password-generator',
    name: 'Password Generator',
    tagline: 'Cryptographically random passwords with a strength read-out',
    description:
      'Generate cryptographically random passwords in your browser, with a live strength and entropy read-out.',
    category: 'daily',
    accent: 'rose',
    keywords: ['password', 'random', 'secure', 'passphrase', 'entropy'],
  },
  {
    id: 'unit-converter',
    name: 'Unit Converter',
    tagline: 'Length, weight, temperature, data, speed and area',
    description:
      'Convert length, weight, temperature, data, speed and area between metric and imperial units instantly.',
    category: 'daily',
    accent: 'sky',
    keywords: ['convert', 'metric', 'imperial', 'kg', 'km', 'celsius', 'gb'],
  },
  {
    id: 'timestamp-calculator',
    name: 'Timecode Calculator',
    tagline: 'Add, subtract and split timecodes for edits and chapters',
    description:
      'Add, subtract and split timecodes for video edits, chapter markers and subtitle timing — in hours, minutes, seconds or frames.',
    category: 'daily',
    accent: 'amber',
    keywords: ['timecode', 'duration', 'add time', 'chapters', 'video'],
  },
  {
    id: 'date-calculator',
    name: 'Date Calculator',
    tagline: 'Age, days between dates and deadline maths',
    description:
      'Work out an exact age, the number of days between two dates, and the date a set number of days from now.',
    category: 'daily',
    accent: 'violet',
    keywords: ['age', 'date difference', 'days between', 'deadline', 'birthday'],
  },
  {
    id: 'notepad',
    name: 'Quick Notepad',
    tagline: 'Autosaving scratchpad that survives a refresh',
    description:
      'An autosaving scratchpad in your browser. Notes stay on your device and survive a refresh.',
    category: 'daily',
    accent: 'emerald',
    keywords: ['notes', 'notepad', 'scratchpad', 'todo', 'draft'],
  },
];
