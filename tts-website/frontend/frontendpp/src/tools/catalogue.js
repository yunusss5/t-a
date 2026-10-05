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
    id: 'ai-assistant',
    name: 'AI Assistant',
    tagline: 'Ask questions and get help with your creative workflow',
    description:
      'Chat with the VoiceForge assistant for writing help, creator advice and guidance using the toolkit. No personal API key required.',
    category: 'seo',
    accent: 'sky',
    keywords: ['assistant', 'chat', 'ask', 'help', 'ai', 'creator'],
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
    howTo: [
      'Type or paste a script, or upload a TXT, MD, SRT or VTT transcript.',
      'Choose a language and voice, then adjust the speaking speed or enable Auto Speed for a target duration.',
      'Select Generate audio, preview the result, and download the MP3.',
    ],
    faqs: [
      { question: 'How do I create an MP3 voiceover?', answer: 'Enter text or upload a supported transcript, choose a language and voice, set the speed if needed, then select Generate audio. Preview and download the MP3 when it is ready.' },
      { question: 'Which transcript formats can I upload?', answer: 'Text to Speech accepts TXT, Markdown, SRT and VTT files, as well as text entered directly in the page.' },
      { question: 'Is speech generated entirely in my browser?', answer: 'No. This feature sends the text or transcript to the VoiceForge backend to generate speech, then streams the resulting audio back.' },
    ],
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
    howTo: [
      'Choose the spoken language before starting dictation.',
      'Allow microphone access, select Start dictation, and speak at a natural pace.',
      'Select Stop dictation, review and edit the transcript, then copy it or download a TXT file.',
    ],
    faqs: [
      { question: 'How do I turn speech into text?', answer: 'Choose a language, allow microphone access, start dictation, and speak. Stop when finished, then review and edit the transcript.' },
      { question: 'Which browsers support live dictation?', answer: 'The page uses the browser Web Speech API. Chrome, Edge and Safari are supported by this app; Firefox does not currently provide the required API here.' },
      { question: 'Can I save the transcript?', answer: 'Yes. Copy the text or download it as a TXT file from the transcript panel.' },
    ],
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
    howTo: [
      'Choose an MP3, WAV, M4A or OGG file (up to 30 MB). The file is decoded in your browser.',
      'Enter a target duration or choose a speed preset; the other value updates to match.',
      'Apply the change, preview the processed audio, and download the WAV when it sounds right.',
    ],
    faqs: [
      { question: 'How do I change an audio file to an exact length?', answer: 'Load an audio file, set the target length in seconds or choose a speed preset, then apply the change and download the rendered WAV.' },
      { question: 'Will changing the duration also change the pitch?', answer: 'The time-stretching process aims to change duration while preserving pitch. Very large speed changes can sound processed, and the page warns when settings are outside its cleaner range.' },
      { question: 'Are my audio files uploaded?', answer: 'No. Audio Length decodes and processes the selected file in your browser and exports a WAV locally.' },
    ],
  },
  {
    id: 'audiofy-suite',
    name: 'AudioKit',
    tagline: 'Studio audio tools — trim, convert, effects and analysis, in-browser',
    description:
      'Trim, merge and split audio, add reverb, echo, bass and 8D effects, detect BPM and key, convert and export WAV. Private tools that run in your browser.',
    category: 'audio',
    accent: 'violet',
    keywords: [
      'audio', 'trim', 'trimmer', 'merge', 'split', 'convert', 'mp3', 'wav', 'bass', 'reverb',
      'echo', 'equalizer', '8d', 'karaoke', 'vocal remover', 'bpm', 'key', 'ringtone',
      'recorder', 'tone', 'waveform', 'loudness', 'pitch', 'tempo', 'spectrum',
    ],
    howTo: [
      'Search the suite or filter by category, then open the audio tool that fits your task.',
      'Load or record audio when prompted, adjust the available controls, and run the tool.',
      'Review the result and use that tool’s copy, preview or download control to keep it.',
    ],
    faqs: [
      { question: 'Do my audio files get uploaded anywhere?', answer: 'No. Every AudioKit tool decodes, processes and exports audio inside your own browser tab using the Web Audio API. Nothing is sent to a server.' },
      { question: 'What format do the tools export?', answer: 'Exports are 16-bit PCM WAV unless a tool says otherwise. WAV is lossless and plays everywhere; browsers cannot reliably encode MP3, so converters re-export decoded audio as WAV.' },
      { question: 'How big can my files be?', answer: 'Up to 100 MB per file. The practical ceiling is your device memory, since the decoded audio lives in the tab while you work on it.' },
      { question: 'Is there one page with the whole suite?', answer: 'Yes — AudioKit is one suite page with its own search and category filters, and every tool has its own direct link you can bookmark.' },
    ],
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
    howTo: [
      'Upload an SRT, VTT or TXT file, or paste subtitle text into the input area.',
      'Choose an output format. For timed captions, adjust the offset or speed scale if needed.',
      'For plain scripts, set words per cue and words per minute, then select Convert.',
      'Review the cue preview and copy or download the converted output.',
    ],
    faqs: [
      { question: 'Which subtitle input formats are supported?', answer: 'You can upload SRT, VTT or TXT files, or paste content into the input area. The converter can produce SRT, WebVTT, plain text or CSV output.' },
      { question: 'How do I fix captions that are early or late?', answer: 'Use the offset in seconds: a positive offset delays captions and a negative offset advances them. Use the speed scale to correct timing drift across a longer file.' },
      { question: 'Can I create captions from a plain text script?', answer: 'Yes. Paste or upload a plain script, choose the words per cue and estimated words per minute, then convert it to generate timed cues.' },
      { question: 'Is subtitle text sent to a server?', answer: 'Yes. Subtitle Studio sends the provided content or file to the VoiceForge backend for conversion and returns the result.' },
    ],
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

export const ACTIVE_CATEGORIES = CATEGORIES.filter((category) => category.id === 'audio');
export const ACTIVE_CATALOGUE = CATALOGUE.filter((tool) => tool.category === 'audio');
