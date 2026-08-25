"""
Main FastAPI application.

Routes:
  GET  /voices                -> returns cached voice list (for dropdowns)
  POST /generate              -> body: { text, voice, rate, pitch, target_time, auto_speed } -> returns mp3
  POST /generate-from-file    -> multipart file upload (.txt/.srt/.vtt) + voice (+ same speed options) -> returns mp3

Run locally:
    uvicorn main:app --reload --port 8000
"""

import os
import json
from typing import Optional

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from tts_engine import generate_audio, cleanup_file, estimate_rate_for_target
from utils.file_parser import parse_transcript_file

app = FastAPI(title="Free TTS API")

# Allow your frontend (running on a different port/domain) to call this API.
# Tighten this to your real frontend URL before going to production.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://t-a-omega.vercel.app"],  # Your deployed frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

VOICES_PATH = os.path.join(os.path.dirname(__file__), "voices.json")


def resolve_rate(text: str, rate: str, target_time: Optional[float], auto_speed: bool) -> str:
    """
    If Auto Speed is on and a target_time was given, calculate the rate
    needed to hit that duration and use it instead of the manual rate.
    Otherwise, fall back to the manually selected rate.
    """
    if auto_speed and target_time and target_time > 0:
        return estimate_rate_for_target(text, target_time)
    return rate


@app.get("/voices")
def get_voices():
    """Returns the cached list of available voices for the frontend dropdowns."""
    if not os.path.exists(VOICES_PATH):
        raise HTTPException(status_code=500, detail="voices.json not found. Run voices.py first.")
    with open(VOICES_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


@app.post("/generate")
async def generate(
    background_tasks: BackgroundTasks,
    text: str = Form(...),
    voice: str = Form(...),
    rate: str = Form("+0%"),
    pitch: str = Form("+0Hz"),
    target_time: Optional[float] = Form(None),
    auto_speed: bool = Form(False),
):
    """Generate audio from pasted text."""
    if not text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty.")

    resolved_rate = resolve_rate(text, rate, target_time, auto_speed)

    try:
        audio_path = await generate_audio(text, voice, resolved_rate, pitch)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"TTS generation failed: {e}")

    # Delete the file after it's been sent to the client.
    background_tasks.add_task(cleanup_file, audio_path)

    return FileResponse(
        audio_path,
        media_type="audio/mpeg",
        filename="speech.mp3",
        headers={"X-Applied-Rate": resolved_rate},
    )


@app.post("/generate-from-file")
async def generate_from_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    voice: str = Form(...),
    rate: str = Form("+0%"),
    pitch: str = Form("+0Hz"),
    target_time: Optional[float] = Form(None),
    auto_speed: bool = Form(False),
):
    """Generate audio from an uploaded transcript file (.txt, .srt, .vtt)."""
    raw_bytes = await file.read()

    try:
        text = parse_transcript_file(file.filename, raw_bytes)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not text.strip():
        raise HTTPException(status_code=400, detail="No readable text found in the uploaded file.")

    resolved_rate = resolve_rate(text, rate, target_time, auto_speed)

    try:
        audio_path = await generate_audio(text, voice, resolved_rate, pitch)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"TTS generation failed: {e}")

    background_tasks.add_task(cleanup_file, audio_path)

    return FileResponse(
        audio_path,
        media_type="audio/mpeg",
        filename="speech.mp3",
        headers={"X-Applied-Rate": resolved_rate},
    )


@app.get("/")
def root():
    return {"status": "ok", "message": "TTS API is running. See /docs for API documentation."}
