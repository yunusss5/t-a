"""Make `backend/` importable so tests can `from utils import seo`."""

import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

import pytest  # noqa: E402  (must follow the sys.path fix-up)

import ratelimit  # noqa: E402


@pytest.fixture(autouse=True)
def _clear_rate_limits():
    """
    Every test starts with a full budget.

    Without this, a suite that grows past a bucket's per-minute limit would start
    failing on whichever test happened to run last — a fixture is cheaper than
    that debugging session.
    """
    ratelimit.reset_all()
    yield
    ratelimit.reset_all()
