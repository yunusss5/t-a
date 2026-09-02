"""
Main FastAPI application: the speech routes, plus the wiring every route relies on.

    GET  /voices               the voice list the dropdowns read (cached, ETagged)
    POST /generate             text -> mp3
    POST /generate-from-file   .txt/.srt/.vtt -> mp3
    GET  /health               liveness, and which optional pieces are available
    GET  /

Everything else is a router: the text/SEO/subtitle tools in tools_api.py under
/api, the model-backed features in ai_api.py under /api/ai.

Cross-cutting behaviour is deliberately not written inline here — settings in
config.py, request budgets in ratelimit.py, headers and logging in
middleware.py, one error envelope in errors.py, bounded reads in uploads.py — so
a route function contains only what that route actually does.

Run locally:
    uvicorn main:app --reload --port 8000
"""

import hashlib
import json
import logging
import os
import re
from typing import Optional

from fastapi import BackgroundTasks, Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response

from ai import service as ai_service
from ai_api import router as ai_router
from config import settings
from errors import install_error_handlers
from middleware import (
    BodySizeLimitMiddleware,
    CompressionMiddleware,
    RequestLogMiddleware,
    SecurityHeadersMiddleware,
    configure_logging,
)
from ratelimit import rate_limit
from tools_api import router as tools_router
from tts_engine import cleanup_file, estimate_rate_for_target, generate_audio
from uploads import read_upload, require_extension
from utils import youtube
from utils.file_parser import parse_transcript_file

configure_logging()
logger = logging.getLogger("voiceforge.api")

app = FastAPI(
    title="VoiceForge Creator Toolkit API",
    version="3.0.0",
    description=(
        "Text to speech, SEO packages from transcripts or YouTube links, subtitle "
        "conversion, and optional model-backed writing help."
    ),
)

install_error_handlers(app)

# Middleware runs outermost-last: the final add_middleware call is the first to
# see a request. So CORS is outermost (a 413 or 429 still needs its headers, or
# the browser shows a CORS error instead of the actual message), then logging
# wraps everything it can, then the size gate rejects before any route runs, and
# compression sits innermost where it only ever sees a finished response.
app.add_middleware(CompressionMiddleware, minimum_size=900)

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(BodySizeLimitMiddleware, max_bytes=settings.max_request_bytes)
app.add_middleware(RequestLogMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    # No cookies, no Authorization header: the API is anonymous, so credentialed
    # requests are switched off rather than allowed and ignored.
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "X-Request-ID"],
    expose_headers=["X-Applied-Rate", "X-Request-ID", "Retry-After"],
    max_age=3600,
)

app.include_router(tools_router)
app.include_router(ai_router)

VOICES_PATH = os.path.join(os.path.dirname(__file__), "voices.json")

# voices.json ships with the app and only changes when voices.py regenerates it,
# so it is read once instead of on every dropdown render.
_voices_cache: tuple[list, frozenset, str] | None = None


def _voices() -> tuple[list, frozenset, str]:
    """The voice list, the set of valid names, and an ETag for the file."""
    global _voices_cache

    if _voices_cache is not None:
        return _voices_cache

    try:
        with open(VOICES_PATH, "rb") as handle:
            raw = handle.read()
        voices = json.loads(raw)
    except (OSError, json.JSONDecodeError) as error:
        # The path and the parser message go to the log, not to the caller.
        logger.error("voices.json could not be loaded: %s", error)
        raise HTTPException(
            status_code=503,
            detail="The voice list is unavailable. Try again in a moment.",
        ) from error

    if not isinstance(voices, list) or not voices:
        logger.error("voices.json did not contain a non-empty list")
        raise HTTPException(status_code=503, detail="The voice list is unavailable.")

    names = frozenset(
        str(voice.get("name", "")) for voice in voices if isinstance(voice, dict)
    )
    etag = f'"{hashlib.sha256(raw).hexdigest()[:16]}"'

    _voices_cache = (voices, names, etag)
    return _voices_cache


# edge-tts puts both of these straight into the SSML it sends upstream, so they
# are matched against a shape rather than passed through: a value like
# `+0%"><speak>` has no legitimate use and should never reach the wire.
_RATE_PATTERN = re.compile(r"^[+-]\d{1,3}%$")
_PITCH_PATTERN = re.compile(r"^[+-]\d{1,3}Hz$")


def _require_voice(voice: str) -> str:
    """A voice name has to be one we published; anything else is a 400, not a 500."""
    _, names, _ = _voices()
    name = (voice or "").strip()

    if name not in names:
        raise HTTPException(
            status_code=400,
            detail="That voice is not available. Pick one from the voice list.",
        )
    return name


def _require_tts_text(text: str) -> str:
    cleaned = (text or "").strip()

    if not cleaned:
        raise HTTPException(status_code=400, detail="Enter some text to speak.")
    if len(cleaned) > settings.max_tts_chars:
        raise HTTPException(
            status_code=413,
            detail=f"That is {len(cleaned):,} characters — the limit for one "
                   f"recording is {settings.max_tts_chars:,}. Split it into parts.",
        )
    return cleaned


