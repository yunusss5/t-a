"""
Per-client request budgets.

In-memory and per-process on purpose: this app runs as a single uvicorn worker
on free hosting, and a Redis dependency would cost more than the abuse it
prevents. If the deployment ever scales past one worker the limits become
per-worker — the class is small enough to swap for a shared backend when that
day comes.
"""

from collections import OrderedDict, deque
import time

from fastapi import HTTPException, Request

from config import settings

# Bounded key space, so a flood of unique IPs cannot grow the table forever.
MAX_TRACKED_CLIENTS = 4096


class SlidingWindowLimiter:
    """Counts hits per key inside a rolling window."""

    def __init__(self, limit: int, window_seconds: int):
        self.limit = limit
        self.window = window_seconds
        self._hits: OrderedDict[str, deque[float]] = OrderedDict()

    def _bucket(self, key: str) -> deque[float]:
        bucket = self._hits.get(key)
        if bucket is None:
            bucket = deque()
            self._hits[key] = bucket
            # Evict the least recently used key rather than refusing to track a
            # new one: dropping an old bucket costs a forgotten count, whereas
            # refusing to track would let a new IP bypass the limit entirely.
            if len(self._hits) > MAX_TRACKED_CLIENTS:
                self._hits.popitem(last=False)
        else:
            self._hits.move_to_end(key)
        return bucket

    def hit(self, key: str) -> tuple[bool, int]:
        """Record a request. Returns (allowed, seconds_until_retry)."""
        now = time.monotonic()
        bucket = self._bucket(key)

        cutoff = now - self.window
        while bucket and bucket[0] <= cutoff:
            bucket.popleft()

        if len(bucket) >= self.limit:
            return False, max(1, int(bucket[0] + self.window - now) + 1)

        bucket.append(now)
        return True, 0

    def reset(self) -> None:
        self._hits.clear()


def client_key(request: Request) -> str:
    """
    Identify the caller.

    X-Forwarded-For is only honoured when TRUST_PROXY says a proxy is in front,
    because the header is trivially spoofable when it is not: trusting it on a
    directly-exposed app would let one client mint unlimited identities.
    """
    if settings.trust_proxy:
        forwarded = request.headers.get("x-forwarded-for", "")
        first_hop = forwarded.split(",")[0].strip()
        if first_hop:
            return first_hop
    client = request.client
    return client.host if client else "unknown"


_limiters: dict[str, SlidingWindowLimiter] = {
    "default": SlidingWindowLimiter(settings.rate_limit_default, settings.rate_limit_window),
    "heavy": SlidingWindowLimiter(settings.rate_limit_heavy, settings.rate_limit_window),
    "ai": SlidingWindowLimiter(settings.rate_limit_ai, settings.rate_limit_window),
}


def reset_all() -> None:
    """Clear every bucket. Used by tests so ordering cannot leak between them."""
    for limiter in _limiters.values():
        limiter.reset()


def rate_limit(bucket: str = "default"):
    """
    FastAPI dependency: `Depends(rate_limit("ai"))`.

    Buckets are separate windows, so an expensive model call cannot be starved
    of budget by a page full of cheap text-analysis requests.
    """

    def guard(request: Request) -> None:
        # Looked up per request rather than captured here, so a test can swap a
        # bucket for a two-request window without re-importing the routes.
        limiter = _limiters[bucket]

        allowed, retry_after = limiter.hit(f"{bucket}:{client_key(request)}")
        if allowed:
            return
        raise HTTPException(
            status_code=429,
            detail=f"Too many requests. Try again in {retry_after} seconds.",
            headers={"Retry-After": str(retry_after)},
        )

    return guard
