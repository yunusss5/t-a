"""
The cross-cutting behaviour: headers, size caps, rate limits, caching, the error
envelope, and the validation that keeps user input out of places it should not
reach.

Nothing here touches the network. The one route that would (speech synthesis)
gets a fake engine, because what is under test is the wiring around it.
"""

import dataclasses
import io

import pytest
from fastapi.testclient import TestClient

import main
import uploads
from config import settings
from main import app
from ratelimit import SlidingWindowLimiter
import ratelimit

TRANSCRIPT = (
    "Sourdough bread is the oldest bread there is. A good loaf needs flour, water, "
    "salt and patience. A starter is flour and water left to ferment. Mix fifty "
    "grams of flour with fifty grams of water and feed it daily. Bulk fermentation "
    "is where most loaves go wrong: the dough should grow by half, not double."
)


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def voice_name():
    return main._voices()[0][0]["name"]


@pytest.fixture
def fake_tts(monkeypatch, tmp_path):
    """Replace the engine with something that writes a file and records the call."""
    calls: dict = {}

    async def fake_generate(text, voice, rate, pitch):
        calls.update(text=text, voice=voice, rate=rate, pitch=pitch)
        path = tmp_path / "speech.mp3"
        path.write_bytes(b"ID3" + b"\x00" * 64)
        return str(path)

    monkeypatch.setattr(main, "generate_audio", fake_generate)
    return calls


# --- headers, logging, compression ------------------------------------------

def test_every_response_carries_the_security_headers(client):
    response = client.get("/health")

    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "no-referrer"
    assert "default-src 'none'" in response.headers["content-security-policy"]
    assert "camera=()" in response.headers["permissions-policy"]


def test_hsts_is_only_set_for_https(client):
    plain = client.get("/health")
    assert "strict-transport-security" not in plain.headers

    forwarded = client.get("/health", headers={"x-forwarded-proto": "https"})
    assert "max-age=31536000" in forwarded.headers["strict-transport-security"]


def test_request_id_is_echoed_back(client):
    assert client.get("/health").headers["x-request-id"]

    mine = client.get("/health", headers={"x-request-id": "abc123"})
    assert mine.headers["x-request-id"] == "abc123"


def test_large_json_is_compressed(client):
    response = client.post("/api/seo/from-text", data={"text": TRANSCRIPT})

    assert response.headers["content-encoding"] == "gzip"
    assert "accept-encoding" in response.headers["vary"].lower()
    assert response.json()["topic"]  # decoded fine


def test_small_json_is_not_compressed(client):
    response = client.get("/")

    assert "content-encoding" not in response.headers
    assert response.json()["status"] == "ok"


def test_audio_is_not_compressed(client, voice_name, fake_tts):
    response = client.post(
        "/generate", data={"text": "Hello there.", "voice": voice_name}
    )

    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/mpeg"
    assert "content-encoding" not in response.headers


# --- size caps --------------------------------------------------------------

def test_an_oversized_request_is_refused_before_the_route_runs(client):
    response = client.post(
        "/api/text/analyze",
        content=b"a" * (settings.max_request_bytes + 1024),
        headers={"content-type": "text/plain"},
    )

    assert response.status_code == 413
    assert "too large" in response.json()["detail"]


def test_an_oversized_upload_is_refused_rather_than_truncated(client, monkeypatch):
    # The cap is lowered instead of uploading eight megabytes: the branch under
    # test is the chunked read giving up, not the size of the number.
    monkeypatch.setattr(
        uploads, "settings", dataclasses.replace(settings, max_upload_bytes=64)
    )

    response = client.post(
        "/api/seo/from-file",
        files={"file": ("long.txt", io.BytesIO(TRANSCRIPT.encode()), "text/plain")},
    )

    assert response.status_code == 413
    assert "larger than" in response.json()["detail"]


def test_an_empty_upload_is_a_400(client):
    response = client.post(
        "/api/seo/from-file",
        files={"file": ("empty.txt", io.BytesIO(b""), "text/plain")},
    )

    assert response.status_code == 400
    assert "empty" in response.json()["detail"]