def _require_prosody(rate: str, pitch: str) -> tuple[str, str]:
    if not _RATE_PATTERN.match(rate or ""):
        raise HTTPException(status_code=400, detail="Rate must look like +10% or -20%.")
    if not _PITCH_PATTERN.match(pitch or ""):
        raise HTTPException(status_code=400, detail="Pitch must look like +5Hz or -10Hz.")
    return rate, pitch


def resolve_rate(text: str, rate: str, target_time: Optional[float], auto_speed: bool) -> str:
    """
    With Auto Speed on and a target length given, work out the rate that lands
    near that length and use it instead of the manual rate.
    """
    if auto_speed and target_time and target_time > 0:
        return estimate_rate_for_target(text, target_time)
    return rate


async def _synthesize(text: str, voice: str, rate: str, pitch: str) -> str:
    """Run the engine, and keep upstream failure detail out of the response."""
    try:
        return await generate_audio(text, voice, rate, pitch)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        # The exception text here can carry the upstream URL and local paths.
        logger.exception("speech synthesis failed (voice=%s, rate=%s)", voice, rate)
        raise HTTPException(
            status_code=502,
            detail="The speech service did not respond. Try again in a moment.",
        ) from error


@app.get("/voices", dependencies=[Depends(rate_limit())])
def get_voices(request: Request):
    """
    The voice list for the dropdowns.

    Served from memory with an ETag and an hour of caching: the file is static
    between deploys, and a revisit should not re-download 28 voice descriptions.
    """
    voices, _, etag = _voices()
    headers = {"Cache-Control": "public, max-age=3600", "ETag": etag}

    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers=headers)

    return JSONResponse(voices, headers=headers)


@app.post("/generate", dependencies=[Depends(rate_limit("heavy"))])
async def generate(
    background_tasks: BackgroundTasks,
    text: str = Form(...),
    voice: str = Form(...),
    rate: str = Form("+0%"),
    pitch: str = Form("+0Hz"),
    target_time: Optional[float] = Form(None),
    auto_speed: bool = Form(False),
):
    """Speak pasted text."""
    clean_text = _require_tts_text(text)
    clean_voice = _require_voice(voice)
    rate, pitch = _require_prosody(rate, pitch)

    resolved_rate = resolve_rate(clean_text, rate, target_time, auto_speed)
    audio_path = await _synthesize(clean_text, clean_voice, resolved_rate, pitch)

    # The file is deleted once the response has been sent.
    background_tasks.add_task(cleanup_file, audio_path)

    return FileResponse(
        audio_path,
        media_type="audio/mpeg",
        filename="speech.mp3",
        headers={"X-Applied-Rate": resolved_rate, "Cache-Control": "no-store"},
    )


@app.post("/generate-from-file", dependencies=[Depends(rate_limit("heavy"))])
async def generate_from_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    voice: str = Form(...),
    rate: str = Form("+0%"),
    pitch: str = Form("+0Hz"),
    target_time: Optional[float] = Form(None),
    auto_speed: bool = Form(False),
):
    """Speak an uploaded transcript (.txt, .srt, .vtt)."""
    filename = require_extension(file.filename)
    raw_bytes = await read_upload(file)

    clean_voice = _require_voice(voice)
    rate, pitch = _require_prosody(rate, pitch)

    try:
        text = parse_transcript_file(filename, raw_bytes)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    if not text.strip():
        raise HTTPException(
            status_code=400,
            detail="That file had no readable text in it.",
        )

    clean_text = _require_tts_text(text)
    resolved_rate = resolve_rate(clean_text, rate, target_time, auto_speed)
    audio_path = await _synthesize(clean_text, clean_voice, resolved_rate, pitch)

    background_tasks.add_task(cleanup_file, audio_path)

    return FileResponse(
        audio_path,
        media_type="audio/mpeg",
        filename="speech.mp3",
        headers={"X-Applied-Rate": resolved_rate, "Cache-Control": "no-store"},
    )


@app.get("/health")
async def health():
    """
    Deployment probe. Reports what is optional and whether it is present, so a
    missing caption library or an unconfigured model reads as a state rather
    than a mystery 500 later.
    """
    try:
        voice_count = len(_voices()[0])
    except HTTPException:
        voice_count = 0

    ai_state = await ai_service.status(probe=False)

    return {
        "status": "ok",
        "version": app.version,
        "voices": voice_count,
        "captions_available": youtube.YouTubeTranscriptApi is not None,
        "ai": {
            "enabled": ai_state["enabled"],
            "provider": ai_state["provider"],
            "model": ai_state["model"],
        },
        "limits": {
            "max_upload_bytes": settings.max_upload_bytes,
            "max_request_bytes": settings.max_request_bytes,
            "max_text_chars": settings.max_text_chars,
            "max_tts_chars": settings.max_tts_chars,
        },
    }


@app.get("/")
def root():
    return {
        "status": "ok",
        "message": "VoiceForge Creator Toolkit API. See /docs for the endpoints.",
        "tools": ["tts", "seo", "summarize", "analyze", "subtitles", "youtube", "ai"],
        "ai_enabled": ai_service.available(),
    }
