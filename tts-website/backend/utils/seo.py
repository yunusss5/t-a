"""
Builds a complete, SEO-friendly content package from any block of text.

Input can come from a pasted script, an uploaded .txt/.srt/.vtt transcript, or a
YouTube video's captions. Output is everything you need to publish:

    titles, meta description, long-form description, hashtags,
    keyword tiers (primary / secondary / long-tail), platform tags,
    timestamped chapters, slug, and a scored SEO checklist.

No external API and no API key — see utils/nlp.py for the algorithms.
"""

from datetime import datetime

from utils import nlp

# Words that measurably lift click-through on titles/thumbnails.
POWER_WORDS = ["Complete", "Ultimate", "Proven", "Simple", "Fast", "Honest",
               "Practical", "Real", "Essential", "Step-by-Step"]

TITLE_TEMPLATES = [
    "{topic}: The Complete Guide ({year})",
    "How to {topic_lower} — Step by Step",
    "{count} {topic} Tips That Actually Work",
    "{topic} Explained Simply (For Beginners)",
    "The Honest Truth About {topic_lower}",
    "Stop Getting {topic_lower} Wrong — Do This Instead",
    "{topic} in {minutes} Minutes: Everything That Matters",
    "Why {topic_lower} Matters More Than You Think",
    "{topic}: What Nobody Tells You ({year})",
    "Master {topic} — A Practical Walkthrough",
]

MAX_TITLE_CHARS = 60          # Google truncates search titles around here
MAX_META_CHARS = 158          # and meta descriptions around here
MAX_TAG_BLOCK_CHARS = 480     # YouTube's tag field caps at 500


def _topic_candidates(text: str) -> list[str]:
    """Best short phrases that describe what the content is about."""
    ranked = nlp.phrases(text, sizes=(2, 3), top=12)
    if len(ranked) < 3:  # short input — accept phrases that only appear once
        ranked = nlp.phrases(text, sizes=(2, 3), top=12, min_count=1)

    raw = [item["phrase"] for item in ranked]

    if len(raw) < 3:
        raw += [k["keyword"] for k in nlp.keyword_scores(text, 6)]

    # When nothing in the text repeats, phrase ranking falls back to "longest
    # n-gram wins", which happily picks a throwaway clause from the last
    # sentence. Re-rank by the keyword weight each phrase carries, and float
    # phrases holding the primary keyword to the top — score_package grades the
    # package on that keyword reaching the title, so the topic has to agree.
    scores = nlp.keyword_scores(text, 200)
    weights = {item["keyword"]: item["count"] for item in scores}
    primary = scores[0]["keyword"] if scores else ""

    def rank(phrase: str) -> tuple[int, float]:
        tokens = nlp.words(phrase, keep_stopwords=False) or [phrase]
        on_topic = 1 if primary in tokens else 0
        return on_topic, sum(weights.get(token, 0) for token in tokens) / len(tokens)

    ranked_by = {phrase: rank(phrase) for phrase in raw}
    raw.sort(key=lambda phrase: (-ranked_by[phrase][0], -ranked_by[phrase][1]))

    out = [nlp.smart_title(phrase) for phrase in raw]

    # De-duplicate while preserving rank order.
    seen, unique = set(), []
    for candidate in out:
        key = candidate.lower()
        if key not in seen:
            seen.add(key)
            unique.append(candidate)

    return unique or ["Your Content"]


def _pick_topic(candidates: list[str], known_title: str | None) -> tuple[str, list[str]]:
    """
    Choose the phrase the content is really about.

    A known title (from YouTube) is the most reliable signal, but a long one
    won't fit a 60-character SEO title once it's dropped into a template. So:
    short titles are used as-is; long ones are mined for the transcript phrase
    they share, which is almost always the true subject.
    """
    if not known_title:
        return candidates[0], candidates

    trimmed = nlp.flatten(known_title)

    if len(trimmed) <= 42:
        return nlp.smart_title(trimmed), candidates

    title_words = set(nlp.words(trimmed, keep_stopwords=False))
    overlapping = [
        candidate for candidate in candidates
        if title_words & set(nlp.words(candidate, keep_stopwords=False))
    ]

    topic = overlapping[0] if overlapping else candidates[0]
    return topic, [nlp.smart_title(trimmed)] + candidates


def _score_title(title: str, topic: str) -> int:
    """Cheap heuristic: length sweet spot + keyword up front + a number/power word."""
    score = 50
    length = len(title)

    if 35 <= length <= MAX_TITLE_CHARS:
        score += 25
    elif length <= 70:
        score += 12

    head = topic.lower().split()
    if head and head[0] in title.lower()[:32]:
        score += 12
    if any(char.isdigit() for char in title):
        score += 7
    if any(word.lower() in title.lower() for word in POWER_WORDS):
        score += 6

    return max(0, min(100, score))


