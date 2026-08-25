"""
Utility functions to read uploaded transcript files and turn them into
clean plain text that's ready to be sent to the TTS engine.

Supports:
  - .txt  (plain text, used as-is)
  - .srt  (SubRip subtitles — timestamps & sequence numbers stripped)
  - .vtt  (WebVTT subtitles — timestamps & headers stripped)
"""

import re


def parse_txt(raw_bytes: bytes) -> str:
    """Plain text file — just decode it."""
    return raw_bytes.decode("utf-8", errors="ignore").strip()


def parse_srt(raw_bytes: bytes) -> str:
    """
    Strip SRT structure:
      1
      00:00:01,000 --> 00:00:04,000
      Hello, how are you?

    -> "Hello, how are you?"
    """
    text = raw_bytes.decode("utf-8", errors="ignore")
    lines = text.splitlines()
    cleaned_lines = []

    timestamp_pattern = re.compile(r"\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,.]\d{3}")
    index_pattern = re.compile(r"^\d+$")

    for line in lines:
        line = line.strip()
        if not line:
            continue
        if index_pattern.match(line):
            continue
        if timestamp_pattern.search(line):
            continue
        cleaned_lines.append(line)

    return " ".join(cleaned_lines).strip()


def parse_vtt(raw_bytes: bytes) -> str:
    """
    Strip WebVTT structure (similar to SRT but with a WEBVTT header
    and slightly different timestamp format, e.g. 00:00:01.000).
    """
    text = raw_bytes.decode("utf-8", errors="ignore")
    lines = text.splitlines()
    cleaned_lines = []

    timestamp_pattern = re.compile(r"\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[.,]\d{3}")

    for line in lines:
        line = line.strip()
        if not line:
            continue
        if line.upper().startswith("WEBVTT"):
            continue
        if line.upper().startswith("NOTE"):
            continue
        if timestamp_pattern.search(line):
            continue
        # skip pure cue-number lines
        if line.isdigit():
            continue
        cleaned_lines.append(line)

    return " ".join(cleaned_lines).strip()


def parse_transcript_file(filename: str, raw_bytes: bytes) -> str:
    """
    Dispatch to the right parser based on file extension.
    Raises ValueError for unsupported types.
    """
    lower = filename.lower()
    if lower.endswith(".srt"):
        return parse_srt(raw_bytes)
    elif lower.endswith(".vtt"):
        return parse_vtt(raw_bytes)
    elif lower.endswith(".txt"):
        return parse_txt(raw_bytes)
    else:
        raise ValueError(f"Unsupported file type: {filename}. Use .txt, .srt, or .vtt")
