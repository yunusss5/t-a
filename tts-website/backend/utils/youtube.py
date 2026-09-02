"""
YouTube helpers that need no Google API key.

  * video id parsing for every common URL shape (watch, youtu.be, shorts, embed, live)
  * public metadata via the oEmbed endpoint (title, channel, thumbnail)
  * captions via youtube-transcript-api, when the video has them
  * thumbnail URLs, which are just predictable static paths

youtube-transcript-api is an optional import: if it isn't installed the rest of
the toolkit keeps working and the caller gets a clear message instead of a 500.
"""

import re

import httpx

try:  # pragma: no cover - import shape differs across library versions
    from youtube_transcript_api import YouTubeTranscriptApi
except Exception:  # pragma: no cover
    YouTubeTranscriptApi = None

OEMBED_URL = "https://www.youtube.com/oembed"

_ID_PATTERNS = [
    re.compile(r"(?:youtube\.com/watch\?(?:.*&)?v=)([A-Za-z0-9_-]{11})"),
    re.compile(r"youtu\.be/([A-Za-z0-9_-]{11})"),
    re.compile(r"youtube\.com/shorts/([A-Za-z0-9_-]{11})"),
    re.compile(r"youtube\.com/embed/([A-Za-z0-9_-]{11})"),
    re.compile(r"youtube\.com/live/([A-Za-z0-9_-]{11})"),
    re.compile(r"^([A-Za-z0-9_-]{11})$"),  # a bare id pasted on its own
]

# Preference order when the requested language has no captions.
FALLBACK_LANGUAGES = ["en", "en-US", "en-GB", "hi", "es", "pt", "fr", "de", "ar"]


def extract_video_id(url: str) -> str:
    """Pull the 11-character video id out of any YouTube URL. Raises ValueError."""
    candidate = (url or "").strip()
    if not candidate:
        raise ValueError("Please paste a YouTube link.")

    for pattern in _ID_PATTERNS:
        match = pattern.search(candidate)
        if match:
            return match.group(1)

    raise ValueError("That doesn't look like a YouTube link. Try a full watch, "
                     "youtu.be or /shorts URL.")


def thumbnails(video_id: str) -> dict:
    """Static thumbnail paths — maxres only exists for HD uploads."""
    base = f"https://i.ytimg.com/vi/{video_id}"
    return {
        "maxres": f"{base}/maxresdefault.jpg",
        "hq": f"{base}/hqdefault.jpg",
        "mq": f"{base}/mqdefault.jpg",
        "sd": f"{base}/sddefault.jpg",
        "default": f"{base}/default.jpg",
        "webp": f"https://i.ytimg.com/vi_webp/{video_id}/maxresdefault.webp",
    }


async def fetch_metadata(video_id: str) -> dict:
    """Public title / channel / thumbnail via oEmbed. Never raises — degrades."""
    watch_url = f"https://www.youtube.com/watch?v={video_id}"

    try:
        async with httpx.AsyncClient(timeout=12.0, follow_redirects=True) as client:
            response = await client.get(OEMBED_URL,
                                        params={"url": watch_url, "format": "json"})
            response.raise_for_status()
            data = response.json()
    except Exception:
        return {"video_id": video_id, "watch_url": watch_url, "title": None,
                "author": None, "available": False}

    return {
        "video_id": video_id,
        "watch_url": watch_url,
        "title": data.get("title"),
        "author": data.get("author_name"),
        "author_url": data.get("author_url"),
        "thumbnail": data.get("thumbnail_url"),
        "width": data.get("width"),
        "height": data.get("height"),
        "available": True,
    }


def _raw_cues(video_id: str, languages: list[str]) -> list[dict]:
    """Normalise the differences between youtube-transcript-api versions."""
    if YouTubeTranscriptApi is None:
        raise RuntimeError("youtube-transcript-api is not installed on the server. "
                           "Run: pip install -r requirements.txt")

    if hasattr(YouTubeTranscriptApi, "get_transcript"):  # legacy 0.6.x static API
        return YouTubeTranscriptApi.get_transcript(video_id, languages=languages)

    fetched = YouTubeTranscriptApi().fetch(video_id, languages=languages)
    if hasattr(fetched, "to_raw_data"):
        return fetched.to_raw_data()

    return [{"text": s.text, "start": s.start, "duration": s.duration} for s in fetched]


def fetch_transcript(video_id: str, language: str = "en") -> dict:
    """
    Return {cues, text, duration, language}. Tries the requested language first,
    then a short fallback list, so most public videos resolve on the first call.
    """
    wanted = [language] + [lang for lang in FALLBACK_LANGUAGES if lang != language]

    last_error: Exception | None = None
    for candidate in ([wanted[0]], wanted):
        try:
            cues = _raw_cues(video_id, candidate)
            break
        except RuntimeError:
            raise
        except Exception as error:  # no captions in that language — try the wider list
            last_error = error
            cues = None

    if not cues:
        raise ValueError("No captions available for this video. Download the "
                         "transcript manually and use the Upload tab instead. "
                         f"({type(last_error).__name__ if last_error else 'unknown'})")

    cleaned = [
        {"text": re.sub(r"\s+", " ", cue.get("text", "")).strip(),
         "start": float(cue.get("start", 0) or 0),
         "duration": float(cue.get("duration", 0) or 0)}
        for cue in cues
        if cue.get("text") and not cue["text"].strip().startswith("[")
    ]

    duration = (cleaned[-1]["start"] + cleaned[-1]["duration"]) if cleaned else 0.0

    return {
        "cues": cleaned,
        "text": " ".join(cue["text"] for cue in cleaned),
        "duration": round(duration, 2),
        "language": language,
    }
