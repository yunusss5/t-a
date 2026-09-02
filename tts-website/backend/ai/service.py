"""
The task layer between the API and whichever model is configured.

Endpoints call the functions here; nothing here speaks HTTP, and nothing here
knows which provider is in use. That separation is what makes the model
replaceable — `use_provider()` is enough to run this whole layer against a fake,
and a new host is a config change plus a class in providers.py.

Two rules everything below follows:

* The *instruction* is never user-supplied. A caller picks a task id out of
  ASSIST_TASKS, so the worst a visitor can do is choose a different task; their
  own text only ever arrives as fenced, sanitised material (see prompts.py).
* A model that is missing, unreachable, or babbling is a normal outcome rather
  than a surprise the caller has to guess at. Every failure here carries a
  sentence that is safe to show the person who asked.
"""

from collections.abc import AsyncIterator
import json
import logging
import re
import time

from config import settings

from .prompts import assist_messages, ideas_messages, sanitise, seo_polish_messages
from .providers import AiFailed, AiUnavailable, BaseProvider, build_provider

logger = logging.getLogger("voiceforge.ai")


class AiInputRejected(ValueError):
    """The request never reached the model: the input was unusable."""


# The instruction half of every prompt. Labels live here too, so the UI lists
# exactly the tasks the backend will accept instead of keeping its own copy.
ASSIST_TASKS: dict[str, dict[str, str]] = {
    "hooks": {
        "label": "Opening hooks",
        "hint": "Five ways to start, so you can pick the one that fits",
        "instruction": (
            "Write 5 alternative opening lines for this video. One sentence each, "
            "written to be spoken aloud. Return them as a plain numbered list."
        ),
    },
    "titles": {
        "label": "Title options",
        "hint": "Eight titles under 60 characters",
        "instruction": (
            "Write 8 title options, each under 60 characters. Return a plain "
            "numbered list. No clickbait the material does not support."
        ),
    },
    "description": {
        "label": "Description",
        "hint": "A summary paragraph plus what the video covers",
        "instruction": (
            "Write a video description: 2 to 3 sentences of summary, then a short "
            "bulleted list of what the video covers."
        ),
    },
    "outline": {
        "label": "Shooting outline",
        "hint": "The beats to film, in order",
        "instruction": (
            "Turn this into a shooting outline of 5 to 8 beats. Each beat is a "
            "short heading followed by one line on what it covers."
        ),
    },
    "shorts": {
        "label": "Shorts to cut",
        "hint": "The moments that stand alone vertically",
        "instruction": (
            "Pick the 5 moments that would work as standalone vertical shorts. For "
            "each, quote the line from the material and add one sentence on why it "
            "works on its own."
        ),
    },
    "tighten": {
        "label": "Tighten the script",
        "hint": "Same meaning, easier to say out loud",
        "instruction": (
            "Rewrite this to be tighter and easier to say out loud. Keep the "
            "meaning and every fact; cut padding, hedging and repetition. Return "
            "only the rewritten text."
        ),
    },
    "chapters": {
        "label": "Chapter titles",
        "hint": "Short, specific section names",
        "instruction": (
            "Propose chapter titles for this transcript in order. Short and "
            "specific, no marketing language. One per line."
        ),
    },
    "thumbnail": {
        "label": "Thumbnail text",
        "hint": "Overlay lines of three to five words",
        "instruction": (
            "Suggest 6 thumbnail text overlays, three to five words each. Return a "
            "plain numbered list."
        ),
    },
}

TONES = (
    "clear and direct",
    "warm and conversational",
    "energetic",
    "calm and factual",
    "plain and technical",
)

# Enough for a topic line ("bread baking for beginners"); short enough that an
# accidental empty submit is caught before a model call is paid for.
MIN_ASSIST_CHARS = 12
MIN_TRANSCRIPT_CHARS = 200

_provider: BaseProvider = build_provider(settings.ai)


def provider() -> BaseProvider:
    return _provider


