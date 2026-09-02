"""
Dependency-free text intelligence used by the SEO / summary / analyzer tools.

Everything here is pure Python + regex on purpose: the app is meant to run on a
free tier with no API keys, so we avoid heavyweight NLP wheels (spaCy, nltk) and
any paid LLM call. The algorithms are classic and well understood:

  * keyword scoring        -> normalised term frequency, stopword filtered
  * phrase extraction      -> n-gram counting with stopword-boundary trimming
  * summarisation          -> word-frequency sentence ranking + position bias
  * readability            -> Flesch Reading Ease / Flesch-Kincaid grade
"""

import math
import re
from collections import Counter

# Kept inline (rather than a data file) so the module stays importable anywhere.
STOPWORDS = set("""
a about above after again against all am an and any are aren't as at be because
been before being below between both but by can can't cannot could couldn't did
didn't do does doesn't doing don't down during each few for from further had
hadn't has hasn't have haven't having he he'd he'll he's her here here's hers
herself him himself his how how's i i'd i'll i'm i've if in into is isn't it
it's its itself let's me more most mustn't my myself no nor not of off on once
only or other ought our ours ourselves out over own same shan't she she'd she'll
she's should shouldn't so some such than that that's the their theirs them
themselves then there there's these they they'd they'll they're they've this
those through to too under until up very was wasn't we we'd we'll we're we've
were weren't what what's when when's where where's which while who who's whom
why why's with won't would wouldn't you you'd you'll you're you've your yours
yourself yourselves will just also get got going gonna wanna really actually
basically literally okay ok yeah yes right now thing things lot lots kind sort
maybe something someone anything everything guys hey hi hello welcome back today
talking talk talked saying said says channel subscribe like comment share
one two three four five six seven eight nine ten first second third next last
another every much many bit way ways part parts
""".split())

# Filler words a spoken transcript is full of; stripped before SEO analysis.
FILLERS = {"um", "uh", "erm", "hmm", "ah", "eh", "mm", "mhm", "huh", "y'know"}

_SENT_SPLIT = re.compile(r"(?<=[.!?])\s+(?=[\"'“(\[]?[A-Z0-9])")
_WORD = re.compile(r"[A-Za-z][A-Za-z'\-]+|\d+(?:\.\d+)?")
_VOWEL_RUN = re.compile(r"[aeiouy]+")

AVG_READING_WPM = 225.0
AVG_SPEAKING_WPM = 150.0


def normalise(text: str) -> str:
    """Collapse whitespace so downstream regexes behave predictably."""
    return re.sub(r"[ \t ]+", " ", (text or "").replace("\r\n", "\n")).strip()


def flatten(text: str) -> str:
    """Collapse *all* whitespace, including newlines — for titles and snippets."""
    return re.sub(r"\s+", " ", (text or "")).strip()


def sentences(text: str) -> list[str]:
    """Split into sentences, falling back to line breaks for transcripts that
    have no punctuation at all (auto-generated captions often don't)."""
    text = normalise(text)
    if not text:
        return []

    parts = [flatten(s) for s in _SENT_SPLIT.split(text) if s.strip()]

    # Auto-captions: one giant unpunctuated blob. Chunk it into readable spans
    # so summarisation and chapter detection still have something to work with.
    if len(parts) <= 1 and len(text.split()) > 60:
        tokens = text.split()
        parts = [" ".join(tokens[i:i + 22]) for i in range(0, len(tokens), 22)]

    return parts


def words(text: str, keep_stopwords: bool = True) -> list[str]:
    """Lowercased word tokens. Set keep_stopwords=False for keyword work."""
    found = [w.lower().strip("'-") for w in _WORD.findall(text or "")]
    found = [w for w in found if len(w) > 1 and w not in FILLERS]
    if keep_stopwords:
        return found
    return [w for w in found if w not in STOPWORDS and not w.isdigit()]


def syllables(word: str) -> int:
    """Approximate syllable count — good enough for readability scoring."""
    word = word.lower().strip("'-")
    if not word:
        return 0
    count = len(_VOWEL_RUN.findall(word))
    if word.endswith("e") and not word.endswith(("le", "ee", "ye")) and count > 1:
        count -= 1
    return max(1, count)


def readability(text: str) -> dict:
    """Flesch Reading Ease + Flesch-Kincaid grade level, with a plain label."""
    sents = sentences(text)
    toks = words(text)
    if not sents or not toks:
        return {"score": 0.0, "grade": 0.0, "label": "Not enough text", "level": "unknown"}

    words_per_sentence = len(toks) / len(sents)
    syllables_per_word = sum(syllables(w) for w in toks) / len(toks)

    score = 206.835 - (1.015 * words_per_sentence) - (84.6 * syllables_per_word)
    grade = (0.39 * words_per_sentence) + (11.8 * syllables_per_word) - 15.59

    score = round(max(0.0, min(100.0, score)), 1)

    if score >= 80:
        label, level = "Very easy — great for wide audiences", "easy"
    elif score >= 60:
        label, level = "Plain English — ideal for most content", "good"
    elif score >= 45:
        label, level = "Fairly difficult — tighten long sentences", "ok"
    else:
        label, level = "Hard to read — shorten sentences and words", "hard"

    return {
        "score": score,
        "grade": round(max(0.0, grade), 1),
        "label": label,
        "level": level,
        "words_per_sentence": round(words_per_sentence, 1),
        "syllables_per_word": round(syllables_per_word, 2),
    }


