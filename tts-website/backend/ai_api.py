"""
The AI endpoints.

    GET  /api/ai/status          is a model connected, and which tasks exist
    POST /api/ai/assist          one writing task, answered in full
    POST /api/ai/assist/stream   the same, as server-sent events
    POST /api/ai/seo-polish      rewrite a generated SEO package
    POST /api/ai/ideas           follow-up video ideas from a transcript

Everything here is thin on purpose: parse the form, hand it to ai.service, and
turn the three AI exceptions into the three status codes they mean. The prompts,
the sanitising and the provider all live under ai/ so this file has no reason to
change when the model does.

Every route sits behind the "ai" rate-limit bucket, which has its own budget: a
model call costs seconds of someone else's CPU, so it is metered separately from
the cheap text tools.
"""

import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, Form, HTTPException, Query
from fastapi.responses import StreamingResponse

from ai import service
from ai.providers import AiFailed, AiUnavailable
from ai.service import AiInputRejected
from ratelimit import rate_limit

logger = logging.getLogger("voiceforge.ai")

router = APIRouter(prefix="/api/ai", tags=["ai"])

# 503: nothing is listening, so retrying later may work.
# 502: the model answered with something unusable — a server-side fault either
# way, and never the caller's fault, which 4xx would imply.
_STATUS_FOR = ((AiInputRejected, 400), (AiUnavailable, 503), (AiFailed, 502))


def _as_http(error: Exception) -> HTTPException:
    for kind, code in _STATUS_FOR:
        if isinstance(error, kind):
            return HTTPException(status_code=code, detail=str(error))
    raise error


async def _run(coroutine):
    try:
        return await coroutine
    except (AiInputRejected, AiUnavailable, AiFailed) as error:
        raise _as_http(error) from error


@router.get("/status")
async def ai_status(probe: bool = Query(True, description="Ping the model host")):
    """
    Safe to call from the browser on every page load.

    Reports the provider kind and model name — deliberately not the base URL or
    the API key, which stay in the server's environment.
    """
    return await service.status(probe=probe)


@router.post("/assist", dependencies=[Depends(rate_limit("ai"))])
async def ai_assist(
    task: str = Form(..., description="One of the ids from /api/ai/status"),
    content: str = Form(..., description="The creator's script, notes or topic"),
    tone: Optional[str] = Form(None),
):
    return await _run(service.assist(task, content, tone=tone))


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


@router.post("/assist/stream", dependencies=[Depends(rate_limit("ai"))])
async def ai_assist_stream(
    task: str = Form(...),
    content: str = Form(...),
    tone: Optional[str] = Form(None),
):
    """
    The assist task as server-sent events: `{"delta": "…"}` frames, then
    `{"done": true}`.

    A failure after the first byte cannot change the status code, so it arrives
    as an `{"error": "…"}` frame instead and the client shows it the same way it
    shows a 502.
    """
    try:
        service.check_assist(task, content)
    except (AiInputRejected, AiUnavailable, AiFailed) as error:
        raise _as_http(error) from error

    async def events():
        try:
            async for piece in service.assist_stream(task, content, tone=tone):
                yield _sse({"delta": piece})
        except (AiUnavailable, AiFailed) as error:
            yield _sse({"error": str(error)})
        except Exception:
            logger.exception("AI stream failed for task=%s", task)
            yield _sse({"error": "The model stopped responding. Try again."})
        else:
            yield _sse({"done": True})

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-store",
            # nginx and friends buffer proxied responses by default, which turns
            # a stream into one late blob.
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/seo-polish", dependencies=[Depends(rate_limit("ai"))])
async def ai_seo_polish(
    transcript: str = Form(...),
    package: str = Form("{}", description="The generated SEO package, as JSON"),
    count: int = Form(5),
):
    """
    Improve the wording of a package that /api/seo/* already generated.

    The deterministic package stays the source of truth; the client keeps it and
    can put it back, so a model that returns something worse costs one click.
    """
    try:
        parsed = json.loads(package or "{}")
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="package must be valid JSON.")

    if not isinstance(parsed, dict):
        raise HTTPException(status_code=400, detail="package must be a JSON object.")

    return await _run(
        service.seo_polish(parsed, transcript, count=max(1, min(8, count)))
    )


@router.post("/ideas", dependencies=[Depends(rate_limit("ai"))])
async def ai_ideas(transcript: str = Form(...), count: int = Form(6)):
    return await _run(service.ideas(transcript, count=max(1, min(12, count))))
