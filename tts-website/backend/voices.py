"""
Run this once (and re-run occasionally) to refresh voices.json with the
full list of voices edge-tts currently has access to.

Usage:
    python voices.py
"""

import asyncio
import json
import os
import edge_tts

OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "voices.json")

# Only keep languages relevant to most users by default.
# Add/remove locale prefixes here to control what shows up in your dropdown.
LOCALE_FILTER = [
    "en-",  # English (all regions)
    "hi-IN",  # Hindi
    "es-",  # Spanish
    "fr-",  # French
    "de-",  # German
    "ar-",  # Arabic
    "ta-IN",  # Tamil
    "te-IN",  # Telugu
    "bn-",  # Bengali
    "pt-",  # Portuguese
    "ja-JP",  # Japanese
    "zh-CN",  # Chinese (Mandarin)
]


async def fetch_voices():
    all_voices = await edge_tts.list_voices()

    filtered = [
        {
            "name": v["ShortName"],
            "gender": v["Gender"],
            "locale": v["Locale"],
            "friendly_name": v.get("FriendlyName", v["ShortName"]),
        }
        for v in all_voices
        if any(v["Locale"].startswith(prefix) for prefix in LOCALE_FILTER)
    ]

    filtered.sort(key=lambda v: (v["locale"], v["gender"]))

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(filtered, f, indent=2, ensure_ascii=False)

    print(f"Saved {len(filtered)} voices to {OUTPUT_PATH}")


if __name__ == "__main__":
    asyncio.run(fetch_voices())