def use_provider(replacement: BaseProvider) -> BaseProvider:
    """Swap the transport, returning the old one so a test can put it back."""
    global _provider
    previous, _provider = _provider, replacement
    _health_cache.clear()
    return previous


def available() -> bool:
    """True when a provider is configured well enough to be worth calling."""
    return _provider.kind != "none"


def require_provider() -> BaseProvider:
    if not available():
        raise AiUnavailable(
            "No model is connected. Set AI_PROVIDER, AI_BASE_URL and AI_MODEL on "
            "the server to switch the AI tools on."
        )
    return _provider


def catalogue() -> list[dict]:
    """The task list the UI renders, in declaration order."""
    return [
        {"id": task_id, "label": spec["label"], "hint": spec["hint"]}
        for task_id, spec in ASSIST_TASKS.items()
    ]


# A health probe is a network round trip to a host that may be a sleeping
# laptop. Cached briefly so a page with several AI panels costs one probe.
_HEALTH_TTL = 20.0
_health_cache: dict[str, tuple[float, dict]] = {}


async def _health() -> dict:
    cached = _health_cache.get("health")
    now = time.monotonic()
    if cached and now - cached[0] < _HEALTH_TTL:
        return cached[1]

    result = await _provider.health()
    _health_cache["health"] = (now, result)
    return result


async def status(*, probe: bool = True) -> dict:
    """What the frontend needs to decide between a working panel and an honest
    "connect a model" state. Never includes the API key, in any form."""
    report = {
        "enabled": available(),
        "provider": _provider.kind,
        "model": _provider.model or None if available() else None,
        "tasks": catalogue(),
        "tones": list(TONES),
        "max_input_chars": settings.ai.max_input_chars,
        "reachable": None,
        "detail": None,
    }

    if not available():
        report["detail"] = (
            "No model is connected. The AI panels stay off until one is configured; "
            "everything else on the site works without it."
        )
        return report

    if probe:
        health = await _health()
        report["reachable"] = health.get("reachable")
        report["model_pulled"] = health.get("model_pulled")
        report["detail"] = health.get("detail")

    return report


def _prepare(text: str, label: str, minimum: int) -> str:
    """Sanitise user text and refuse it before a model call if it is unusable."""
    cleaned = sanitise(text, settings.ai.max_input_chars)

    if len(cleaned) < minimum:
        raise AiInputRejected(
            f"There is not enough {label} to work with — paste at least "
            f"{minimum} characters."
        )
    return cleaned


def _tone(requested: str | None) -> str:
    """Tone reaches the prompt as prose, so it comes from the list or not at all."""
    return requested if requested in TONES else TONES[0]


_CODE_FENCE = re.compile(r"^```[a-zA-Z0-9]*\s*|\s*```$")


def _extract_json(text: str):
    """
    Parse a reply that is supposed to be JSON and often nearly is.

    Small models like to wrap JSON in a code fence or a sentence of preamble
    even when told not to, and re-rolling the generation costs a second or two —
    so widen the brackets and try again before giving up on the answer.
    """
    body = _CODE_FENCE.sub("", text.strip())

    try:
        return json.loads(body)
    except json.JSONDecodeError:
        pass

    for opener, closer in (("{", "}"), ("[", "]")):
        start, end = body.find(opener), body.rfind(closer)
        if 0 <= start < end:
            try:
                return json.loads(body[start : end + 1])
            except json.JSONDecodeError:
                continue

    return None


async def _json_task(messages: list[dict], *, expect: str, attempts: int = 2):
    """Complete, parse, and re-roll once at a lower temperature on garbage."""
    model_host = require_provider()
    for attempt in range(attempts):
        reply = await model_host.complete(
            messages, temperature=0.15 if attempt else None
        )
        parsed = _extract_json(reply.text)

        if isinstance(parsed, dict) and isinstance(parsed.get(expect), list):
            return parsed, reply.model

        # The reply itself is not logged: it is derived from someone's transcript.
        logger.warning(
            "AI reply was not usable JSON for %r (attempt %d/%d)",
            expect, attempt + 1, attempts,
        )

    raise AiFailed("The model did not answer in the expected format. Try again.")