def keyword_scores(text: str, top: int = 20) -> list[dict]:
    """Single-word keywords ranked by frequency, with density percentages."""
    content = words(text, keep_stopwords=False)
    if not content:
        return []

    total = len(content)
    counted = Counter(content)

    return [
        {
            "keyword": word,
            "count": count,
            "density": round(count / total * 100, 2),
        }
        for word, count in counted.most_common(top)
    ]


def phrases(text: str, sizes: tuple[int, ...] = (2, 3), top: int = 15,
            min_count: int = 2) -> list[dict]:
    """
    Multi-word key phrases. We slide an n-gram window over the token stream but
    reject any window that starts or ends on a stopword — that cheap trick keeps
    "video editing workflow" and drops "of the video".

    min_count=1 is useful for long-tail phrases, which rarely repeat.
    """
    # N-grams are counted per sentence so a phrase can never straddle a full
    # stop ("...for beginners. Good video..." must not become one phrase).
    spans = [words(sentence) for sentence in sentences(text)] or [words(text)]
    if not any(spans):
        return []

    counted: Counter = Counter()

    for tokens in spans:
        for size in sizes:
            for i in range(len(tokens) - size + 1):
                window = tokens[i:i + size]
                if window[0] in STOPWORDS or window[-1] in STOPWORDS:
                    continue
                if any(w.isdigit() for w in window):
                    continue
                counted[" ".join(window)] += 1

    # Longer phrases are more descriptive, so weight them slightly higher.
    ranked = sorted(
        counted.items(),
        key=lambda kv: (kv[1] * (1 + 0.35 * (len(kv[0].split()) - 1)), len(kv[0])),
        reverse=True,
    )

    return [
        {"phrase": phrase, "count": count}
        for phrase, count in ranked
        if count >= min_count or len(ranked) < 6
    ][:top]


def summarize(text: str, max_sentences: int = 5) -> list[str]:
    """
    Extractive summary. Each sentence is scored by the mean frequency-weight of
    its content words, boosted for appearing early (openings usually state the
    topic) and penalised for being very short or very long.
    """
    sents = sentences(text)
    if len(sents) <= max_sentences:
        return sents

    content = words(text, keep_stopwords=False)
    if not content:
        return sents[:max_sentences]

    freq = Counter(content)
    peak = max(freq.values())
    weights = {word: count / peak for word, count in freq.items()}

    scored = []
    for index, sentence in enumerate(sents):
        sentence_words = words(sentence, keep_stopwords=False)
        if not sentence_words:
            continue

        score = sum(weights.get(w, 0.0) for w in sentence_words) / len(sentence_words)
        score *= 1.0 + (0.25 * math.exp(-index / 6.0))  # front-loading bonus

        length = len(sentence.split())
        if length < 6:
            score *= 0.55
        elif length > 45:
            score *= 0.8

        scored.append((score, index, sentence))

    scored.sort(reverse=True)
    picked = sorted(scored[:max_sentences], key=lambda item: item[1])
    return [sentence for _, _, sentence in picked]


def timings(text: str) -> dict:
    """Word/character counts plus reading and speaking time estimates."""
    toks = words(text)
    count = len(toks)
    clean = normalise(text)

    return {
        "words": count,
        "characters": len(clean),
        "characters_no_spaces": len(clean.replace(" ", "").replace("\n", "")),
        "sentences": len(sentences(text)),
        "paragraphs": len([p for p in (clean.split("\n\n") if clean else []) if p.strip()]),
        "reading_seconds": round(count / AVG_READING_WPM * 60),
        "speaking_seconds": round(count / AVG_SPEAKING_WPM * 60),
    }


def slugify(value: str, max_length: int = 60) -> str:
    """URL-safe slug for permalinks and download filenames."""
    slug = re.sub(r"[^a-z0-9]+", "-", (value or "").lower()).strip("-")
    if len(slug) <= max_length:
        return slug
    return slug[:max_length].rsplit("-", 1)[0]


def smart_title(value: str) -> str:
    """Title Case that leaves small joining words lowercase (unless first/last)."""
    minor = {"a", "an", "and", "as", "at", "but", "by", "for", "in", "nor", "of",
             "on", "or", "so", "the", "to", "up", "vs", "via", "with", "from"}
    parts = (value or "").split()

    out = []
    for i, part in enumerate(parts):
        lower = part.lower()
        if i not in (0, len(parts) - 1) and lower in minor:
            out.append(lower)
        elif part.isupper() and len(part) <= 4:
            out.append(part)  # keep acronyms like SEO, API, AI
        else:
            out.append(lower[:1].upper() + lower[1:])

    return " ".join(out)
