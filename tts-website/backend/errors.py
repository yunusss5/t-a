"""
One error shape for the whole API: `{"detail": "<a sentence a person can read>"}`.

FastAPI already uses that shape for HTTPException, so the handlers here exist to
drag the two exceptions that do *not* into line — request validation, which
returns a list of machine-readable objects, and anything unhandled, which
returns a bare "Internal Server Error" and logs a traceback the caller should
never see.
"""

import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

logger = logging.getLogger("voiceforge.errors")

# Pydantic's field paths look like ("body", "text"); the last element is the one
# that means anything to a person.
def _describe(error: dict) -> str:
    location = error.get("loc") or ()
    field = str(location[-1]) if location else "input"
    message = error.get("msg", "is invalid").removeprefix("Value error, ")
    return f"{field}: {message}"


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError):
        details = "; ".join(_describe(error) for error in exc.errors()[:4])
        return JSONResponse(
            status_code=422,
            content={"detail": details or "That request was missing something."},
        )

    @app.exception_handler(HTTPException)
    async def http_error(request: Request, exc: HTTPException):
        detail = exc.detail if isinstance(exc.detail, str) else "That request could not be handled."
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": detail},
            headers=exc.headers,
        )

    @app.exception_handler(Exception)
    async def unhandled_error(request: Request, exc: Exception):
        # The traceback goes to the log with the request id; the caller gets a
        # sentence. Exception text can carry file paths, prompts and upstream
        # URLs, none of which belong in a response body.
        request_id = request.headers.get("x-request-id", "-")
        logger.exception("unhandled error on %s %s (id=%s)", request.method, request.url.path, request_id)
        return JSONResponse(
            status_code=500,
            content={"detail": "Something failed on our side. Try again in a moment."},
        )
