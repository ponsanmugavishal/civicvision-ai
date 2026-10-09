"""Report workflows. Every state change writes status history and an audit entry in the same transaction."""

import uuid
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import utcnow
from ..errors import forbidden, invalid, not_found, require_min_length
from ..models import (
    AiSuggestion,
    AuditLog,
    Assignment,
    DeadlineExtension,
    Department,
    EscalationEvent,
    Evidence,
    Feedback,
    Notification,
    Profile,
    ProgressNote,
    Report,
    ReportCounter,
    StatusHistory,
    Zone,
)
from ..permissions import can_work, ensure_view
from .. import schemas as S
from . import duplicates, sla
from .storage import get_storage

STATUS_LABEL = {"open": "Open", "assigned": "Assigned", "in_progress": "In progress", "resolved": "Resolved", "rejected": "Rejected", "reopened": "Reopened"}
ROLE_LABEL = {"citizen": "Citizen", "staff": "Department staff", "supervisor": "Supervisor", "administrator": "Administrator"}
TRANSITIONS = {
    "open": ["assigned", "rejected"],
    "assigned": ["in_progress", "rejected"],
    "reopened": ["in_progress"],
    "in_progress": ["resolved"],
    "resolved": [],
    "rejected": [],
}


# ---------------------------------------------------------------- helpers


def get_report(db: Session, report_id: uuid.UUID, lock: bool = False) -> Report:
    stmt = select(Report).where(Report.id == report_id)
    if lock:
        stmt = stmt.with_for_update()
    r = db.scalar(stmt)
    if r is None:
        raise not_found("Complaint not found.")
    return r


def audit(db: Session, actor: Profile | None, action: str, entity_type: str, entity_id: object, report: Report | None, summary: str, **meta) -> None:
    db.add(AuditLog(actor_id=actor.id if actor else None, actor_role=actor.role if actor else "administrator", action=action, entity_type=entity_type, entity_id=str(entity_id), report_id=report.id if report else None, summary=summary, metadata_=meta))


def notify(db: Session, user_id: uuid.UUID | None, title: str, body: str, link: str | None) -> None:
    if user_id:
        db.add(Notification(user_id=user_id, title=title[:200], body=body, link=link))


def notify_supervisors(db: Session, title: str, body: str, link: str) -> None:
    for s in db.scalars(select(Profile).where(Profile.role == "supervisor")):
        notify(db, s.id, title, body, link)


def next_public_id(db: Session, now: datetime) -> str:
    counter = db.scalar(select(ReportCounter).where(ReportCounter.year == now.year).with_for_update())
    if counter is None:
        counter = ReportCounter(year=now.year, last_value=0)
        db.add(counter)
    counter.last_value += 1
    db.flush()
    return f"CV-{now.year}-{counter.last_value:05d}"


def nearest_zone(db: Session, lat: float, lng: float) -> Zone | None:
    # Stand-in for ward-boundary lookup: nearest configured zone centre.
    zones = db.scalars(select(Zone)).all()
    return min(zones, key=lambda z: (z.center_lat - lat) ** 2 + (z.center_lng - lng) ** 2, default=None)


def change_status(db: Session, actor: Profile, r: Report, new: str, comment: str) -> None:
    prev = r.status
    now = utcnow()
    db.add(StatusHistory(report_id=r.id, previous_status=prev, new_status=new, changed_by=actor.id, changed_by_role=actor.role, comment=comment, created_at=now))
    r.status = new
    r.updated_at = now
    audit(db, actor, "report.status_changed", "report", r.id, r, f"{r.public_id}: {prev} → {new}", previous=prev, new=new)
    notify(db, r.citizen_id, f"{r.public_id} is now {STATUS_LABEL[new].lower()}", comment, f"/citizen/reports/{r.id}")


def _names(db: Session, ids: set[uuid.UUID | None]) -> dict[uuid.UUID, Profile]:
    ids = {i for i in ids if i}
    if not ids:
        return {}
    return {p.id: p for p in db.scalars(select(Profile).where(Profile.id.in_(ids)))}


# ---------------------------------------------------------------- serialization


def _deadlines(r: Report, original: bool = False) -> S.Deadlines:
    get = r.original_deadline if original else r.deadline
    return S.Deadlines(acknowledgement=get("acknowledgement"), action=get("action"), resolution=get("resolution"))


