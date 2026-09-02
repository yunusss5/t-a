"""
Reading uploads without trusting them.

`await file.read()` with no argument buffers the whole upload into memory, which
turns any file upload endpoint into a memory-exhaustion lever. Everything here
reads in bounded chunks and gives up the moment the cap is passed.
"""

import logging

from fastapi import HTTPException, UploadFile

from config import settings

logger = logging.getLogger("voiceforge.uploads")

CHUNK_BYTES = 64 * 1024

# Transcript formats only, and only ones there is a real parser for: the file
# pickers in the UI advertise exactly this list, so a visitor is never offered a
# format the server then refuses. The extension is checked here as a fast filter;
# the parsers still have to cope with a file whose name lies about its contents.
TEXT_EXTENSIONS = (".txt", ".md", ".srt", ".vtt")


async def read_upload(file: UploadFile, max_bytes: int | None = None) -> bytes:
    """
    Buffer an upload up to `max_bytes`, then refuse.

    Raises HTTPException(413) rather than returning a truncated file: silently
    processing the first N bytes of someone's transcript would be worse than
    telling them it was too big.
    """
    limit = max_bytes or settings.max_upload_bytes
    chunks: list[bytes] = []
    total = 0

    while True:
        chunk = await file.read(CHUNK_BYTES)
        if not chunk:
            break

        total += len(chunk)
        if total > limit:
            megabytes = limit / (1024 * 1024)
            raise HTTPException(
                status_code=413,
                detail=f"That file is larger than {megabytes:.0f} MB. Split it into parts.",
            )
        chunks.append(chunk)

    if total == 0:
        raise HTTPException(status_code=400, detail="That file is empty.")

    return b"".join(chunks)


def require_extension(filename: str | None, allowed: tuple[str, ...] = TEXT_EXTENSIONS) -> str:
    """
    Validate the extension and return a safe display name.

    The name is only ever echoed back in JSON, never used to build a path, but
    it is still stripped of directory components: a browser is not the only
    thing that can post multipart data, and "../../etc/passwd" in a response
    body is a bug report waiting to happen.
    """
    name = (filename or "").replace("\\", "/").split("/")[-1].strip()

    if not name:
        raise HTTPException(status_code=400, detail="That upload has no filename.")
    if not name.lower().endswith(allowed):
        allowed_list = ", ".join(allowed)
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type. Use {allowed_list}.",
        )

    return name[:120]
