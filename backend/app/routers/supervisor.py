import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select

from ..auth import DB, SupervisorOrAdmin
from ..errors import not_found
from ..filters import ReportFilters, report_filters
from ..models import AuditLog, DeadlineExtension, EscalationEvent, Feedback, Profile, Report
from ..permissions import can_view_report, routing_map, scope_query
from ..services import analytics
from ..services import reports as svc
from .. import schemas as S

router = APIRouter(prefix="/api/supervisor", tags=["supervisor"])


def _scoped(db, user, f: ReportFilters | None = None) -> list[Report]:
    routing = routing_map(db)
    stmt = scope_query(select(Report), user, routing)
    if f:
        return f.post_filter(list(db.scalars(f.apply(stmt, routing)).all()))
    return list(db.scalars(stmt).all())


@router.get("/overview", response_model=S.SummaryStatsOut)
def overview(user: SupervisorOrAdmin, db: DB, f: Annotated[ReportFilters, Depends(report_filters)]):
    return analytics.summarize(db, _scoped(db, user, f))


@router.get("/overdue", response_model=list[S.ScopedReportRowOut])
def overdue(user: SupervisorOrAdmin, db: DB, f: Annotated[ReportFilters, Depends(report_filters)]):
    f.overdue_only = True
    return svc.rows_out(db, _scoped(db, user, f))


@router.get("/escalations", response_model=list[S.EscalationRowOut])
def escalations(user: SupervisorOrAdmin, db: DB):
    routing = routing_map(db)
    rows = db.execute(select(EscalationEvent, Report).join(Report, Report.id == EscalationEvent.report_id).order_by(EscalationEvent.triggered_at.desc()).limit(1000)).all()
    names = {p.id: p.display_name for p in db.scalars(select(Profile).where(Profile.id.in_({e.reviewed_by for e, _ in rows if e.reviewed_by})))}
    return [
        S.EscalationRowOut(**S.EscalationOut.model_validate(e).model_dump(), report=svc.report_out(r), reviewed_by_name=names.get(e.reviewed_by) if e.reviewed_by else None)
        for e, r in rows
        if can_view_report(user, r, routing)
    ]


@router.post("/escalations/{event_id}/review", status_code=204)
def review_escalation(event_id: uuid.UUID, body: S.EscalationReviewIn, user: SupervisorOrAdmin, db: DB):
    e = db.get(EscalationEvent, event_id)
    if e is None:
        raise not_found()
    svc.review_escalation(db, user, e, routing_map(db), body.status, body.action_taken)


@router.get("/extensions", response_model=list[S.ExtensionRowOut])
def extensions(user: SupervisorOrAdmin, db: DB, status: Literal["pending", "approved", "rejected"] | None = None):
    routing = routing_map(db)
    stmt = select(DeadlineExtension, Report).join(Report, Report.id == DeadlineExtension.report_id).order_by(DeadlineExtension.created_at.desc())
    if status:
        stmt = stmt.where(DeadlineExtension.status == status)
    rows = db.execute(stmt.limit(1000)).all()
    ids = {x.requested_by for x, _ in rows} | {x.reviewed_by for x, _ in rows if x.reviewed_by}
    names = {p.id: p.display_name for p in db.scalars(select(Profile).where(Profile.id.in_(ids)))} if ids else {}
    return [
        S.ExtensionRowOut(**S.ExtensionOut.model_validate(x).model_dump(), report=svc.report_out(r), requested_by_name=names.get(x.requested_by, "Unknown"), reviewed_by_name=names.get(x.reviewed_by) if x.reviewed_by else None)
        for x, r in rows
        if can_view_report(user, r, routing)
    ]


@router.post("/extensions/{extension_id}/review", status_code=204)
def review_extension(extension_id: uuid.UUID, body: S.ExtensionReviewIn, user: SupervisorOrAdmin, db: DB):
    x = db.get(DeadlineExtension, extension_id)
    if x is None:
        raise not_found()
    svc.review_extension(db, user, x, routing_map(db), body.decision, body.reason)


@router.post("/reports/{report_id}/deadline-extension", response_model=S.ExtensionOut, status_code=201)
def set_deadline(report_id: uuid.UUID, body: S.SupervisorDeadlineIn, user: SupervisorOrAdmin, db: DB):
    r = svc.get_report(db, report_id, lock=True)
    return svc.supervisor_set_deadline(db, user, r, routing_map(db), body.deadline_kind, body.new_deadline, body.reason)


@router.get("/disputes", response_model=list[S.DisputeRowOut])
def disputes(user: SupervisorOrAdmin, db: DB):
    routing = routing_map(db)
    rows = db.execute(select(Feedback, Report).join(Report, Report.id == Feedback.report_id).where(Feedback.reopen_requested.is_(True)).order_by(Feedback.created_at.desc()).limit(1000)).all()
    return [S.DisputeRowOut(**S.FeedbackOut.model_validate(fb).model_dump(), report=svc.report_out(r)) for fb, r in rows if can_view_report(user, r, routing)]


@router.post("/disputes/{feedback_id}/decision", status_code=204)
def decide(feedback_id: uuid.UUID, body: S.DisputeDecisionIn, user: SupervisorOrAdmin, db: DB):
    fb = db.get(Feedback, feedback_id)
    if fb is None or not fb.reopen_requested:
        raise not_found()
    svc.decide_reopen(db, user, fb, routing_map(db), body.decision, body.reason)


@router.get("/audit", response_model=list[S.AuditOut])
def audit_log(
    user: SupervisorOrAdmin,
    db: DB,
    report_id: uuid.UUID | None = Query(default=None, alias="reportId"),
    entity_type: str | None = Query(default=None, alias="entityType", max_length=30),
    limit: int = Query(default=500, ge=1, le=2000),
):
    stmt = select(AuditLog).order_by(AuditLog.created_at.desc())
    if report_id:
        stmt = stmt.where(AuditLog.report_id == report_id)
    if entity_type:
        stmt = stmt.where(AuditLog.entity_type == entity_type)
    if user.role != "administrator":
        visible = scope_query(select(Report.id), user, routing_map(db))
        stmt = stmt.where(AuditLog.report_id.is_(None) | AuditLog.report_id.in_(visible))
    rows = db.scalars(stmt.limit(limit)).all()
    names = {p.id: p.display_name for p in db.scalars(select(Profile).where(Profile.id.in_({a.actor_id for a in rows if a.actor_id})))}
    return [
        S.AuditOut(id=a.id, actor_id=str(a.actor_id) if a.actor_id else "system", actor_role=a.actor_role, actor_name=names.get(a.actor_id) if a.actor_id else "Automated deadline check", action=a.action, entity_type=a.entity_type, entity_id=a.entity_id, report_id=a.report_id, summary=a.summary, created_at=a.created_at)  # type: ignore[arg-type]
        for a in rows
    ]