def public_out(r: Report) -> S.PublicReportOut:
    return S.PublicReportOut(
        id=r.id, public_id=r.public_id, category=r.category, description=r.description, latitude=r.latitude, longitude=r.longitude,  # type: ignore[arg-type]
        address=r.address, landmark=r.landmark, severity=r.severity, status=r.status, department_id=r.department_id, zone_id=r.zone_id,  # type: ignore[arg-type]
        reported_at=r.reported_at, updated_at=r.updated_at, deadlines=_deadlines(r), acknowledged_at=r.acknowledged_at,
        action_started_at=r.action_started_at, resolved_at=r.resolved_at, resolution_summary=r.resolution_summary, is_demo=r.is_demo,
    )


def report_out(r: Report) -> S.ReportOut:
    return S.ReportOut(
        **public_out(r).model_dump(), citizen_id=r.citizen_id, assigned_staff_id=r.assigned_staff_id, original_deadlines=_deadlines(r, True),
        rejection_reason=r.rejection_reason, ai_suggested_category=r.ai_suggested_category, ai_explanation=r.ai_explanation,  # type: ignore[arg-type]
        ai_suggested_severity=r.ai_suggested_severity, possible_duplicate_ids=list(r.possible_duplicate_ids or []),  # type: ignore[arg-type]
    )


def rows_out(db: Session, reports: list[Report]) -> list[S.ScopedReportRowOut]:
    if not reports:
        return []
    ids = [r.id for r in reports]
    depts = {d.id: d for d in db.scalars(select(Department))}
    zones = {z.id: z for z in db.scalars(select(Zone))}
    people = _names(db, {r.assigned_staff_id for r in reports})
    pending = set(db.scalars(select(DeadlineExtension.report_id).where(DeadlineExtension.report_id.in_(ids), DeadlineExtension.status == "pending")))
    esc_counts = dict(
        db.execute(
            select(EscalationEvent.report_id, func.count()).where(EscalationEvent.report_id.in_(ids), EscalationEvent.status.in_(("open", "under_review"))).group_by(EscalationEvent.report_id)
        ).all()
    )
    out = []
    for r in reports:
        d = depts.get(r.department_id) if r.department_id else None
        z = zones.get(r.zone_id) if r.zone_id else None
        p = people.get(r.assigned_staff_id) if r.assigned_staff_id else None
        out.append(S.ScopedReportRowOut(**report_out(r).model_dump(), department_name=d.short_name if d else None, assigned_staff_name=p.display_name if p else None, zone_name=z.name if z else None, pending_extension=r.id in pending, open_escalations=esc_counts.get(r.id, 0)))
    return out


def evidence_out(items: list[Evidence], public: bool, demo: bool) -> list[S.EvidenceOut]:
    storage = get_storage()
    order = {"original": 0, "progress": 1, "resolution": 2, "other": 3}
    return [
        S.EvidenceOut(
            id=e.id, report_id=e.report_id, uploaded_by="" if public else str(e.uploaded_by), uploaded_by_role=e.uploaded_by_role,  # type: ignore[arg-type]
            url=storage.signed_url(e.storage_path), type=e.evidence_type, caption=e.caption, is_placeholder=demo and e.storage_path.startswith("demo/"), created_at=e.created_at,  # type: ignore[arg-type]
        )
        for e in sorted(items, key=lambda e: (order.get(e.evidence_type, 9), e.created_at))
    ]