def build_titles(text: str, topic: str, minutes: int) -> list[dict]:
    """Render every template, then rank by the heuristic score."""
    year = datetime.now().year
    count = 7 if len(text.split()) < 900 else 10

    rendered = []
    for template in TITLE_TEMPLATES:
        title = template.format(
            topic=topic,
            topic_lower=topic[:1].lower() + topic[1:],
            year=year,
            count=count,
            minutes=max(2, minutes),
        )
        rendered.append({
            "title": title,
            "length": len(title),
            "score": _score_title(title, topic),
            "truncates": len(title) > MAX_TITLE_CHARS,
        })

    rendered.sort(key=lambda item: item["score"], reverse=True)
    return rendered


def build_meta_description(text: str, topic: str) -> str:
    """
    Search snippet aimed at the 120–158 character window: too short wastes SERP
    space, too long gets an ellipsis from Google. We add summary sentences one at
    a time until we're inside the window, then hard-trim.
    """
    sentences = nlp.summarize(text, max_sentences=4)
    body = ""

    for sentence in sentences:
        candidate = nlp.flatten(f"{body} {sentence}")
        body = candidate
        if len(candidate) >= 120:
            break

    body = body or nlp.flatten(text)
    snippet = body if body.lower().startswith(topic.lower()) else f"{topic}: {body}"

    if len(snippet) <= MAX_META_CHARS:
        return snippet

    trimmed = snippet[:MAX_META_CHARS].rsplit(" ", 1)[0].rstrip(",;:-")
    return f"{trimmed}…"


def build_keywords(text: str) -> dict:
    """Three tiers: primary (head terms), secondary (phrases), long-tail (4-grams)."""
    singles = nlp.keyword_scores(text, top=24)
    two_three = nlp.phrases(text, sizes=(2, 3), top=18)
    # Long-tail phrases almost never repeat, so count them from a single hit.
    long_tail = nlp.phrases(text, sizes=(4, 5), top=10, min_count=1)

    return {
        "primary": [item["keyword"] for item in singles[:6]],
        "secondary": [item["phrase"] for item in two_three[:12]],
        "long_tail": [item["phrase"] for item in long_tail[:8]],
        "density": singles[:12],
    }


def build_hashtags(keywords: dict, limit: int = 22) -> list[str]:
    """CamelCase hashtags from the keyword tiers, most relevant first."""
    seeds = keywords["primary"] + keywords["secondary"] + keywords["long_tail"]

    tags, seen = [], set()
    for seed in seeds:
        parts = [p for p in seed.replace("-", " ").split() if p.isalnum()]
        if not parts or len(parts) > 3:
            continue

        tag = "#" + "".join(part.capitalize() for part in parts)
        if len(tag) > 26 or tag.lower() in seen:
            continue

        seen.add(tag.lower())
        tags.append(tag)

    return tags[:limit]


def build_platform_tags(keywords: dict) -> dict:
    """YouTube-style tag list, trimmed to fit the 500-character field."""
    pool = keywords["primary"] + keywords["secondary"] + keywords["long_tail"]

    picked, used, length = [], set(), 0
    for tag in pool:
        tag = tag.strip().lower()
        if not tag or tag in used:
            continue
        cost = len(tag) + 2
        if length + cost > MAX_TAG_BLOCK_CHARS:
            break
        used.add(tag)
        picked.append(tag)
        length += cost

    return {"tags": picked, "joined": ", ".join(picked), "characters": max(0, length - 2)}


