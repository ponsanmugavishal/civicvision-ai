"""Simple in-process sliding-window rate limiter for abuse control on report submission and uploads.

Limitation: state is per process. With several backend instances, move this to a shared store (e.g. Redis or
a Postgres table); a single Render instance is fine for the hackathon deployment.
"""

import threading
import time
from collections import defaultdict, deque

from ..errors import too_many

_lock = threading.Lock()
_hits: dict[str, deque[float]] = defaultdict(deque)


def check(key: str, limit: int, window_seconds: int = 3600) -> None:
    if limit <= 0:
        return
    now = time.monotonic()
    with _lock:
        q = _hits[key]
        while q and now - q[0] > window_seconds:
            q.popleft()
        if len(q) >= limit:
            minutes = max(1, int((window_seconds - (now - q[0])) / 60))
            raise too_many(f"Too many requests. Please try again in about {minutes} minute(s).")
        q.append(now)


def reset() -> None:
    with _lock:
        _hits.clear()