@pytest.mark.parametrize("filename", ["notes.pdf", "archive.zip", "script"])
def test_unsupported_upload_types_are_rejected(client, filename):
    response = client.post(
        "/api/seo/from-file",
        files={"file": (filename, io.BytesIO(b"hello there"), "application/octet-stream")},
    )

    assert response.status_code == 400
    assert "Unsupported file type" in response.json()["detail"]


def test_a_filename_cannot_carry_a_path_into_the_response(client):
    response = client.post(
        "/api/seo/from-file",
        files={"file": ("../../etc/passwd.txt", io.BytesIO(TRANSCRIPT.encode()), "text/plain")},
    )

    assert response.status_code == 200
    assert response.json()["source_file"] == "passwd.txt"


# --- rate limiting ----------------------------------------------------------

def test_a_bucket_returns_429_with_a_retry_after(client, monkeypatch):
    monkeypatch.setitem(ratelimit._limiters, "default", SlidingWindowLimiter(2, 60))

    assert client.post("/api/text/analyze", data={"text": TRANSCRIPT}).status_code == 200
    assert client.post("/api/text/analyze", data={"text": TRANSCRIPT}).status_code == 200

    blocked = client.post("/api/text/analyze", data={"text": TRANSCRIPT})
    assert blocked.status_code == 429
    assert int(blocked.headers["retry-after"]) >= 1
    assert "Try again" in blocked.json()["detail"]


def test_buckets_do_not_share_a_budget(client, monkeypatch):
    monkeypatch.setitem(ratelimit._limiters, "default", SlidingWindowLimiter(1, 60))
    monkeypatch.setitem(ratelimit._limiters, "heavy", SlidingWindowLimiter(1, 60))

    assert client.post("/api/text/analyze", data={"text": TRANSCRIPT}).status_code == 200
    assert client.post("/api/text/analyze", data={"text": TRANSCRIPT}).status_code == 429

    # The heavy bucket still has its own untouched budget.
    spent = client.post(
        "/api/seo/from-file",
        files={"file": ("script.txt", io.BytesIO(TRANSCRIPT.encode()), "text/plain")},
    )
    assert spent.status_code == 200


def test_the_limiter_forgets_hits_once_the_window_passes():
    limiter = SlidingWindowLimiter(2, 60)

    assert limiter.hit("ip") == (True, 0)
    assert limiter.hit("ip") == (True, 0)

    allowed, retry_after = limiter.hit("ip")
    assert allowed is False
    assert 1 <= retry_after <= 61

    limiter.reset()
    assert limiter.hit("ip") == (True, 0)


def test_the_limiter_key_space_stays_bounded():
    limiter = SlidingWindowLimiter(5, 60)

    for index in range(ratelimit.MAX_TRACKED_CLIENTS + 200):
        limiter.hit(f"ip-{index}")

    assert len(limiter._hits) <= ratelimit.MAX_TRACKED_CLIENTS


# --- voices: caching and validation -----------------------------------------

def test_voices_are_cacheable_and_revalidate(client):
    first = client.get("/voices")

    assert first.status_code == 200
    assert isinstance(first.json(), list) and first.json()[0]["name"]
    assert first.headers["cache-control"] == "public, max-age=3600"

    etag = first.headers["etag"]
    again = client.get("/voices", headers={"if-none-match": etag})
    assert again.status_code == 304


@pytest.mark.parametrize("voice", ["not-a-voice", "en-US-AriaNeural-evil"])
def test_generate_rejects_a_voice_we_never_published(client, voice, fake_tts):
    response = client.post("/generate", data={"text": "Hello there.", "voice": voice})

    assert response.status_code == 400
    assert "voice" in response.json()["detail"]
    assert not fake_tts  # the engine was never reached


def test_generate_needs_a_voice_at_all(client, fake_tts):
    # An empty form field never reaches the route: FastAPI treats it as missing,
    # and the error handler turns that into the same one-sentence envelope.
    response = client.post("/generate", data={"text": "Hello there.", "voice": ""})

    assert response.status_code == 422
    assert response.json()["detail"].startswith("voice:")
    assert not fake_tts