def build_timeline(db: Session, r: Report, audience: str) -> list[S.TimelineEntryOut]:
    """audience: public | citizen | internal. Public views never include names, contact details or internal notes."""
    internal = audience == "internal"
    pub = not internal
    history = db.scalars(select(StatusHistory).where(StatusHistory.report_id == r.id)).all()
    notes = db.scalars(select(ProgressNote).where(ProgressNote.report_id == r.id)).all()
    evidence = db.scalars(select(Evidence).where(Evidence.report_id == r.id, Evidence.evidence_type != "original")).all()
    feedback = db.scalars(select(Feedback).where(Feedback.report_id == r.id)).all() if audience != "public" else []
    assignments = db.scalars(select(Assignment).where(Assignment.report_id == r.id)).all() if internal else []
    extensions = db.scalars(select(DeadlineExtension).where(DeadlineExtension.report_id == r.id)).all() if internal else []
    escalations = db.scalars(select(EscalationEvent).where(EscalationEvent.report_id == r.id)).all() if internal else []
    people = _names(db, {h.changed_by for h in history} | {n.author_id for n in notes} | {e.uploaded_by for e in evidence} | {a.assigned_by for a in assignments} | {a.assigned_staff_id for a in assignments} | {x.requested_by for x in extensions} | {x.reviewed_by for x in extensions} | {f.citizen_id for f in feedback})

    def actor(uid: uuid.UUID | None, role: str) -> str:
        if uid is None:
            return "Automated deadline check"
        if pub:
            return ROLE_LABEL.get(role, role)
        p = people.get(uid)
        return f"{p.display_name} · {ROLE_LABEL[p.role]}" if p else ROLE_LABEL.get(role, role)

    out: list[S.TimelineEntryOut] = []
    for h in history:
        out.append(S.TimelineEntryOut(id=str(h.id), kind="status", title=f"Status changed to {STATUS_LABEL[h.new_status]}" if h.previous_status else "Complaint submitted", detail=h.comment, actor_label=actor(h.changed_by, h.changed_by_role), created_at=h.created_at, status=h.new_status))  # type: ignore[arg-type]
    for n in notes:
        if n.internal and not internal:
            continue
        out.append(S.TimelineEntryOut(id=str(n.id), kind="note", title="Internal note" if n.internal else "Progress update", detail=n.body, actor_label=actor(n.author_id, n.author_role), created_at=n.created_at, internal=n.internal))
    for e in evidence:
        label = {"resolution": "Resolution", "progress": "Progress"}.get(e.evidence_type, "Supporting")
        out.append(S.TimelineEntryOut(id=str(e.id), kind="evidence", title=f"{label} photo added", detail=e.caption, actor_label=actor(e.uploaded_by, e.uploaded_by_role), created_at=e.created_at))
    for f in feedback:
        decision = f" — Reopen {f.reopen_decision}: {f.decision_reason or ''}" if f.reopen_decision and f.reopen_decision != "pending" else ""
        out.append(S.TimelineEntryOut(id=str(f.id), kind="feedback", title="Reopen requested by citizen" if f.reopen_requested else f"Citizen feedback ({f.rating}/5)", detail=f.comment + decision, actor_label=actor(f.citizen_id, "citizen") if internal else "You", created_at=f.created_at))
    for a in assignments:
        target = people.get(a.assigned_staff_id) if a.assigned_staff_id else None
        out.append(S.TimelineEntryOut(id=str(a.id), kind="assignment", title=f"Assigned to {target.display_name if target else 'department queue'}", detail=a.reason, actor_label=actor(a.assigned_by, people[a.assigned_by].role if a.assigned_by in people else "supervisor"), created_at=a.assigned_at))
    for x in extensions:
        out.append(S.TimelineEntryOut(id=str(x.id), kind="extension", title=f"Deadline extension requested ({x.deadline_kind})", detail=x.reason, actor_label=actor(x.requested_by, "staff"), created_at=x.created_at))
        if x.reviewed_at:
            out.append(S.TimelineEntryOut(id=f"{x.id}-r", kind="extension", title=f"Extension {x.status}", detail=x.review_reason or "", actor_label=actor(x.reviewed_by, "supervisor"), created_at=x.reviewed_at))
    for e in escalations:
        out.append(S.TimelineEntryOut(id=str(e.id), kind="escalation", title=f"Level {e.level} escalation", detail=e.reason + (f" Action: {e.action_taken}" if e.action_taken else ""), actor_label="Automated deadline check", created_at=e.triggered_at))
    return sorted(out, key=lambda t: t.created_at)


def public_bundle(db: Session, r: Report) -> S.PublicBundleOut:
    ev = db.scalars(select(Evidence).where(Evidence.report_id == r.id)).all()
    return S.PublicBundleOut(report=public_out(r), timeline=build_timeline(db, r, "public"), evidence=evidence_out(list(ev), public=True, demo=r.is_demo))


