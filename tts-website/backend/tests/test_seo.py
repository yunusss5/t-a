"""
Unit tests for the SEO package builder.

Everything here runs offline — no YouTube, no network. The point is the shape of
the package and the two behaviours that are easy to regress: the topic has to be
built around the primary keyword, and real subtitle timings have to survive into
the chapter list.
"""

import pytest

from utils import seo

# Two repeated head terms ("kubernetes", "pods") but no repeated *phrase*, so
# phrase ranking falls back to a tie and the topic re-rank is what decides.
NO_REPEATS = (
    "Kubernetes autoscaling is the feature that lets a cluster add and remove pods "
    "automatically. In this walkthrough we configure the Horizontal Pod Autoscaler on a "
    "small Node.js API, watch CPU metrics drive replica counts, and then compare that "
    "with the Cluster Autoscaler which adds worker nodes when pods stay pending. We "
    "finish by tuning the stabilization window so the deployment stops flapping under "
    "bursty traffic. If you run production workloads on Kubernetes this is the single "
    "cheapest reliability win available to you."
)

REPEATED = (
    "Sourdough bread is the oldest bread there is. A good sourdough loaf needs flour, "
    "water, salt and patience. A sourdough starter is flour and water left to ferment. "
    "Mix fifty grams of flour with fifty grams of water and feed the starter daily. "
    "Bulk fermentation is where most sourdough bread goes wrong: the dough should grow "
    "by half, not double. Shape the loaf and bake it in the hottest oven you have."
)

CUES = [
    {"text": "Sourdough bread is the oldest bread there is.", "start": 0.0, "duration": 6.4},
    {"text": "A good sourdough loaf needs flour, water, salt and patience.", "start": 6.4, "duration": 7.8},
    {"text": "A sourdough starter is flour and water left to ferment.", "start": 14.2, "duration": 7.8},
    {"text": "Mix fifty grams of flour with fifty grams of water.", "start": 22.0, "duration": 9.5},
    {"text": "Feed the starter daily and it will double in four hours.", "start": 31.5, "duration": 8.5},
    {"text": "Bulk fermentation is where most sourdough bread goes wrong.", "start": 40.0, "duration": 9.0},
    {"text": "Shape the loaf and bake it in the hottest oven you have.", "start": 49.0, "duration": 9.0},
]


@pytest.fixture(scope="module")
def package():
    return seo.build_package(REPEATED)


def test_package_has_every_advertised_section(package):
    for key in ("topic", "titles", "meta_description", "description", "hashtags",
                "keywords", "platform_tags", "chapters", "summary", "slug",
                "stats", "readability", "seo"):
        assert key in package, f"missing {key}"


def test_titles_fit_the_search_snippet(package):
    assert package["titles"]
    for entry in package["titles"]:
        assert entry["length"] == len(entry["title"])
        assert entry["truncates"] == (entry["length"] > seo.MAX_TITLE_CHARS)


def test_meta_description_respects_the_snippet_limit(package):
    assert 0 < len(package["meta_description"]) <= seo.MAX_META_CHARS


def test_keyword_tiers_are_populated(package):
    keywords = package["keywords"]
    assert keywords["primary"], "no head terms found"
    assert keywords["long_tail"], "no long-tail phrases found"
    assert all(item["density"] > 0 for item in keywords["density"])


def test_hashtags_are_hashtags(package):
    assert package["hashtags"]
    assert all(tag.startswith("#") and " " not in tag for tag in package["hashtags"])


def test_slug_is_url_safe(package):
    assert package["slug"]
    assert package["slug"] == package["slug"].lower()
    assert all(char.isalnum() or char == "-" for char in package["slug"])


@pytest.mark.parametrize("text", [REPEATED, NO_REPEATS])
def test_topic_is_built_around_the_primary_keyword(text):
    """
    The graded checklist rewards the primary keyword reaching the title, so the
    topic has to agree with it. Without the re-rank in _topic_candidates a text
    with no repeated phrase picks the longest n-gram instead — for NO_REPEATS
    that was "single cheapest reliability", a throwaway clause.
    """
    package = seo.build_package(text)
    primary = package["keywords"]["primary"][0]
    assert primary in package["topic"].lower()
    assert primary in package["titles"][0]["title"].lower()


def test_known_title_wins_when_it_is_short_enough():
    package = seo.build_package(REPEATED, known_title="Easy Sourdough Bread")
    assert package["topic"] == "Easy Sourdough Bread"


def test_long_known_title_is_mined_for_the_shared_phrase():
    long_title = ("How To Make Sourdough Bread At Home Without A Stand Mixer "
                  "Or Any Fancy Equipment At All")
    package = seo.build_package(REPEATED, known_title=long_title)
    assert len(package["topic"]) <= seo.MAX_TITLE_CHARS
    assert "sourdough" in package["topic"].lower()


def test_chapters_use_real_cue_timings():
    package = seo.build_package(REPEATED, cues=CUES, duration=58.0)
    seconds = [chapter["seconds"] for chapter in package["chapters"]]

    assert package["chapters"][0]["time"] == "0:00"
    assert seconds == sorted(seconds)
    # Floored, not rounded — a chapter must never start after its own cue.
    assert set(seconds) <= {int(cue["start"]) for cue in CUES}
    assert all(chapter["title"] for chapter in package["chapters"])


def test_chapters_are_estimated_without_cues(package):
    """No timings supplied — chapters still appear, still start at zero."""
    assert package["chapters"]
    assert package["chapters"][0]["seconds"] == 0


def test_score_is_a_percentage_of_the_checklist(package):
    grade = package["seo"]
    assert 0 <= grade["score"] <= 100
    assert grade["score"] == sum(c["weight"] for c in grade["checks"] if c["passed"])


def test_empty_text_is_rejected():
    with pytest.raises(ValueError):
        seo.build_package("   ")