def build_chapters(cues: list[dict] | None, text: str, duration: float | None) -> list[dict]:
    """
    Timestamped chapters. With caption cues we cut on real timings; without them
    we estimate positions from speaking rate so the list is still usable.
    """
    def stamp(seconds: float) -> str:
        seconds = int(max(0, seconds))
        hours, remainder = divmod(seconds, 3600)
        minutes, secs = divmod(remainder, 60)
        return f"{hours}:{minutes:02d}:{secs:02d}" if hours else f"{minutes}:{secs:02d}"

    if cues:
        total = duration or (cues[-1].get("start", 0) + cues[-1].get("duration", 0))
        target = max(6, min(10, int(total // 90) or 6))
        step = max(1, len(cues) // target)

        chapters, used = [], set()
        for index in range(0, len(cues), step):
            chunk = cues[index:index + step]
            body = " ".join(c.get("text", "") for c in chunk)
            chapters.append({"time": stamp(chunk[0].get("start", 0)),
                             "seconds": int(chunk[0].get("start", 0)),
                             "title": _chapter_label(body, len(chapters), used)})
        chapters[0]["time"] = "0:00"  # YouTube requires the first chapter at zero
        chapters[0]["seconds"] = 0
        return chapters[:12]

    picks = nlp.summarize(text, max_sentences=7)
    total_words = max(1, len(nlp.words(text)))
    seconds_total = duration or (total_words / nlp.AVG_SPEAKING_WPM * 60)

    chapters, cursor, used = [], 0.0, set()
    for index, sentence in enumerate(picks):
        chapters.append({"time": stamp(cursor) if index else "0:00",
                         "seconds": int(cursor),
                         "title": _chapter_label(sentence, index, used)})
        cursor += seconds_total / max(1, len(picks))

    return chapters


def _chapter_label(body: str, index: int, used: set[str]) -> str:
    """
    Turn a span of transcript into a short human chapter title, skipping labels
    already used earlier so a long video doesn't get eight identical chapters.
    """
    candidates = [nlp.smart_title(item["phrase"])
                  for item in nlp.phrases(body, sizes=(2, 3), top=6, min_count=1)]
    candidates += [nlp.smart_title(item["keyword"])
                   for item in nlp.keyword_scores(body, top=4)]

    for candidate in candidates:
        key = candidate.lower()
        if key and key not in used:
            used.add(key)
            return candidate

    return "Intro" if index == 0 else f"Part {index + 1}"


def build_long_description(topic: str, summary: list[str], chapters: list[dict],
                           keywords: dict, hashtags: list[str], source_url: str | None) -> str:
    """The full publish-ready description block (YouTube / blog / podcast notes)."""
    hook = summary[0] if summary else f"A practical look at {topic}."

    blocks = [hook.strip(), ""]

    if len(summary) > 1:
        blocks.append("📌 In this video:")
        blocks += [f"• {line.strip()}" for line in summary[1:5]]
        blocks.append("")

    if chapters:
        blocks.append("⏱️ Timestamps:")
        blocks += [f"{c['time']} — {c['title']}" for c in chapters]
        blocks.append("")

    topics = keywords["secondary"][:6] or keywords["primary"][:6]
    if topics:
        blocks.append("🔍 Topics covered: " + ", ".join(topics))
        blocks.append("")

    if source_url:
        blocks.append(f"🔗 Source: {source_url}")
        blocks.append("")

    blocks.append("👍 Found this useful? Like, subscribe and turn on notifications "
                  "so you don't miss the next one.")
    blocks.append("")

    if hashtags:
        blocks.append(" ".join(hashtags[:15]))

    return "\n".join(blocks).strip()


def score_package(package: dict, text: str) -> dict:
    """Publish-readiness checklist. Each passing check contributes to the score."""
    best_title = package["titles"][0]["title"] if package["titles"] else ""
    meta = package["meta_description"]
    word_count = len(nlp.words(text))
    read = package["readability"]

    checks = [
        ("Title length is search-friendly (35–60 chars)",
         35 <= len(best_title) <= MAX_TITLE_CHARS, 15),
        ("Meta description fills the snippet (120–158 chars)",
         120 <= len(meta) <= MAX_META_CHARS, 15),
        ("Primary keyword appears in the title",
         bool(package["keywords"]["primary"]) and
         package["keywords"]["primary"][0].lower() in best_title.lower(), 15),
        ("Enough content depth (300+ words)", word_count >= 300, 15),
        ("At least 5 timestamped chapters", len(package["chapters"]) >= 5, 10),
        ("10+ hashtags ready to paste", len(package["hashtags"]) >= 10, 10),
        ("Long-tail keywords found", len(package["keywords"]["long_tail"]) >= 3, 10),
        ("Reads at plain-English level or easier", read.get("score", 0) >= 45, 10),
    ]

    earned = sum(weight for _, passed, weight in checks if passed)

    return {
        "score": earned,
        "checks": [{"label": label, "passed": passed, "weight": weight}
                   for label, passed, weight in checks],
    }


def build_package(text: str, cues: list[dict] | None = None,
                  duration: float | None = None, source_url: str | None = None,
                  known_title: str | None = None) -> dict:
    """Assemble the whole SEO package. This is what the API returns."""
    text = nlp.normalise(text)
    if not text:
        raise ValueError("No readable text to analyse.")

    stats = nlp.timings(text)
    minutes = max(1, round((duration or stats["speaking_seconds"]) / 60))

    candidates = _topic_candidates(text)
    topic, candidates = _pick_topic(candidates, known_title)

    keywords = build_keywords(text)
    hashtags = build_hashtags(keywords)
    summary = nlp.summarize(text, max_sentences=6)
    chapters = build_chapters(cues, text, duration)

    package = {
        "topic": topic,
        "topic_alternatives": candidates[:6],
        "titles": build_titles(text, topic, minutes),
        "meta_description": build_meta_description(text, topic),
        "description": build_long_description(topic, summary, chapters, keywords,
                                              hashtags, source_url),
        "hashtags": hashtags,
        "keywords": keywords,
        "platform_tags": build_platform_tags(keywords),
        "chapters": chapters,
        "summary": summary,
        "slug": nlp.slugify(topic),
        "stats": stats,
        "readability": nlp.readability(text),
        "source_url": source_url,
    }

    package["seo"] = score_package(package, text)
    return package