def citizen_bundle(db: Session, r: Report) -> S.CitizenBundleOut:
    ev = db.scalars(select(Evidence).where(Evidence.report_id == r.id)).all()
    fb = db.scalars(select(Feedback).where(Feedback.report_id == r.id).order_by(Feedback.created_at)).all()
    return S.CitizenBundleOut(report=report_out(r), timeline=build_timeline(db, r, "citizen"), evidence=evidence_out(list(ev), public=False, demo=r.is_demo), feedback=[S.FeedbackOut.model_validate(f) for f in fb])


def work_bundle(db: Session, r: Report) -> S.WorkBundleOut:
    def q(model, order):
        return db.scalars(select(model).where(model.report_id == r.id).order_by(order)).all()

    reporter = db.get(Profile, r.citizen_id)
    return S.WorkBundleOut(
        report=report_out(r),
        history=[S.StatusHistoryOut.model_validate(x) for x in q(StatusHistory, StatusHistory.created_at)],
        evidence=evidence_out(list(q(Evidence, Evidence.created_at)), public=False, demo=r.is_demo),
        notes=[S.ProgressNoteOut.model_validate(x) for x in q(ProgressNote, ProgressNote.created_at)],
        feedback=[S.FeedbackOut.model_validate(x) for x in q(Feedback, Feedback.created_at)],
        assignments=[S.AssignmentOut.model_validate(x) for x in q(Assignment, Assignment.assigned_at)],
        extensions=[S.ExtensionOut.model_validate(x) for x in q(DeadlineExtension, DeadlineExtension.created_at)],
        escalations=[S.EscalationOut.model_validate(x) for x in q(EscalationEvent, EscalationEvent.triggered_at)],
        timeline=build_timeline(db, r, "internal"),
        reporter=S.ReporterOut(display_name=reporter.display_name, email=reporter.email, phone=reporter.phone) if reporter else None,
    )


# ---------------------------------------------------------------- workflows


def create_report(db: Session, user: Profile, *, category: str, description: str, latitude: float, longitude: float, address: str, landmark: str, photo: bytes, content_type: str, ext: str, ai_suggestion_id: uuid.UUID | None = None) -> Report:
    errors: dict[str, str] = {}
    description = description.strip()
    if category not in ("garbage", "drainage", "pothole", "other"):
        errors["category"] = "Choose a category."
    if len(description) < 20:
        errors["description"] = "Describe the issue in at least 20 characters."
    if len(description) > 1000:
        errors["description"] = "Keep the description under 1000 characters."
    if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
        errors["location"] = "Pick a valid location on the map."
    if len(address) > 200 or len(landmark) > 120:
        errors["address"] = "Address or landmark is too long."
    if errors:
        raise invalid("Please correct the highlighted fields.", errors)
    suggestion = None
    if ai_suggestion_id:
        # Only the caller's own, recent, server-generated suggestion can be attached — clients cannot invent one.
        suggestion = db.get(AiSuggestion, ai_suggestion_id)
        if suggestion is None or suggestion.user_id != user.id or (utcnow() - suggestion.created_at).total_seconds() > 86_400:
            raise invalid("That AI suggestion is not valid for this report.", {"aiSuggestionId": "Invalid suggestion"})

    now = utcnow()
    report_id = uuid.uuid4()
    path = f"reports/{report_id}/original-{uuid.uuid4().hex[:8]}.{ext}"
    storage = get_storage()
    storage.put(path, photo, content_type)  # upload first; removed again if the DB transaction fails
    try:
        zone = nearest_zone(db, latitude, longitude)
        severity = "medium"  # triaged by staff/supervisors; Phase 3 adds rule-based suggestions
        deadlines = sla.compute_deadlines(sla.find_policy(db, category, severity, None, zone.id if zone else None), now)
        r = Report(
            id=report_id, public_id=next_public_id(db, now), citizen_id=user.id, category=category, description=description,
            latitude=round(latitude, 6), longitude=round(longitude, 6), address=address.strip() or "Address not provided", landmark=landmark.strip(),
            image_path=path, severity=severity, status="open", zone_id=zone.id if zone else None, reported_at=now,
            acknowledgement_deadline=deadlines["acknowledgement"], action_deadline=deadlines["action"], resolution_deadline=deadlines["resolution"],
            original_acknowledgement_deadline=deadlines["acknowledgement"], original_action_deadline=deadlines["action"], original_resolution_deadline=deadlines["resolution"],
        )
        if suggestion:
            r.ai_suggestion_id = suggestion.id
            r.ai_suggested_category = suggestion.suggested_category
            r.ai_explanation = suggestion.explanation
            r.ai_suggested_severity = suggestion.suggested_severity  # tentative; staff triage decides
        r.possible_duplicate_ids = [str(c.report.id) for c in duplicates.find(db, latitude, longitude, category, description)]
        db.add(r)
        db.flush()
        db.add(StatusHistory(report_id=r.id, previous_status=None, new_status="open", changed_by=user.id, changed_by_role="citizen", comment="Complaint submitted by citizen.", created_at=now))
        db.add(Evidence(report_id=r.id, uploaded_by=user.id, uploaded_by_role="citizen", storage_path=path, evidence_type="original", caption="Photo submitted with the complaint", content_type=content_type, size_bytes=len(photo), created_at=now))
        audit(db, user, "report.created", "report", r.id, r, f"{r.public_id} submitted", ai_suggested=r.ai_suggested_category, confirmed=category, possible_duplicates=len(r.possible_duplicate_ids))
        notify(db, user.id, f"{r.public_id} received", "Your complaint has been recorded and is awaiting acknowledgement.", f"/citizen/reports/{r.id}")
        db.commit()
    except Exception:
        db.rollback()
        storage.delete(path)
        raise
    return r


