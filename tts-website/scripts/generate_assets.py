"""Generate the static social/app images that ship in the frontend's public/ dir.

Run from the repo root:

    python scripts/generate_assets.py

Outputs (committed, so a deploy needs no Python):
    frontend/frontendpp/public/og-cover.png        1200x630 Open Graph card
    frontend/frontendpp/public/apple-touch-icon.png  180x180 iOS home-screen icon

The gradients are built at low resolution and scaled up with bicubic
interpolation rather than evaluated per pixel — visually identical for a smooth
ramp and roughly two orders of magnitude faster.
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "frontend" / "frontendpp" / "public"

INK = (13, 12, 18)
WHITE = (255, 255, 255)
VIOLET = (109, 77, 242)
LILAC = (168, 121, 247)
MUTED = (166, 162, 186)

# Generation-time only: these never ship, they are rasterised into the PNGs.
FONT_CANDIDATES = [
    ("C:/Windows/Fonts/segoeuib.ttf", "C:/Windows/Fonts/segoeui.ttf"),
    ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
     "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    ("/System/Library/Fonts/Helvetica.ttc", "/System/Library/Fonts/Helvetica.ttc"),
]


def load_fonts() -> tuple[str, str]:
    for bold, regular in FONT_CANDIDATES:
        if Path(bold).exists() and Path(regular).exists():
            return bold, regular
    raise SystemExit("No usable system font found; add one to FONT_CANDIDATES.")


def radial(size: tuple[int, int], centre: tuple[float, float], radius: float,
           colour: tuple[int, int, int]) -> Image.Image:
    """A soft coloured bloom on transparent, built small and scaled up."""
    small = (max(2, size[0] // 8), max(2, size[1] // 8))
    layer = Image.new("RGBA", small, (*colour, 0))
    pixels = layer.load()
    cx, cy = centre[0] / 8, centre[1] / 8
    r = radius / 8

    for y in range(small[1]):
        for x in range(small[0]):
            distance = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
            if distance >= r:
                continue
            falloff = (1 - distance / r) ** 2
            pixels[x, y] = (*colour, int(255 * falloff))

    return layer.resize(size, Image.BICUBIC).filter(ImageFilter.GaussianBlur(6))


def brand_mark(size: int, full_bleed: bool = False) -> Image.Image:
    """The rounded-square logo: violet gradient, white speaker, two arcs.

    `full_bleed` skips the rounded corners, for the iOS touch icon — iOS applies
    its own mask, and pre-rounding it leaves dark slivers outside Apple's radius.
    """
    scale = 4
    box = size * scale
    tile = Image.new("RGBA", (box, box), (0, 0, 0, 0))

    # Diagonal violet → lilac, matching favicon.svg's 0,0 → 1,1 gradient. The
    # off-diagonal corners get the midpoint so bicubic reads it as one diagonal
    # ramp rather than two crossing ones.
    mid = tuple((a + b) // 2 for a, b in zip(VIOLET, LILAC))
    ramp = Image.new("RGB", (2, 2))
    ramp.putpixel((0, 0), VIOLET)
    ramp.putpixel((1, 0), mid)
    ramp.putpixel((0, 1), mid)
    ramp.putpixel((1, 1), LILAC)
    fill = ramp.resize((box, box), Image.BICUBIC)

    if full_bleed:
        tile.paste(fill, (0, 0))
    else:
        mask = Image.new("L", (box, box), 0)
        ImageDraw.Draw(mask).rounded_rectangle(
            (0, 0, box - 1, box - 1), radius=int(box * 0.26), fill=255
        )
        tile.paste(fill, (0, 0), mask)

    draw = ImageDraw.Draw(tile)
    u = box / 32  # the favicon.svg viewBox unit, so both marks stay identical

    draw.polygon(
        [(15 * u, 8.5 * u), (10 * u, 12.5 * u), (6.5 * u, 12.5 * u),
         (6.5 * u, 19.5 * u), (10 * u, 19.5 * u), (15 * u, 23.5 * u)],
        fill=WHITE,
    )
    for bbox, width in (((16 * u, 10.4 * u, 22 * u, 21.6 * u), 1.9 * u),
                        ((17 * u, 7.2 * u, 27.4 * u, 24.8 * u), 1.9 * u)):
        draw.arc(bbox, start=-58, end=58, fill=WHITE, width=int(width))

    return tile.resize((size, size), Image.LANCZOS)


def make_og(bold: str, regular: str) -> Path:
    width, height = 1200, 630
    card = Image.new("RGB", (width, height), INK)

    card.paste(radial((width, height), (170, 90), 720, VIOLET),
               (0, 0), radial((width, height), (170, 90), 720, VIOLET))
    bloom = radial((width, height), (1080, 620), 560, (58, 44, 122))
    card.paste(bloom, (0, 0), bloom)

    draw = ImageDraw.Draw(card)

    # Hairline frame: stops the card dissolving into a dark timeline background.
    draw.rounded_rectangle((18, 18, width - 19, height - 19), radius=28,
                           outline=(58, 54, 78), width=2)

    mark = brand_mark(96)
    card.paste(mark, (88, 92), mark)

    title = ImageFont.truetype(bold, 76)
    sub = ImageFont.truetype(regular, 34)
    foot = ImageFont.truetype(regular, 25)

    draw.text((204, 108), "VoiceForge", font=title, fill=WHITE)
    draw.text((206, 196), "Creator Toolkit", font=sub, fill=LILAC)

    draw.text(
        (88, 320),
        "Transcript or YouTube link →\ntitles, description, hashtags, keywords.",
        font=ImageFont.truetype(bold, 48), fill=WHITE, spacing=14,
    )

    draw.text(
        (88, 486),
        "22 free tools · text to speech · subtitles · audio · images · no sign-up",
        font=foot, fill=MUTED,
    )

    out = PUBLIC / "og-cover.png"
    card.save(out, "PNG", optimize=True)
    return out


def make_touch_icon() -> Path:
    icon = Image.new("RGB", (180, 180), INK)
    mark = brand_mark(180, full_bleed=True)
    icon.paste(mark, (0, 0), mark)
    out = PUBLIC / "apple-touch-icon.png"
    icon.save(out, "PNG", optimize=True)
    return out


def main() -> int:
    PUBLIC.mkdir(parents=True, exist_ok=True)
    bold, regular = load_fonts()
    for path in (make_og(bold, regular), make_touch_icon()):
        print(f"wrote {path.relative_to(ROOT)} ({path.stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
