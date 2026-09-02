"""
All the non-TTS tool endpoints, grouped in one router and mounted by main.py.

    POST /api/seo/from-text        text            -> full SEO package
    POST /api/seo/from-file        .txt/.srt/.vtt  -> full SEO package (real timestamps)
    POST /api/seo/from-youtube     video url       -> metadata + captions + SEO package
    POST /api/text/summarize       text            -> summary sentences + bullets
    POST /api/text/analyze         text            -> counts, readability, keywords
    POST /api/subtitles/convert    subtitles       -> srt / vtt / txt / csv (+ retiming)
    POST /api/youtube/inspect      video url       -> metadata + every thumbnail size
    GET  /api/health
"""

from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from config import settings
from ratelimit import rate_limit
from uploads import read_upload, require_extension
from utils import nlp, seo, subtitles, youtube
from utils.file_parser import parse_transcript_file

router = APIRouter(prefix="/api", tags=["tools"])

# ~35k words; keeps a single request bounded. Overridable with MAX_TEXT_CHARS.
MAX_INPUT_CHARS = settings.max_text_chars

# Anything that reaches out to YouTube, or parses a whole uploaded file, gets the
# smaller "heavy" budget; the pure-CPU text tools use the default one.
CHEAP = [Depends(rate_limit())]
HEAVY = [Depends(rate_limit("heavy"))]


def _require_text(text: str, label: str = "text") -> str:
    """Validate and clamp any user-supplied body of text."""
    cleaned = nlp.normalise(text or "")
    if not cleaned:
        raise HTTPException(status_code=400, detail=f"Please provide some {label}.")
    if len(cleaned) > MAX_INPUT_CHARS:
        raise HTTPException(
            status_code=413,
            detail=f"That's {len(cleaned):,} characters — the limit is "
                   f"{MAX_INPUT_CHARS:,}. Split it into parts.",
        )
    return cleaned


def _cues_to_seo_cues(cues: list[dict]) -> list[dict]:
    """Subtitle cues (start/end) -> the start/duration shape build_chapters wants."""
    return [{"text": cue["text"], "start": cue["start"],
             "duration": max(0.0, cue["end"] - cue["start"])} for cue in cues]


@router.get("/health")
def health():
    """Cheap readiness probe that also reports optional-dependency status."""
    return {
        "status": "ok",
        "captions_available": youtube.YouTubeTranscriptApi is not None,
    }


@router.post("/seo/from-text", dependencies=CHEAP)
def seo_from_text(
    text: str = Form(...),
    known_title: Optional[str] = Form(None),
    source_url: Optional[str] = Form(None),
):
    """Generate the SEO package from pasted script / transcript text."""
    cleaned = _require_text(text, "transcript or script text")

    try:
        return seo.build_package(cleaned, source_url=source_url, known_title=known_title)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))


@router.post("/seo/from-file", dependencies=HEAVY)
async def seo_from_file(
    file: UploadFile = File(...),
    known_title: Optional[str] = Form(None),
):
    """
    Same as /seo/from-text, but for an uploaded transcript. When the upload is a
    .srt/.vtt we keep the cue timings, so the generated chapters carry the real
    timestamps from the file instead of estimates.
    """
    name = require_extension(file.filename)
    raw = await read_upload(file)

    seo_cues, duration = None, None

    if name.lower().endswith((".srt", ".vtt")):
        cues = subtitles.parse_cues(raw.decode("utf-8", errors="ignore"))
        if cues:
            seo_cues = _cues_to_seo_cues(cues)
            duration = cues[-1]["end"]
            body = subtitles.to_txt(cues)
        else:
            body = ""
    else:
        try:
            body = parse_transcript_file(name, raw)
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error))

    cleaned = _require_text(body, "readable text in that file")

    try:
        package = seo.build_package(cleaned, cues=seo_cues, duration=duration,
                                    known_title=known_title)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))

    package["source_file"] = name
    # The parsed text goes back with the package: it is the visitor's own file,
    # and the AI polish step needs the transcript it was derived from. Parsing
    # .srt cue structure a second time in the browser would only invite drift.
    package["transcript"] = cleaned
    return package