def accept(db: Session, user: Profile, r: Report, routing, note: str) -> Report:
    if user.role != "staff":
        raise forbidden("Only department staff can accept complaints. Supervisors use Assign.")
    ensure_view(user, r, routing)
    if r.status != "open" or r.assigned_staff_id:
        raise invalid("Only unclaimed open complaints can be accepted.")
    now = utcnow()
    r.department_id = user.department_id
    r.assigned_staff_id = user.id
    r.acknowledged_at = now
    db.add(Assignment(report_id=r.id, department_id=user.department_id, assigned_staff_id=user.id, assigned_by=user.id, reason=note.strip() or "Accepted by staff member.", assigned_at=now))
    audit(db, user, "assignment.accepted", "assignment", r.id, r, f"{r.public_id} accepted by {user.display_name}")
    change_status(db, user, r, "assigned", note.strip() or "Complaint acknowledged and accepted by the department.")
    db.commit()
    return r


def assign(db: Session, user: Profile, r: Report, routing, department_id: uuid.UUID, staff_id: uuid.UUID | None, reason: str) -> Report:
    ensure_view(user, r, routing)
    if user.role == "citizen":
        raise forbidden()
    if user.role == "staff":
        if r.assigned_staff_id != user.id:
            raise forbidden("Only the assigned staff member can hand over this complaint.")
        if department_id != user.department_id:
            raise forbidden("Staff can only hand over within their own department. Ask a supervisor to move it.")
    if r.status not in sla.ACTIVE:
        raise invalid("Closed complaints cannot be reassigned.")
    require_min_length(reason, 10, "reason", "Assignment reason")
    dept = db.get(Department, department_id)
    if dept is None or not dept.active:
        raise invalid("Choose an active department.", {"departmentId": "Invalid department"})
    if user.role == "supervisor" and user.department_id and department_id != user.department_id:
        raise forbidden("You can only assign within the department you oversee.")
    staff = db.get(Profile, staff_id) if staff_id else None
    if staff_id and (staff is None or staff.role != "staff" or staff.department_id != department_id):
        raise invalid("Selected staff member does not belong to that department.", {"staffId": "Invalid staff member"})
    if staff and not staff.all_zones and (r.zone_id is None or r.zone_id not in staff.zone_ids):
        raise invalid(f"{staff.display_name} is not authorised for this zone.", {"staffId": "Outside staff zone"})
    if staff and staff.id == r.assigned_staff_id and department_id == r.department_id:
        raise invalid("The complaint is already assigned to that person.", {"staffId": "Already assigned"})

    now = utcnow()
    for a in db.scalars(select(Assignment).where(Assignment.report_id == r.id, Assignment.unassigned_at.is_(None))):
        a.unassigned_at = now
    db.add(Assignment(report_id=r.id, department_id=department_id, assigned_staff_id=staff_id, assigned_by=user.id, reason=reason.strip(), assigned_at=now))
    was_open = r.status == "open"
    r.department_id = department_id
    r.assigned_staff_id = staff_id
    r.updated_at = now
    audit(db, user, "assignment.created" if was_open else "assignment.reassigned", "assignment", r.id, r, f"{r.public_id} → {dept.short_name}{' / ' + staff.display_name if staff else ''}: {reason.strip()}")
    if staff:
        notify(db, staff.id, f"Assigned: {r.public_id}", reason.strip(), f"/staff/reports/{r.id}")
    if was_open:
        r.acknowledged_at = now
        change_status(db, user, r, "assigned", f"Assigned to {dept.short_name}.")
    db.commit()
    return r


