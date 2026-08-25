# Free Text-to-Speech Website

Paste text (or upload a `.txt` / `.srt` / `.vtt` transcript), pick a language and
voice (male/female), and download an MP3 — powered by `edge-tts` (Microsoft
Edge's free neural voices), no API key required.

## Folder structure

```
tts-website/
├── backend/
│   ├── main.py            # FastAPI app (routes)
│   ├── tts_engine.py      # edge-tts wrapper + chunking for long text
│   ├── voices.py          # script to refresh voices.json
│   ├── voices.json        # cached voice list (pre-filled, ~28 voices)
│   ├── requirements.txt
│   ├── temp/               # generated mp3s (auto-deleted after download)
│   └── utils/
│       └── file_parser.py # strips timestamps from .srt / .vtt uploads
├── frontend/
│   ├── index.html
│   ├── style.css
│   └── script.js
├── .gitignore
└── README.md
```

## 1. Run the backend

```bash
cd backend
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Backend will run at `http://localhost:8000`. Visit `http://localhost:8000/docs`
to see and test the API directly.

### (Optional) Refresh the full voice list

`voices.json` already ships with ~28 common voices across English, Hindi,
Spanish, French, German, Arabic, Tamil, Telugu, Bengali, Japanese, Chinese,
and Portuguese. To pull the *entire* list edge-tts supports (100+ languages):

```bash
python voices.py
```

Edit the `LOCALE_FILTER` list inside `voices.py` first if you want to
include/exclude specific languages.

## 2. Run the frontend

No build step needed — it's plain HTML/CSS/JS. Just open it:

```bash
cd frontend
python -m http.server 5500
```

Then visit `http://localhost:5500`.

If you open `index.html` directly by double-clicking it, some browsers block
the API calls (CORS). Serving it via `http.server` (or Live Server in VS
Code) avoids that.

## 3. Deploy for free

| Part      | Free host options                     |
|-----------|----------------------------------------|
| Backend   | Render.com, Railway.app, Fly.io       |
| Frontend  | Vercel, Netlify, GitHub Pages         |

Once deployed, update `API_BASE` at the top of `frontend/script.js` to your
live backend URL (e.g. `https://your-app.onrender.com`).

## How it works

1. User pastes text or uploads a transcript file.
2. Frontend sends it + chosen voice to the backend (`/generate` or
   `/generate-from-file`).
3. Backend uses `edge-tts` to synthesize speech (long text is automatically
   split into ~3000-character chunks and stitched back together).
4. Backend streams the resulting MP3 back; frontend shows an audio player
   and a download button.
5. The temp MP3 file on the server is deleted right after it's sent.

## Notes & limitations

- `edge-tts` is an unofficial wrapper around Microsoft Edge's "Read Aloud"
  feature. It's free and widely used, but not an officially published API —
  if Microsoft changes something server-side, it could temporarily break.
- CORS is wide open (`allow_origins=["*"]`) for easy local testing — restrict
  this to your actual frontend domain before going to production.
- No rate limiting or auth is included — add these if you expect public
  traffic, so one user can't hammer your server with huge files.
