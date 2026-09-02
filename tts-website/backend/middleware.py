"""
ASGI middleware: security headers, a whole-request size ceiling, and one
structured access-log line per request.

None of it inspects or logs request bodies — the payloads here are people's
scripts and transcripts.
"""

import gzip
import json
import logging
import time
import uuid

from starlette.datastructures import Headers, MutableHeaders
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse, Response

from config import settings

logger = logging.getLogger("voiceforge.access")

# The API serves JSON and audio to a browser app on another origin; it never
# renders HTML, so the policy can be as tight as "nothing at all".
SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Resource-Policy": "cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
}


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Adds the headers above, plus HSTS once the request arrives over https."""

    async def dispatch(self, request, call_next):
        response = await call_next(request)

        for header, value in SECURITY_HEADERS.items():
            response.headers.setdefault(header, value)

        # Set only on https so a local http dev session is not pinned to a
        # scheme it cannot serve. X-Forwarded-Proto is what a TLS-terminating
        # proxy leaves behind.
        forwarded_proto = request.headers.get("x-forwarded-proto", request.url.scheme)
        if forwarded_proto == "https":
            response.headers.setdefault(
                "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
            )

        return response


class BodySizeLimitMiddleware(BaseHTTPMiddleware):
    """
    Rejects an oversized request before any route function runs.

    This is the cheap header check; the per-file cap in uploads.py is what
    actually enforces the limit on a chunked upload that declares no length.
    """

    def __init__(self, app, max_bytes: int):
        super().__init__(app)
        self.max_bytes = max_bytes

    async def dispatch(self, request, call_next):
        declared = request.headers.get("content-length")

        if declared and declared.isdigit() and int(declared) > self.max_bytes:
            megabytes = self.max_bytes / (1024 * 1024)
            return JSONResponse(
                status_code=413,
                content={"detail": f"That request is too large. The limit is {megabytes:.0f} MB."},
            )

        return await call_next(request)


COMPRESSIBLE_TYPES = (
    "application/json",
    "application/xml",
    "application/javascript",
    "image/svg+xml",
    "text/",
)


class CompressionMiddleware:
    """
    gzip, but only for the responses that benefit: complete JSON and text.

    Starlette's GZipMiddleware compresses whatever it is handed, which is wrong
    twice here. An mp3 is already compressed, so a second pass burns CPU and
    strips the Content-Length a player wants. And a server-sent-event stream ends
    up inside the deflate buffer, so a live stream arrives as one late blob.

    Both cases are recognisable from the response itself rather than guessed at
    from the path: anything that arrives in more than one chunk is streaming and
    passes straight through, and anything that is not a text-ish content type is
    left alone.
    """

    def __init__(self, app, minimum_size: int = 900, level: int = 6):
        self.app = app
        self.minimum_size = minimum_size
        self.level = level

    def _worth_compressing(self, start: dict | None, body: bytes) -> bool:
        if start is None or len(body) < self.minimum_size:
            return False

        headers = Headers(raw=start["headers"])
        if "content-encoding" in headers:  # already encoded by the route
            return False

        content_type = headers.get("content-type", "").split(";")[0].strip().lower()
        return content_type.startswith(COMPRESSIBLE_TYPES)

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or "gzip" not in Headers(scope=scope).get("accept-encoding", ""):
            await self.app(scope, receive, send)
            return

        start_message: dict | None = None
        streaming = False

        async def send_wrapper(message):
            nonlocal start_message, streaming

            if message["type"] == "http.response.start":
                # Held back: the headers cannot be finalised until the body size
                # and content type are known.
                start_message = message
                return

            if message["type"] != "http.response.body" or streaming:
                await send(message)
                return

            body = message.get("body", b"")

            if message.get("more_body", False) or not self._worth_compressing(start_message, body):
                streaming = True
                await send(start_message)
                await send(message)
                return

            # mtime=0 keeps the output byte-identical for identical input, so a
            # cached response and a fresh one cannot differ by a timestamp.
            compressed = gzip.compress(body, compresslevel=self.level, mtime=0)

            headers = MutableHeaders(raw=start_message["headers"])
            headers["Content-Encoding"] = "gzip"
            headers["Content-Length"] = str(len(compressed))
            headers.add_vary_header("Accept-Encoding")

            await send(start_message)
            await send({"type": "http.response.body", "body": compressed, "more_body": False})

        await self.app(scope, receive, send_wrapper)


class RequestLogMiddleware(BaseHTTPMiddleware):

    """
    One JSON line per request: method, path, status, duration, request id.

    Query strings are dropped rather than logged — on this API they can carry
    user text — and the id is echoed back so a user-reported failure can be
    found in the log.
    """

    async def dispatch(self, request, call_next):
        request_id = request.headers.get("x-request-id") or uuid.uuid4().hex[:12]
        started = time.perf_counter()

        try:
            response: Response = await call_next(request)
        except Exception:
            elapsed = (time.perf_counter() - started) * 1000
            logger.exception(
                json.dumps({
                    "id": request_id,
                    "method": request.method,
                    "path": request.url.path,
                    "status": 500,
                    "ms": round(elapsed, 1),
                })
            )
            raise

        elapsed = (time.perf_counter() - started) * 1000
        logger.info(
            json.dumps({
                "id": request_id,
                "method": request.method,
                "path": request.url.path,
                "status": response.status_code,
                "ms": round(elapsed, 1),
            })
        )
        response.headers["X-Request-ID"] = request_id
        return response


def configure_logging() -> None:
    """Plain single-line logs; the platform's log collector adds timestamps."""
    logging.basicConfig(
        level=getattr(logging, settings.log_level, logging.INFO),
        format="%(levelname)s %(name)s %(message)s",
    )