def update_status(db: Session, user: Profile, r: Report, routing, new: str, comment: str, resolution_summary: str | None) -> Report:
    if not can_work(user, r, routing):
        raise forbidden("Only the assigned staff member or a supervisor can update this complaint.")
    if new == "assigned" and r.status == "open":
        raise invalid("Use Accept or Assign to take on an open complaint.")
    if new not in TRANSITIONS[r.status]:
        raise invalid(f"Cannot move from {STATUS_LABEL[r.status]} to {STATUS_LABEL[new]}.")
    require_min_length(comment, 10, "comment", "Update comment")
    if new == "resolved":
        require_min_length(resolution_summary, 20, "resolutionSummary", "Resolution summary")
        has_photo = db.scalar(select(func.count()).select_from(Evidence).where(Evidence.report_id == r.id, Evidence.evidence_type == "resolution"))
        if not has_photo:
            raise invalid("Upload at least one resolution photo before closing the complaint.", {"evidence": "Resolution photo required"})
    if new == "rejected":
        require_min_length(comment, 20, "comment", "Rejection reason")
    now = utcnow()
    if new == "in_progress":
        r.action_started_at = now
    if new == "resolved":
        r.resolved_at = now
        r.resolution_summary = (resolution_summary or "").strip()
        r.action_started_at = r.action_started_at or now
    if new == "rejected":
        r.rejection_reason = comment.strip()
        r.acknowledged_at = r.acknowledged_at or now
    change_status(db, user, r, new, comment.strip())
    db.commit()
    return r


def update_severity(db: Session, user: Profile, r: Report, routing, severity: str, reason: str) -> Report:
    if user.role not in ("staff", "supervisor", "administrator") or not can_work(user, r, routing):
        raise forbidden("Only the assigned staff member or a supervisor can triage severity.")
    if r.status not in sla.ACTIVE:
        raise invalid("Severity can only be changed on active complaints.")
    require_min_length(reason, 10, "reason", "Reason")
    if severity == r.severity:
        raise invalid("Severity is already set to that value.")
    old = r.severity
    r.severity = severity
    # Re-derive targets for stages not yet completed; completed stages and recorded breaches stay as they were.
    fresh = sla.compute_deadlines(sla.find_policy(db, r.category, severity, r.department_id, r.zone_id), r.reported_at)
    for kind in sla.KINDS:
        if not sla.stage_completed_at(r, kind) and r.status != "reopened":
            setattr(r, f"{kind}_deadline", fresh[kind])
    r.updated_at = utcnow()
    audit(db, user, "report.severity_changed", "report", r.id, r, f"{r.public_id}: severity {old} → {severity} — {reason.strip()}", previous=old, new=severity)
    db.commit()
    return r


def add_note(db: Session, user: Profile, r: Report, routing, body: str, internal: bool) -> ProgressNote:
    if not can_work(user, r, routing):
        raise forbidden("Only the assigned staff member or a supervisor can add notes.")
    require_min_length(body, 5, "body", "Note")
    note = ProgressNote(report_id=r.id, author_id=user.id, author_role=user.role, body=body.strip(), internal=internal)
    db.add(note)
    r.updated_at = utcnow()
    audit(db, user, "note.internal_added" if internal else "note.public_added", "report", r.id, r, f"{r.public_id}: {'internal' if internal else 'public'} note added")
    if not internal:
        notify(db, r.citizen_id, f"Update on {r.public_id}", body.strip(), f"/citizen/reports/{r.id}")
    db.commit()
    return note


