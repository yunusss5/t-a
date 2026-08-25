"""
Wraps the edge-tts library so the rest of the app doesn't need to know
the details of how audio is generated. Keeping this isolated means you
can swap in a different engine (e.g. Coqui TTS) later without touching
main.py.
"""

import os
import uuid
import asyncio
import edge_tts

TEMP_DIR = os.path.join(os.path.dirname(__file__), "temp")
os.makedirs(TEMP_DIR, exist_ok=True)

# Max characters per chunk. edge-tts can time out or choke on very long
# single requests, so long transcripts get split and stitched back together.
MAX_CHUNK_CHARS = 3000

# Average spoken words-per-minute at edge-tts's default "+0%" rate.
# Used only to estimate a rate% for the Auto Speed / target-time feature.
BASE_WPM = 165.0

# Practical bounds — beyond these, edge-tts speech becomes hard to
# understand or sounds unnatural, so we clamp regardless of the math.
MIN_RATE_PERCENT = -50.0
MAX_RATE_PERCENT = 100.0


def chunk_text(text: str, max_chars: int = MAX_CHUNK_CHARS) -> list[str]:
    """
    Split text into chunks at sentence boundaries where possible,
    so we don't cut a sentence in half mid-word.
    """
    if len(text) <= max_chars:
        return [text]

    sentences = text.replace("\n", " ").split(". ")
    chunks = []
    current = ""

    for sentence in sentences:
        candidate = f"{current}. {sentence}" if current else sentence
        if len(candidate) > max_chars and current:
            chunks.append(current.strip() + ".")
            current = sentence
        else:
            current = candidate

    if current:
        chunks.append(current.strip())

    return chunks


def estimate_rate_for_target(text: str, target_seconds: float, base_wpm: float = BASE_WPM) -> str:
    """
    Estimate the edge-tts rate% needed to make `text` take approximately
    `target_seconds` to speak, based on word count.

    Returns a string like "+23%" or "-15%", clamped to a sane range.
    """
    word_count = len(text.split())

    if word_count == 0 or not target_seconds or target_seconds <= 0:
        return "+0%"

    estimated_seconds_at_normal_rate = word_count / (base_wpm / 60.0)
    ratio = estimated_seconds_at_normal_rate / target_seconds
    percent = (ratio - 1) * 100

    percent = max(MIN_RATE_PERCENT, min(MAX_RATE_PERCENT, percent))
    percent = round(percent)

    sign = "+" if percent >= 0 else "-"
    return f"{sign}{abs(percent)}%"


async def _synthesize_chunk(text: str, voice: str, out_path: str, rate: str = "+0%", pitch: str = "+0Hz"):
    communicate = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
    await communicate.save(out_path)


async def generate_audio(text: str, voice: str, rate: str = "+0%", pitch: str = "+0Hz") -> str:
    """
    Generate an mp3 file for the given text + voice.
    Handles long text by chunking, generating each part, then
    concatenating the raw mp3 bytes (works fine for mp3 streams).

    Returns the path to the final mp3 file.
    """
    if not text or not text.strip():
        raise ValueError("No text provided to synthesize.")

    chunks = chunk_text(text.strip())
    job_id = uuid.uuid4().hex
    part_paths = []

    for i, chunk in enumerate(chunks):
        part_path = os.path.join(TEMP_DIR, f"{job_id}_part{i}.mp3")
        await _synthesize_chunk(chunk, voice, part_path, rate, pitch)
        part_paths.append(part_path)

    final_path = os.path.join(TEMP_DIR, f"{job_id}.mp3")

    if len(part_paths) == 1:
        os.replace(part_paths[0], final_path)
    else:
        with open(final_path, "wb") as out_file:
            for part_path in part_paths:
                with open(part_path, "rb") as pf:
                    out_file.write(pf.read())
                os.remove(part_path)

    return final_path


def cleanup_file(path: str):
    """Delete a generated audio file after it's been sent to the user."""
    try:
        if os.path.exists(path):
            os.remove(path)
    except OSError:
        pass