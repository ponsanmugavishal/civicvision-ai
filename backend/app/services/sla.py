"""SLA deadlines and the idempotent escalation check.

Policy values in the seed data are ILLUSTRATIVE, configurable examples — not legal or municipal standards.
"""

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..db import utcnow
from ..models import AuditLog, EscalationEvent, Notification, Profile, Report, SlaPolicy, StatusHistory

KINDS = ("acknowledgement", "action", "resolution")
ACTIVE = ("open", "assigned", "in_progress", "reopened")
APPROACHING_FRACTION = 0.25
LEVEL = {"acknowledgement": 1, "action": 2, "resolution": 3}
LABEL = {"acknowledgement": "Acknowledgement", "action": "Initial action", "resolution": "Resolution"}

# Used only if no policy row matches (e.g. seed not applied yet).
FALLBACK_HOURS = {"critical": (4, 12, 48), "high": (12, 24, 96), "medium": (24, 72, 168), "low": (48, 120, 336)}


def find_policy(db: Session, category: str, severity: str, department_id: uuid.UUID | None, zone_id: uuid.UUID | None) -> tuple[float, float, float]:
    """Most specific enabled policy wins: department+zone, department, zone, then global."""
    rows = db.scalars(select(SlaPolicy).where(SlaPolicy.category == category, SlaPolicy.severity == severity, SlaPolicy.enabled.is_(True))).all()

    def score(p: SlaPolicy) -> int:
        if p.department_id and p.department_id != department_id:
            return -1
        if p.zone_id and p.zone_id != zone_id:
            return -1
        return (2 if p.department_id else 0) + (1 if p.zone_id else 0)

    best = max(rows, key=score, default=None)
    if best is None or score(best) < 0:
        return FALLBACK_HOURS[severity]
    return best.acknowledgement_hours, best.action_hours, best.resolution_hours


def compute_deadlines(hours: tuple[float, float, float], start: datetime) -> dict[str, datetime]:
    return {k: start + timedelta(hours=h) for k, h in zip(KINDS, hours)}


@dataclass
class DeadlineInfo:
    state: str  # on_track | approaching | overdue | met | missed | not_applicable
    kind: str | None
    due_at: datetime | None


def stage_completed_at(r: Report, kind: str, rejected_at: datetime | None = None) -> datetime | None:
    if kind == "acknowledgement":
        return r.acknowledged_at
    if kind == "action":
        return r.action_started_at or r.resolved_at
    return r.resolved_at or rejected_at


def deadline_info(r: Report, now: datetime | None = None) -> DeadlineInfo:
    """Same rules as the frontend's getDeadlineInfo — deadline state is independent of severity."""
    now = now or utcnow()
    if r.status == "rejected":
        return DeadlineInfo("not_applicable", None, None)
    if r.status == "resolved":
        resolved = r.resolved_at or now
        return DeadlineInfo("met" if resolved <= r.resolution_deadline else "missed", "resolution", r.resolution_deadline)
    unmet = [k for k in KINDS if not (k == "acknowledgement" and r.acknowledged_at) and not (k == "action" and r.action_started_at)]
    missed = [k for k in unmet if r.deadline(k) < now]
    if missed:
        k = missed[-1]
        return DeadlineInfo("overdue", k, r.deadline(k))
    k = unmet[0]
    due = r.deadline(k)
    window = (due - r.reported_at).total_seconds()
    remaining = (due - now).total_seconds()
    state = "approaching" if remaining <= max(window * APPROACHING_FRACTION, 3600) else "on_track"
    return DeadlineInfo(state, k, due)


def sync_escalations(db: Session, now: datetime | None = None, report_ids: list[uuid.UUID] | None = None) -> int:
    """Create escalation events for missed deadlines. Safe to re-run: each event is keyed by
    (report, stage, deadline value) and protected by a unique constraint, so repeated or concurrent runs
    never duplicate events. Earlier breaches are never deleted; an extended deadline that is later missed
    creates a new, separate event. Returns the number of events created."""
    now = now or utcnow()
    stmt = select(Report).where(Report.status.in_(ACTIVE))
    if report_ids:
        stmt = stmt.where(Report.id.in_(report_ids))
    reports = db.scalars(stmt).all()
    if not reports:
        return 0
    existing = {
        (e.report_id, e.deadline_kind, e.deadline_at)
        for e in db.scalars(select(EscalationEvent).where(EscalationEvent.report_id.in_([r.id for r in reports])))
    }
    supervisors = db.scalars(select(Profile).where(Profile.role.in_(("supervisor", "administrator")))).all()
    created = 0
    for r in reports:
        for kind in KINDS:
            due = r.deadline(kind)
            if due > now or stage_completed_at(r, kind):
                continue
            if (r.id, kind, due) in existing:
                continue
            level = min(3, LEVEL[kind] + (1 if r.severity == "critical" else 0))
            event = EscalationEvent(
                report_id=r.id,
                level=level,
                reason=f"{LABEL[kind]} target missed for a {r.severity} {r.category} complaint.",
                deadline_kind=kind,
                deadline_at=due,
                triggered_at=now,
                notified_role="supervisor",
                status="open",
            )
            try:
                with db.begin_nested():  # savepoint: a concurrent run inserting the same key is not an error
                    db.add(event)
                    db.flush()
            except IntegrityError:
                continue
            existing.add((r.id, kind, due))
            created += 1
            db.add(AuditLog(actor_id=None, actor_role="administrator", action="escalation.created", entity_type="escalation", entity_id=str(event.id), report_id=r.id, summary=f"{r.public_id}: level {level} escalation — {kind} deadline missed", metadata_={"deadline_at": due.isoformat()}))
            for s in supervisors:
                db.add(Notification(user_id=s.id, title=f"Escalation: {r.public_id}", body=event.reason, link=f"/supervisor/reports/{r.id}"))
    db.commit()
    return created


def rejected_at(db: Session, report_id: uuid.UUID) -> datetime | None:
    return db.scalar(select(StatusHistory.created_at).where(StatusHistory.report_id == report_id, StatusHistory.new_status == "rejected").order_by(StatusHistory.created_at.desc()).limit(1))