def add_evidence(db: Session, user: Profile, r: Report, routing, data: bytes, content_type: str, ext: str, evidence_type: str, caption: str) -> Evidence:
    if not can_work(user, r, routing):
        raise forbidden("Only the assigned staff member or a supervisor can upload evidence.")
    if evidence_type not in ("progress", "resolution", "other"):
        raise invalid("Choose progress, resolution or other.", {"type": "Invalid evidence type"})
    if r.status in ("resolved", "rejected"):
        raise invalid("Evidence can only be added to active complaints.")
    path = f"reports/{r.id}/{evidence_type}-{uuid.uuid4().hex[:8]}.{ext}"
    storage = get_storage()
    storage.put(path, data, content_type)
    try:
        e = Evidence(report_id=r.id, uploaded_by=user.id, uploaded_by_role=user.role, storage_path=path, evidence_type=evidence_type, caption=(caption.strip() or f"{evidence_type.capitalize()} photo")[:200], content_type=content_type, size_bytes=len(data))
        db.add(e)
        r.updated_at = utcnow()
        audit(db, user, "evidence.uploaded", "evidence", e.id, r, f"{r.public_id}: {evidence_type} photo uploaded")
        db.commit()
    except Exception:
        db.rollback()
        storage.delete(path)
        raise
    return e


def request_extension(db: Session, user: Profile, r: Report, routing, kind: str, requested: datetime, reason: str) -> DeadlineExtension:
    if user.role != "staff" or not can_work(user, r, routing) or r.assigned_staff_id != user.id:
        raise forbidden("Only the assigned staff member can request an extension.")
    if r.status not in sla.ACTIVE:
        raise invalid("Extensions apply to active complaints only.")
    if db.scalar(select(func.count()).select_from(DeadlineExtension).where(DeadlineExtension.report_id == r.id, DeadlineExtension.status == "pending")):
        raise invalid("An extension request is already pending for this complaint.")
    require_min_length(reason, 20, "reason", "Extension reason")
    if requested.tzinfo is None:
        raise invalid("Requested deadline must include a timezone.", {"requestedDeadline": "Timezone required"})
    if requested <= r.deadline(kind):
        raise invalid("Requested deadline must be later than the current one.", {"requestedDeadline": "Must be later than current deadline"})
    x = DeadlineExtension(report_id=r.id, deadline_kind=kind, current_deadline=r.deadline(kind), requested_deadline=requested, requested_by=user.id, reason=reason.strip())
    db.add(x)
    db.flush()
    audit(db, user, "extension.requested", "extension", x.id, r, f"{r.public_id}: {kind} extension requested")
    notify_supervisors(db, f"Extension request: {r.public_id}", reason.strip(), f"/supervisor/reports/{r.id}")
    db.commit()
    return x


def review_extension(db: Session, user: Profile, x: DeadlineExtension, routing, decision: str, reason: str) -> None:
    r = get_report(db, x.report_id, lock=True)
    ensure_view(user, r, routing)
    require_min_length(reason, 10, "reason", "Decision reason")
    if x.status != "pending":
        raise invalid("This request has already been reviewed.")
    now = utcnow()
    x.status = decision
    x.reviewed_by = user.id
    x.review_reason = reason.strip()
    x.reviewed_at = now
    if decision == "approved":
        # Only the forward-looking target moves; escalations already raised remain on record.
        setattr(r, f"{x.deadline_kind}_deadline", x.requested_deadline)
        r.updated_at = now
    audit(db, user, f"extension.{decision}", "extension", x.id, r, f"{r.public_id}: {x.deadline_kind} extension {decision} — {reason.strip()}")
    notify(db, x.requested_by, f"Extension {decision}: {r.public_id}", reason.strip(), f"/staff/reports/{r.id}")
    db.commit()


