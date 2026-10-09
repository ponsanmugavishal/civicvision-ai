"""Rules-based duplicate detection: nearby + same/compatible category + recent + similar wording.

It only WARNS. A complaint is never discarded or merged automatically. No image similarity is performed.
"""

import math
import re
import uuid
from dataclasses import dataclass
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import utcnow
from ..models import Report

# "other" may overlap with any category; the three main categories only match themselves or "other".
COMPATIBLE = {"garbage": {"garbage", "other"}, "drainage": {"drainage", "other"}, "pothole": {"pothole", "other"}, "other": {"garbage", "drainage", "pothole", "other"}}
STOP = set("a an the and or of to in on at near is are was were it this that with for by be has have there their from as not very".split())


@dataclass
class Candidate:
    report: Report
    distance_m: float
    text_similarity: float


def distance_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    h = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lng2 - lng1) / 2) ** 2
    return 2 * 6_371_000 * math.asin(math.sqrt(h))


def _tokens(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-z0-9]+", text.lower()) if len(w) > 2 and w not in STOP}


def text_similarity(a: str, b: str) -> float:
    ta, tb = _tokens(a), _tokens(b)
    return round(len(ta & tb) / len(ta | tb), 2) if ta and tb else 0.0


def find(db: Session, lat: float, lng: float, category: str, description: str = "", exclude: uuid.UUID | None = None, limit: int = 5) -> list[Candidate]:
    s = get_settings()
    radius = s.duplicate_radius_m
    # Bounding-box prefilter (uses the lat/lng index), then exact distance.
    dlat = radius / 111_320
    dlng = radius / (111_320 * max(math.cos(math.radians(lat)), 0.01))
    since = utcnow() - timedelta(days=s.duplicate_window_days)
    stmt = (
        select(Report)
        .where(
            Report.latitude.between(lat - dlat, lat + dlat),
            Report.longitude.between(lng - dlng, lng + dlng),
            Report.category.in_(COMPATIBLE.get(category, {category})),
            Report.status != "rejected",
            Report.reported_at >= since,
        )
        .limit(200)
    )
    out = []
    for r in db.scalars(stmt):
        if exclude and r.id == exclude:
            continue
        d = distance_m(lat, lng, r.latitude, r.longitude)
        if d <= radius:
            out.append(Candidate(r, round(d, 1), text_similarity(description, r.description) if description else 0.0))
    # Closest first; same category and similar wording break ties.
    out.sort(key=lambda c: (c.distance_m - 60 * c.text_similarity - (25 if c.report.category == category else 0)))
    return out[:limit]