@pytest.mark.parametrize("field,value", [
    ("rate", '+0%"><speak>'),
    ("rate", "fast"),
    ("rate", "+1000%"),
    ("pitch", "+5"),
    ("pitch", "-10Hz;"),
])
def test_generate_rejects_prosody_that_is_not_a_number_and_a_unit(
    client, voice_name, fake_tts, field, value
):
    payload = {"text": "Hello there.", "voice": voice_name, field: value}
    response = client.post("/generate", data=payload)

    assert response.status_code == 400
    assert not fake_tts


def test_generate_rejects_empty_text(client, voice_name, fake_tts):
    response = client.post("/generate", data={"text": "   ", "voice": voice_name})

    assert response.status_code == 400
    assert not fake_tts


def test_generate_caps_the_length_of_one_recording(client, voice_name, monkeypatch, fake_tts):
    monkeypatch.setattr(main, "settings", dataclasses.replace(settings, max_tts_chars=50))

    response = client.post("/generate", data={"text": "word " * 40, "voice": voice_name})

    assert response.status_code == 413
    assert "limit for one recording" in response.json()["detail"]
    assert not fake_tts


# --- the speech routes themselves -------------------------------------------

def test_generate_returns_audio_and_reports_the_rate_it_used(client, voice_name, fake_tts):
    response = client.post(
        "/generate",
        data={"text": "Hello there.", "voice": voice_name, "rate": "+10%"},
    )

    assert response.status_code == 200
    assert response.headers["x-applied-rate"] == "+10%"
    assert response.headers["cache-control"] == "no-store"
    assert response.content.startswith(b"ID3")
    assert fake_tts["voice"] == voice_name


def test_auto_speed_overrides_the_manual_rate(client, voice_name, fake_tts):
    response = client.post("/generate", data={
        "text": " ".join(["word"] * 300),
        "voice": voice_name,
        "rate": "+0%",
        "target_time": 30,
        "auto_speed": "true",
    })

    assert response.status_code == 200
    # 300 words in 30 seconds is far faster than the default pace, so the engine
    # must have been handed a positive rate instead of the "+0%" that was sent.
    assert response.headers["x-applied-rate"] != "+0%"
    assert fake_tts["rate"] == response.headers["x-applied-rate"]


def test_generate_from_file_strips_subtitle_structure(client, voice_name, fake_tts):
    srt = "1\n00:00:00,000 --> 00:00:04,000\nHello there.\n\n2\n00:00:04,000 --> 00:00:08,000\nSecond line.\n"

    response = client.post(
        "/generate-from-file",
        files={"file": ("captions.srt", io.BytesIO(srt.encode()), "text/plain")},
        data={"voice": voice_name},
    )

    assert response.status_code == 200
    assert fake_tts["text"] == "Hello there. Second line."


def test_generate_from_file_needs_readable_text(client, voice_name, fake_tts):
    response = client.post(
        "/generate-from-file",
        files={"file": ("captions.srt", io.BytesIO(b"1\n00:00:00,000 --> 00:00:04,000\n"), "text/plain")},
        data={"voice": voice_name},
    )

    assert response.status_code == 400
    assert not fake_tts


# --- the error envelope -----------------------------------------------------

def test_health_reports_the_optional_pieces(client):
    body = client.get("/health").json()

    assert body["status"] == "ok"
    assert body["voices"] > 0
    assert set(body["ai"]) == {"enabled", "provider", "model"}
    assert body["limits"]["max_tts_chars"] > 0


def test_a_missing_route_uses_the_same_error_shape(client):
    response = client.get("/no-such-route")

    assert response.status_code == 404
    assert isinstance(response.json()["detail"], str)


def test_a_validation_failure_reads_as_a_sentence(client):
    response = client.post("/api/seo/from-text", data={})

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert isinstance(detail, str)
    assert detail.startswith("text:")


def test_an_unhandled_exception_never_leaks_its_message():
    @app.get("/tests/boom")
    def boom():
        raise RuntimeError("password=hunter2 /home/deploy/secret.key")

    try:
        with TestClient(app, raise_server_exceptions=False) as quiet_client:
            response = quiet_client.get("/tests/boom")

        assert response.status_code == 500
        assert response.json() == {
            "detail": "Something failed on our side. Try again in a moment."
        }
    finally:
        app.router.routes = [
            route for route in app.router.routes
            if getattr(route, "path", None) != "/tests/boom"
        ]
