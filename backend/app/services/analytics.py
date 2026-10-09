"""Descriptive analytics computed from real database rows (no ranking or causal claims)."""

import math
import uuid
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import utcnow
from ..models import DeadlineExtension, Department, EscalationEvent, Feedback, Report
from .. import schemas as S
from .sla import ACTIVE, deadline_info

CATS = ("garbage", "drainage", "pothole", "other")
STATS = ("open", "assigned", "in_progress", "resolved", "rejected", "reopened")
SEVS = ("critical", "high", "medium", "low")


def summarize(db: Session, reports: list[Report]) -> S.SummaryStatsOut:
    now = utcnow()
    by_status = dict.fromkeys(STATS, 0)
    by_cat = dict.fromkeys(CATS, 0)
    by_sev = dict.fromkeys(SEVS, 0)
    overdue = approaching = critical = res_count = on_time = 0
    res_total = 0.0
    for r in reports:
        by_status[r.status] += 1
        by_cat[r.category] += 1
        by_sev[r.severity] += 1
        info = deadline_info(r, now)
        overdue += info.state == "overdue"
        approaching += info.state == "approaching"
        critical += r.status in ACTIVE and r.severity == "critical"
        if r.status == "resolved" and r.resolved_at:
            res_total += (r.resolved_at - r.reported_at).total_seconds()
            res_count += 1
            on_time += info.state == "met"
    ids = [r.id for r in reports]

    def count(stmt) -> int:
        return db.scalar(stmt) or 0 if ids else 0

    return S.SummaryStatsOut(
        total=len(reports), active=sum(by_status[s] for s in ACTIVE), resolved=by_status["resolved"], rejected=by_status["rejected"],
        overdue=overdue, approaching=approaching, critical_active=critical, by_status=by_status, by_category=by_cat, by_severity=by_sev,
        avg_resolution_hours=res_total / res_count / 3600 if res_count else None, resolved_on_time_rate=on_time / res_count if res_count else None,
        open_escalations=count(select(func.count()).select_from(EscalationEvent).where(EscalationEvent.report_id.in_(ids), EscalationEvent.status.in_(("open", "under_review")))),
        pending_extensions=count(select(func.count()).select_from(DeadlineExtension).where(DeadlineExtension.report_id.in_(ids), DeadlineExtension.status == "pending")),
        pending_disputes=count(select(func.count()).select_from(Feedback).where(Feedback.report_id.in_(ids), Feedback.reopen_decision == "pending")),
    )


def departments(db: Session, reports: list[Report], routing: dict[str, uuid.UUID]) -> list[S.DepartmentStatsOut]:
    out = []
    for d in db.scalars(select(Department).order_by(Department.slug)):
        rs = [r for r in reports if (r.department_id or routing.get(r.category)) == d.id]
        s = summarize(db, rs)
        out.append(S.DepartmentStatsOut(department_id=d.id, name=d.short_name, total=s.total, active=s.active, resolved=s.resolved, overdue=s.overdue, critical=s.critical_active, avg_resolution_hours=s.avg_resolution_hours, on_time_rate=s.resolved_on_time_rate))
    return out


def trend(reports: list[Report], weeks: int) -> list[S.TrendPointOut]:
    now = utcnow()
    start = (now - timedelta(days=(now.weekday() + 1) % 7)).replace(hour=0, minute=0, second=0, microsecond=0)  # Sunday
    points = []
    for i in range(weeks - 1, -1, -1):
        lo = start - timedelta(weeks=i)
        hi = lo + timedelta(weeks=1)

        def within(t: datetime | None) -> bool:
            return t is not None and lo <= t < hi

        points.append(S.TrendPointOut(week_start=lo, reported=sum(within(r.reported_at) for r in reports), resolved=sum(within(r.resolved_at) for r in reports)))
    return points


def _dist(a: Report, b: Report) -> float:
    R = 6_371_000
    p1, p2 = math.radians(a.latitude), math.radians(b.latitude)
    dp, dl = p2 - p1, math.radians(b.longitude - a.longitude)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def hotspots(reports: list[Report], radius_m: float = 250, min_count: int = 3, limit: int = 2000) -> list[S.HotspotOut]:
    """Greedy radius clustering, densest seeds first. O(n²) — capped at `limit` most recent reports."""
    pool = sorted(reports, key=lambda r: r.reported_at, reverse=True)[:limit]
    density = {r.id: sum(1 for o in pool if _dist(r, o) <= radius_m) for r in pool}
    pool.sort(key=lambda r: density[r.id], reverse=True)
    used: set[uuid.UUID] = set()
    out: list[S.HotspotOut] = []
    for r in pool:
        if r.id in used:
            continue
        members = [o for o in pool if o.id not in used and _dist(r, o) <= radius_m]
        if len(members) < min_count:
            continue
        used.update(m.id for m in members)
        cats: dict[str, int] = {}
        for m in members:
            cats[m.category] = cats.get(m.category, 0) + 1
        top = max(cats.items(), key=lambda kv: kv[1])[0]
        parts = [p.strip() for p in members[0].address.split(",")]
        place = ", ".join(parts[1:3]) if len(parts) > 2 else members[0].address
        out.append(
            S.HotspotOut(
                id=f"hs-{len(out) + 1}", latitude=sum(m.latitude for m in members) / len(members), longitude=sum(m.longitude for m in members) / len(members),
                count=len(members), active_count=sum(m.status in ACTIVE for m in members), categories=cats,
                report_ids=[m.id for m in members], public_ids=[m.public_id for m in members], label=f"{place} ({top})",
            )
        )
    return sorted(out, key=lambda h: h.count, reverse=True)