def _task_spec(task: str) -> dict[str, str]:
    spec = ASSIST_TASKS.get((task or "").strip().lower())
    if spec is None:
        allowed = ", ".join(ASSIST_TASKS)
        raise AiInputRejected(f"Unknown task. Choose one of: {allowed}.")
    return spec


async def assist(task: str, content: str, *, tone: str | None = None) -> dict:
    """One creator request, one answer. Free-form text out; the UI renders it."""
    spec = _task_spec(task)
    body = _prepare(content, "material", MIN_ASSIST_CHARS)

    reply = await require_provider().complete(
        assist_messages(spec["instruction"], body, tone=_tone(tone))
    )
    return {"task": task, "label": spec["label"], "text": reply.text, "model": reply.model}


async def assist_stream(task: str, content: str, *, tone: str | None = None) -> AsyncIterator[str]:
    """The same request, streamed, so a long answer starts appearing at once."""
    spec = _task_spec(task)
    body = _prepare(content, "material", MIN_ASSIST_CHARS)

    async for piece in require_provider().stream(
        assist_messages(spec["instruction"], body, tone=_tone(tone))
    ):
        yield piece


def check_assist(task: str, content: str) -> None:
    """
    Validate a streaming request before the response commits to 200.

    An async generator runs nothing until its first item is pulled, by which
    point the status line is already on the wire — so the cheap checks happen
    here, where a bad task id can still be a 400.
    """
    _task_spec(task)
    _prepare(content, "material", MIN_ASSIST_CHARS)
    require_provider()


def _clean_package(package: dict) -> dict:
    """
    Trim the metadata that goes back into the polish prompt.

    The package normally comes straight from our own generator, but the endpoint
    accepts one from the client, which makes every string in it user input.
    """
    titles = [
        sanitise(str(title), 120)
        for title in (package.get("titles") or [])[:6]
        if str(title).strip()
    ]
    return {
        "topic": sanitise(str(package.get("topic") or ""), 160),
        "titles": titles,
        "description": sanitise(str(package.get("description") or ""), 800),
    }


def _text_field(value, limit: int) -> str:
    return sanitise(str(value or ""), limit)


async def seo_polish(package: dict, transcript: str, *, count: int = 5) -> dict:
    """
    Rewrite a mechanically generated SEO package so it reads like prose.

    The deterministic generator stays the source of truth: this only ever
    replaces wording, and the caller keeps the original to fall back on.
    """
    body = _prepare(transcript, "transcript", MIN_TRANSCRIPT_CHARS)
    parsed, model = await _json_task(
        seo_polish_messages(_clean_package(package), body, count=count),
        expect="titles",
    )

    titles = [_text_field(title, 120) for title in parsed["titles"] if str(title).strip()]
    if not titles:
        raise AiFailed("The model returned no usable titles. Try again.")

    return {
        "titles": titles[:count],
        "description": _text_field(parsed.get("description"), 400),
        "hook": _text_field(parsed.get("hook"), 240),
        "notes": _text_field(parsed.get("notes"), 240),
        "model": model,
    }


async def ideas(transcript: str, *, count: int = 6) -> dict:
    """Follow-up video ideas, each grounded in the transcript."""
    body = _prepare(transcript, "transcript", MIN_TRANSCRIPT_CHARS)
    parsed, model = await _json_task(ideas_messages(body, count=count), expect="ideas")

    cleaned: list[dict] = []
    for item in parsed["ideas"][: count * 2]:
        if not isinstance(item, dict):
            continue
        title = _text_field(item.get("title"), 120)
        if not title:
            continue
        cleaned.append({
            "title": title,
            "angle": _text_field(item.get("angle"), 240),
            "format": _text_field(item.get("format"), 24) or "long-form",
        })

    if not cleaned:
        raise AiFailed("The model returned no usable ideas. Try again.")

    return {"ideas": cleaned[:count], "model": model}