@router.post("/seo/from-youtube", dependencies=HEAVY)
async def seo_from_youtube(
    url: str = Form(...),
    language: str = Form("en"),
):
    """Pull a video's public metadata + captions, then build the SEO package."""
    try:
        video_id = youtube.extract_video_id(url)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))

    metadata = await youtube.fetch_metadata(video_id)

    try:
        transcript = youtube.fetch_transcript(video_id, language)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error))
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error))

    cleaned = _require_text(transcript["text"], "captions")

    package = seo.build_package(
        cleaned,
        cues=[{"text": c["text"], "start": c["start"], "duration": c["duration"]}
              for c in transcript["cues"]],
        duration=transcript["duration"],
        source_url=metadata["watch_url"],
        known_title=metadata.get("title"),
    )

    package["video"] = {**metadata, "thumbnails": youtube.thumbnails(video_id),
                        "duration": transcript["duration"],
                        "caption_language": transcript["language"]}
    package["transcript"] = cleaned
    return package


@router.post("/text/summarize", dependencies=CHEAP)
def summarize(
    text: str = Form(...),
    sentences: int = Form(5),
):
    """Extractive summary: a paragraph, plus the same points as bullets."""
    cleaned = _require_text(text)
    wanted = max(1, min(15, sentences))

    picked = nlp.summarize(cleaned, max_sentences=wanted)
    original = nlp.timings(cleaned)
    condensed = nlp.timings(" ".join(picked))

    reduction = 0
    if original["words"]:
        reduction = round((1 - condensed["words"] / original["words"]) * 100)

    return {
        "summary": " ".join(picked),
        "bullets": picked,
        "original": original,
        "condensed": condensed,
        "reduction_percent": max(0, reduction),
        "keywords": [item["keyword"] for item in nlp.keyword_scores(cleaned, 10)],
    }


@router.post("/text/analyze", dependencies=CHEAP)
def analyze(text: str = Form(...)):
    """Everything a writer wants to know before publishing."""
    cleaned = _require_text(text)

    return {
        "stats": nlp.timings(cleaned),
        "readability": nlp.readability(cleaned),
        "keywords": nlp.keyword_scores(cleaned, 20),
        "phrases": nlp.phrases(cleaned, sizes=(2, 3), top=15),
        "long_tail": nlp.phrases(cleaned, sizes=(4, 5), top=8),
        "summary": nlp.summarize(cleaned, max_sentences=3),
    }


@router.post("/subtitles/convert", dependencies=CHEAP)
async def convert_subtitles(
    file: Optional[UploadFile] = File(None),
    content: Optional[str] = Form(None),
    target: str = Form("srt"),
    offset: float = Form(0.0),
    scale: float = Form(1.0),
    words_per_cue: int = Form(9),
    words_per_minute: float = Form(150.0),
):
    """
    Convert between subtitle formats and fix timings in one pass.

    Plain text in (no `-->` timings) is auto-cued from the words-per-minute
    setting, which turns a script into ready-to-upload subtitles.
    """
    if file is not None:
        require_extension(file.filename)
        raw = await read_upload(file)
        body = raw.decode("utf-8", errors="ignore")
    else:
        body = content or ""

    body = body.strip()
    if not body:
        raise HTTPException(status_code=400, detail="Paste subtitles or choose a file.")
    if len(body) > MAX_INPUT_CHARS:
        raise HTTPException(
            status_code=413,
            detail=f"That's too long — the limit is {MAX_INPUT_CHARS:,} characters.",
        )

    cues = subtitles.parse_cues(body)
    generated_from_text = False

    if not cues:
        cues = subtitles.plain_text_to_cues(body, words_per_cue, words_per_minute)
        generated_from_text = True

    if not cues:
        raise HTTPException(status_code=400, detail="Couldn't find any subtitle cues or text.")

    if scale and scale != 1.0:
        cues = subtitles.scale_cues(cues, scale)
    if offset:
        cues = subtitles.shift_cues(cues, offset)

    try:
        output = subtitles.render(cues, target)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))

    return {
        "output": output,
        "format": target.lower(),
        "cue_count": len(cues),
        "duration": round(cues[-1]["end"], 2),
        "generated_from_plain_text": generated_from_text,
        "filename": f"subtitles.{target.lower()}",
        "preview": cues[:8],
    }


@router.post("/youtube/inspect", dependencies=HEAVY)
async def inspect_youtube(url: str = Form(...), language: str = Form("en")):
    """Metadata + every thumbnail size + captions if the video has them."""
    try:
        video_id = youtube.extract_video_id(url)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))

    metadata = await youtube.fetch_metadata(video_id)

    transcript, caption_error = None, None
    try:
        transcript = youtube.fetch_transcript(video_id, language)
    except (ValueError, RuntimeError) as error:
        caption_error = str(error)

    return {
        **metadata,
        "thumbnails": youtube.thumbnails(video_id),
        "transcript": transcript["text"] if transcript else None,
        "cues": transcript["cues"] if transcript else None,
        "duration": transcript["duration"] if transcript else None,
        "caption_error": caption_error,
    }
