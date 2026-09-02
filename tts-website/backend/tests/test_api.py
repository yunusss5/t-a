"""
Endpoint tests driven through FastAPI's TestClient — no server, no network.

The YouTube routes are deliberately not covered: they reach out to youtube.com,
so they belong in a manual check rather than the test suite.
"""

import io

import pytest
from fastapi.testclient import TestClient

from main import app

TRANSCRIPT = (
    "Sourdough bread is the oldest bread there is. A good sourdough loaf needs flour, "
    "water, salt and patience. A sourdough starter is flour and water left to ferment. "
    "Mix fifty grams of flour with fifty grams of water and feed the starter daily. "
    "Bulk fermentation is where most sourdough bread goes wrong: the dough should grow "
    "by half, not double. Shape the loaf and bake it in the hottest oven you have."
)

SRT = """1
00:00:00,000 --> 00:00:06,400
Sourdough bread is the oldest bread there is.

2
00:00:06,400 --> 00:00:14,200
A good sourdough loaf needs flour, water, salt and patience.

3
00:00:14,200 --> 00:00:22,000
A sourdough starter is flour and water left to ferment.

4
00:00:22,000 --> 00:00:31,000
Mix fifty grams of flour with fifty grams of water and feed the starter daily.
"""


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


def upload(name: str, body: str):
    return {"file": (name, io.BytesIO(body.encode("utf-8")), "text/plain")}


def test_health_reports_optional_dependencies(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert "captions_available" in response.json()


def test_seo_from_text(client):
    response = client.post("/api/seo/from-text", data={"text": TRANSCRIPT})
    assert response.status_code == 200

    package = response.json()
    assert package["topic"]
    assert package["titles"]
    assert package["hashtags"]
    assert package["keywords"]["primary"]
    assert 0 <= package["seo"]["score"] <= 100


def test_seo_from_text_rejects_empty_input(client):
    response = client.post("/api/seo/from-text", data={"text": "   "})
    assert response.status_code == 400
    assert "provide some" in response.json()["detail"]


def test_seo_from_text_uses_a_working_title(client):
    response = client.post("/api/seo/from-text",
                           data={"text": TRANSCRIPT, "known_title": "Easy Sourdough Bread"})
    assert response.status_code == 200
    assert response.json()["topic"] == "Easy Sourdough Bread"


def test_seo_from_file_keeps_subtitle_timings(client):
    response = client.post("/api/seo/from-file", files=upload("captions.srt", SRT))
    assert response.status_code == 200

    package = response.json()
    assert package["source_file"] == "captions.srt"
    assert package["chapters"][0]["time"] == "0:00"
    # 0:06 can only come from cue 2 — an estimate would not land there.
    assert {chapter["seconds"] for chapter in package["chapters"]} <= {0, 6, 14, 22}


def test_seo_from_file_accepts_plain_text(client):
    response = client.post("/api/seo/from-file", files=upload("script.txt", TRANSCRIPT))
    assert response.status_code == 200
    assert response.json()["source_file"] == "script.txt"


def test_seo_from_file_rejects_an_unreadable_upload(client):
    response = client.post("/api/seo/from-file", files=upload("empty.txt", "   "))
    assert response.status_code == 400


def test_text_analyze(client):
    response = client.post("/api/text/analyze", data={"text": TRANSCRIPT})
    assert response.status_code == 200

    body = response.json()
    assert body["stats"]["words"] > 50
    assert 0 <= body["readability"]["score"] <= 100
    assert body["keywords"][0]["count"] >= body["keywords"][-1]["count"]


def test_text_summarize_shortens_the_input(client):
    response = client.post("/api/text/summarize", data={"text": TRANSCRIPT, "sentences": 2})
    assert response.status_code == 200

    body = response.json()
    assert body["condensed"]["words"] < body["original"]["words"]
    assert body["reduction_percent"] > 0
    assert len(body["bullets"]) >= 1


@pytest.mark.parametrize("target,marker", [
    ("vtt", "WEBVTT"),
    ("srt", "00:00:00,000 --> "),
    ("csv", "start"),
])
def test_subtitles_convert_between_formats(client, target, marker):
    response = client.post("/api/subtitles/convert",
                           files=upload("captions.srt", SRT), data={"target": target})
    assert response.status_code == 200

    body = response.json()
    assert body["format"] == target
    assert body["cue_count"] == 4
    assert marker in body["output"]


def test_subtitles_convert_shifts_every_cue(client):
    response = client.post("/api/subtitles/convert",
                           files=upload("captions.srt", SRT),
                           data={"target": "srt", "offset": 2.5})
    assert response.status_code == 200

    first = response.json()["preview"][0]
    assert first["start"] == pytest.approx(2.5)
    assert first["end"] == pytest.approx(8.9)


def test_subtitles_convert_builds_cues_from_plain_text(client):
    response = client.post("/api/subtitles/convert",
                           data={"content": TRANSCRIPT, "target": "srt"})
    assert response.status_code == 200

    body = response.json()
    assert body["generated_from_plain_text"] is True
    assert body["cue_count"] > 1
    assert body["duration"] > 0