def supervisor_set_deadline(db: Session, user: Profile, r: Report, routing, kind: str, new_deadline: datetime, reason: str) -> DeadlineExtension:
    ensure_view(user, r, routing)
    if r.status not in sla.ACTIVE:
        raise invalid("Deadlines can only be changed on active complaints.")
    require_min_length(reason, 10, "reason", "Reason")
    if new_deadline.tzinfo is None or new_deadline <= utcnow():
        raise invalid("Choose a future date and time.", {"newDeadline": "Must be in the future"})
    if new_deadline <= r.deadline(kind):
        raise invalid("An extension must move the deadline later.", {"newDeadline": "Must be later than the current deadline"})
    now = utcnow()
    x = DeadlineExtension(report_id=r.id, deadline_kind=kind, current_deadline=r.deadline(kind), requested_deadline=new_deadline, requested_by=user.id, reason=reason.strip(), status="approved", reviewed_by=user.id, review_reason="Set directly by supervisor.", reviewed_at=now)
    db.add(x)
    setattr(r, f"{kind}_deadline", new_deadline)
    r.updated_at = now
    db.flush()
    audit(db, user, "deadline.changed", "extension", x.id, r, f"{r.public_id}: {kind} deadline set to {new_deadline.isoformat()} — {reason.strip()}")
    db.commit()
    return x


def review_escalation(db: Session, user: Profile, e: EscalationEvent, routing, status: str, action_taken: str) -> None:
    r = get_report(db, e.report_id)
    ensure_view(user, r, routing)
    require_min_length(action_taken, 10, "actionTaken", "Action taken")
    if e.status == "closed":
        raise invalid("This escalation is already closed.")
    e.status = status
    e.action_taken = action_taken.strip()
    e.reviewed_by = user.id
    e.reviewed_at = utcnow()
    audit(db, user, "escalation.reviewed", "escalation", e.id, r, f"{r.public_id}: escalation marked {status.replace('_', ' ')} — {action_taken.strip()}")
    db.commit()


def submit_feedback(db: Session, user: Profile, r: Report, rating: int, comment: str, reopen: bool) -> Feedback:
    if r.citizen_id != user.id:
        raise forbidden("You can only give feedback on your own complaints.")
    if r.status != "resolved":
        raise invalid("Feedback can be given once the complaint is marked resolved.")
    if reopen:
        require_min_length(comment, 15, "comment", "Please explain why the issue is unresolved — your reason")
        if db.scalar(select(func.count()).select_from(Feedback).where(Feedback.report_id == r.id, Feedback.reopen_decision == "pending")):
            raise invalid("A reopen request is already awaiting supervisor review.")
    elif db.scalar(select(func.count()).select_from(Feedback).where(Feedback.report_id == r.id, Feedback.citizen_id == user.id, Feedback.reopen_requested.is_(False))):
        raise invalid("You have already rated this resolution.")
    f = Feedback(report_id=r.id, citizen_id=user.id, rating=rating, comment=comment.strip(), reopen_requested=reopen, reopen_decision="pending" if reopen else None)
    db.add(f)
    db.flush()
    audit(db, user, "feedback.reopen_requested" if reopen else "feedback.submitted", "feedback", f.id, r, f"{r.public_id}: {'reopen requested' if reopen else f'rated {rating}/5'}")
    if reopen:
        notify_supervisors(db, f"Disputed resolution: {r.public_id}", comment.strip(), f"/supervisor/reports/{r.id}")
    db.commit()
    return f


def decide_reopen(db: Session, user: Profile, f: Feedback, routing, decision: str, reason: str) -> None:
    r = get_report(db, f.report_id, lock=True)
    ensure_view(user, r, routing)
    require_min_length(reason, 10, "reason", "Decision reason")
    if f.reopen_decision != "pending":
        raise invalid("This dispute has already been decided.")
    f.reopen_decision = decision
    f.decision_reason = reason.strip()
    f.decided_by = user.id
    audit(db, user, f"dispute.{decision}", "feedback", f.id, r, f"{r.public_id}: reopen {decision} — {reason.strip()}")
    if decision == "approved" and r.status == "resolved":
        fresh = sla.compute_deadlines(sla.find_policy(db, r.category, r.severity, r.department_id, r.zone_id), utcnow())
        r.action_deadline = fresh["action"]
        r.resolution_deadline = fresh["resolution"]
        r.action_started_at = None
        r.resolved_at = None
        change_status(db, user, r, "reopened", f"Reopened after review: {reason.strip()}")
        notify(db, r.assigned_staff_id, f"Reopened: {r.public_id}", reason.strip(), f"/staff/reports/{r.id}")
    else:
        notify(db, r.citizen_id, f"Reopen request reviewed: {r.public_id}", f"Decision: {decision}. {reason.strip()}", f"/citizen/reports/{r.id}")
    db.commit()
