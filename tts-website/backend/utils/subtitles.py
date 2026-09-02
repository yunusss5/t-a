"""
Subtitle parsing and rewriting: SRT ⇄ VTT ⇄ plain text, plus timing fixes.

Everything runs through one intermediate shape so any input can produce any
output:

    cue = {"start": float_seconds, "end": float_seconds, "text": str}
"""

import re

_TIME = re.compile(r"(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})")
_ARROW = re.compile(r"(.+?)\s*-->\s*([^\s]+)")


def parse_timestamp(value: str) -> float:
    """'00:01:02,500' or '01:02.500' -> seconds as a float."""
    match = _TIME.search(value or "")
    if not match:
        raise ValueError(f"Unreadable timestamp: {value!r}")

    hours, minutes, seconds, millis = match.groups()
    return (int(hours or 0) * 3600 + int(minutes) * 60 + int(seconds)
            + int(millis.ljust(3, "0")) / 1000.0)


def format_timestamp(seconds: float, style: str = "srt") -> str:
    """Seconds -> '00:01:02,500' (srt) or '00:01:02.500' (vtt)."""
    seconds = max(0.0, float(seconds))
    whole = int(seconds)
    millis = int(round((seconds - whole) * 1000))

    if millis == 1000:  # rounding spilled over
        whole, millis = whole + 1, 0

    hours, remainder = divmod(whole, 3600)
    minutes, secs = divmod(remainder, 60)
    separator = "," if style == "srt" else "."

    return f"{hours:02d}:{minutes:02d}:{secs:02d}{separator}{millis:03d}"


def parse_cues(content: str) -> list[dict]:
    """
    Parse SRT or WebVTT. Both are blank-line separated blocks containing an
    optional index/cue id, a timing line, then one or more text lines — so a
    single tolerant parser handles them and any hand-edited mix of the two.
    """
    text = (content or "").replace("\r\n", "\n").replace("﻿", "").strip()
    if not text:
        return []

    cues = []
    for block in re.split(r"\n{2,}", text):
        lines = [line.strip() for line in block.split("\n") if line.strip()]
        if not lines:
            continue
        if lines[0].upper().startswith(("WEBVTT", "NOTE", "STYLE", "REGION")):
            continue

        timing_index = next((i for i, line in enumerate(lines) if "-->" in line), None)
        if timing_index is None:
            continue

        arrow = _ARROW.search(lines[timing_index])
        if not arrow:
            continue

        try:
            start = parse_timestamp(arrow.group(1))
            end = parse_timestamp(arrow.group(2))
        except ValueError:
            continue

        body = " ".join(lines[timing_index + 1:]).strip()
        body = re.sub(r"</?[a-zA-Z][^>]*>", "", body)  # drop <i>, <c.colour> etc.

        if body:
            cues.append({"start": start, "end": max(end, start), "text": body})

    return cues


def plain_text_to_cues(text: str, words_per_cue: int = 9,
                       words_per_minute: float = 150.0) -> list[dict]:
    """Turn a script into evenly timed cues so it can be exported as subtitles."""
    tokens = (text or "").split()
    if not tokens:
        return []

    seconds_per_word = 60.0 / max(60.0, words_per_minute)
    cues, cursor = [], 0.0

    for index in range(0, len(tokens), max(1, words_per_cue)):
        chunk = tokens[index:index + max(1, words_per_cue)]
        span = len(chunk) * seconds_per_word
        cues.append({"start": round(cursor, 3),
                     "end": round(cursor + span, 3),
                     "text": " ".join(chunk)})
        cursor += span

    return cues


def shift_cues(cues: list[dict], offset: float) -> list[dict]:
    """Move every cue by offset seconds (negative pulls subtitles earlier)."""
    shifted = []
    for cue in cues:
        start = max(0.0, cue["start"] + offset)
        end = max(start, cue["end"] + offset)
        shifted.append({**cue, "start": start, "end": end})
    return shifted


def scale_cues(cues: list[dict], factor: float) -> list[dict]:
    """Stretch/compress timings — fixes 23.976 vs 25 fps drift."""
    factor = factor if factor and factor > 0 else 1.0
    return [{**cue, "start": cue["start"] * factor, "end": cue["end"] * factor}
            for cue in cues]


def to_srt(cues: list[dict]) -> str:
    blocks = [
        f"{index}\n{format_timestamp(cue['start'], 'srt')} --> "
        f"{format_timestamp(cue['end'], 'srt')}\n{cue['text']}"
        for index, cue in enumerate(cues, start=1)
    ]
    return "\n\n".join(blocks) + ("\n" if blocks else "")


def to_vtt(cues: list[dict]) -> str:
    blocks = [
        f"{format_timestamp(cue['start'], 'vtt')} --> "
        f"{format_timestamp(cue['end'], 'vtt')}\n{cue['text']}"
        for cue in cues
    ]
    return "WEBVTT\n\n" + "\n\n".join(blocks) + ("\n" if blocks else "")


def to_txt(cues: list[dict]) -> str:
    return " ".join(cue["text"] for cue in cues).strip()


def to_csv(cues: list[dict]) -> str:
    rows = ["start,end,text"]
    for cue in cues:
        body = cue["text"].replace('"', '""')
        rows.append(f'{cue["start"]:.3f},{cue["end"]:.3f},"{body}"')
    return "\n".join(rows) + "\n"


RENDERERS = {"srt": to_srt, "vtt": to_vtt, "txt": to_txt, "csv": to_csv}


def render(cues: list[dict], target: str) -> str:
    """Render cues into the requested format. Raises ValueError on unknown target."""
    renderer = RENDERERS.get((target or "").lower())
    if not renderer:
        raise ValueError(f"Unsupported output format: {target}. Use srt, vtt, txt or csv.")
    return renderer(cues)
