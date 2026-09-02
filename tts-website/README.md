# VoiceForge — Creator Toolkit

A free, no-sign-up toolkit for creators: 22 everyday tools built around one
headline feature — paste a transcript or a YouTube link and get a complete
**SEO package** back (titles, meta description, full YouTube description,
hashtags, three tiers of keywords, paste-ready tags and timestamped chapters).

Text-to-speech still runs on `edge-tts` (Microsoft Edge's free neural voices,
no API key). Everything else is either pure-Python NLP on the backend or runs
entirely in your browser.

## What's in it

| Group        | Tools |
|--------------|-------|
| AI & SEO     | SEO Content Studio, YouTube Toolkit, AI Summarizer, Content Analyzer |
| Audio & Voice| Text to Speech, Speech to Text, Audio Studio, Subtitle Studio |
| Text         | Word Counter, Case Converter, Text Cleaner, Placeholder Text |
| Media        | Image Studio, QR Code Generator, Colour Studio |
| Developer    | JSON Formatter, Encoder / Decoder |
| Everyday     | Password Generator, Unit Converter, Timecode Calculator, Date Calculator, Quick Notepad |

Only 7 of the 22 tools call the backend. The other 15 — Speech to Text, Audio
Studio, the text tools, Image Studio, QR codes, colours, JSON, encoding,
passwords, converters and the notepad — run entirely in the browser, so nothing
is uploaded.

## Folder structure

```
tts-website/
├── backend/
│   ├── main.py               # FastAPI app: TTS routes + CORS, mounts tools_api
│   ├── tools_api.py          # every /api/* tool endpoint
│   ├── tts_engine.py         # edge-tts wrapper + chunking for long text
│   ├── voices.py             # script to refresh voices.json
│   ├── voices.json           # cached voice list
│   ├── requirements.txt      # runtime deps
│   ├── requirements-dev.txt  # pytest
│   ├── tests/                # 28 offline tests (no network)
│   └── utils/
│       ├── nlp.py            # tokenising, keywords, phrases, readability
│       ├── seo.py            # the SEO package builder
│       ├── subtitles.py      # srt / vtt / txt / csv + retiming
│       ├── youtube.py        # oEmbed metadata + caption fetching
│       └── file_parser.py    # transcript uploads (txt/md/srt/vtt)
└── frontend/frontendpp/      # React 19 + Vite
    └── src/
        ├── tools/            # one file per tool + registry.js
        ├── components/       # shell/ (sidebar, palette) + ui/ primitives
        ├── pages/            # HomePage, ToolPage
        ├── lib/              # api.js (all backend calls), utils.js
        └── styles/           # premium.css imports shell/home/tools
```

## 1. Run the backend

```bash
cd backend
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Open `http://localhost:8000/docs` for the interactive API reference, or
`http://localhost:8000/api/health` for a readiness probe that also reports
whether caption fetching is available.

### API surface

```
POST /generate                 text + voice        -> mp3
POST /generate-from-file       transcript + voice  -> mp3
GET  /voices                   -> locale / name / friendly_name / gender

POST /api/seo/from-text        text                -> full SEO package
POST /api/seo/from-file        .txt/.srt/.vtt/…    -> package with real timestamps
POST /api/seo/from-youtube     video url           -> metadata + captions + package
POST /api/text/summarize       text                -> summary sentences + bullets
POST /api/text/analyze         text                -> counts, readability, keywords
POST /api/subtitles/convert    subtitles           -> srt / vtt / txt / csv (+ retiming)
POST /api/youtube/inspect      video url           -> metadata + every thumbnail size
GET  /api/health
```

Every endpoint takes `multipart/form-data`, so the frontend sends `FormData`
for all of them — see `src/lib/api.js`.

### (Optional) Refresh the full voice list

`voices.json` ships with a curated set. To pull the entire list `edge-tts`
supports (100+ languages), edit `LOCALE_FILTER` in `voices.py`, then:

```bash
python voices.py
```

## 2. Run the frontend

```bash
cd frontend/frontendpp
npm install
npm run dev
```

The dev server runs at `https://texttospeechin.vercel.app`, which is already in the
backend's CORS allowlist.

`VITE_API_BASE` selects the backend. It defaults to the deployed Render URL, so
for local work point it at your own server in `.env.local` (gitignored):

```
VITE_API_BASE=https://tts-backend-33xv.onrender.com
```

## 3. Tests and checks

```bash
cd backend && pip install -r requirements-dev.txt && python -m pytest tests -q
```

28 tests, all offline — the YouTube routes reach out to youtube.com, so they are
left to a manual check rather than the suite. `tests/test_seo.py` covers the
package builder (topic selection, keyword tiers, chapters from real cue
timings); `tests/test_api.py` drives every endpoint through FastAPI's
`TestClient`.

Frontend:

```bash
cd frontend/frontendpp && npm run lint && npm run build
```

## 4. Deploy

| Part      | Free host options               |
|-----------|---------------------------------|
| Backend   | Render.com, Railway.app, Fly.io |
| Frontend  | Vercel, Netlify                 |

- Set `VITE_API_BASE` to the live backend URL in the frontend host's env vars.
- Set `ALLOWED_ORIGINS` on the backend to a comma-separated list of your real
  frontend origins. It defaults to the deployed Vercel domain plus localhost.
- `vercel.json` rewrites everything to `index.html` so client-side routes such
  as `/tools/seo-studio` survive a hard refresh.

## How the SEO package is built

No AI API and no model download — it's deterministic text analysis in
`utils/nlp.py` and `utils/seo.py`:

1. Normalise the transcript, split it into sentences, and tokenise.
2. Rank single-word keywords by frequency, and n-gram phrases with a sliding
   window that rejects any phrase starting or ending on a stopword.
3. Pick the topic: a short known title (from YouTube) is used as-is, a long one
   is mined for the phrase it shares with the transcript, and otherwise the
   highest-weighted phrase carrying the primary keyword wins.
4. Fill the title templates, cut a meta description to 158 characters, build the
   long YouTube description, hashtags and the three keyword tiers.
5. Derive chapters from real subtitle cue timings when they exist, or estimate
   them from speaking rate when they don't.
6. Grade the result against a weighted publish-readiness checklist.

## Notes & limitations

- `edge-tts` is an unofficial wrapper around Microsoft Edge's "Read Aloud"
  feature. It's free and widely used, but not an officially published API — if
  Microsoft changes something server-side it could temporarily break.
- Caption fetching depends on `youtube-transcript-api`. YouTube rate-limits
  datacentre IPs, so a deployed backend may fail to fetch captions where your
  laptop succeeds. `/api/health` reports whether the dependency is even present.
- No rate limiting or auth is included. Add both before exposing this publicly
  so one user can't hammer the server with huge uploads.
- Input is capped (see `MAX_INPUT_CHARS` in `tools_api.py`) and generated MP3s
  are deleted from `backend/temp/` right after they're streamed back.


