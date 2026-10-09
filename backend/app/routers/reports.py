import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy import select

from ..auth import DB, Citizen, StaffOrAbove
from ..config import get_settings
from ..errors import forbidden
from ..filters import ReportFilters, report_filters
from ..models import Report
from ..permissions import ensure_view, routing_map, scope_query
from ..services import rate_limit
from ..services import reports as svc
from ..services.uploads import read_image
from .. import schemas as S

router = APIRouter(prefix="/api", tags=["reports"])


# ---------------------------------------------------------------- citizen


@router.post("/reports", response_model=S.ReportOut, status_code=201)
async def create_report(
    user: Citizen,
    db: DB,
    category: Annotated[str, Form(max_length=20)],
    description: Annotated[str, Form(max_length=1000)],
    latitude: Annotated[float, Form()],
    longitude: Annotated[float, Form()],
    address: Annotated[str, Form(max_length=200)] = "",
    landmark: Annotated[str, Form(max_length=120)] = "",
    ai_suggestion_id: Annotated[uuid.UUID | None, Form(alias="aiSuggestionId")] = None,
    photo: UploadFile | None = File(default=None),
):
    rate_limit.check(f"report:{user.id}", get_settings().report_rate_limit_per_hour)
    data, ctype, ext = await read_image(photo)
    r = svc.create_report(db, user, category=category, description=description, latitude=latitude, longitude=longitude, address=address, landmark=landmark, photo=data, content_type=ctype, ext=ext, ai_suggestion_id=ai_suggestion_id)
    return svc.report_out(r)


@router.get("/reports/mine", response_model=list[S.ReportOut])
def my_reports(user: Citizen, db: DB):
    return [svc.report_out(r) for r in db.scalars(select(Report).where(Report.citizen_id == user.id).order_by(Report.reported_at.desc()))]


@router.get("/reports/mine/{report_id}", response_model=S.CitizenBundleOut)
def my_report(report_id: uuid.UUID, user: Citizen, db: DB):
    r = svc.get_report(db, report_id)
    if r.citizen_id != user.id:
        raise forbidden("You can only open complaints you submitted.")
    return svc.citizen_bundle(db, r)


@router.post("/reports/{report_id}/feedback", response_model=S.FeedbackOut, status_code=201)
def feedback(report_id: uuid.UUID, body: S.FeedbackIn, user: Citizen, db: DB):
    return svc.submit_feedback(db, user, svc.get_report(db, report_id), body.rating, body.comment, reopen=False)


@router.post("/reports/{report_id}/reopen-request", response_model=S.FeedbackOut, status_code=201)
def reopen_request(report_id: uuid.UUID, body: S.ReopenRequestIn, user: Citizen, db: DB):
    return svc.submit_feedback(db, user, svc.get_report(db, report_id), body.rating, body.comment, reopen=True)


# ---------------------------------------------------------------- staff / supervisor


@router.get("/reports", response_model=list[S.ScopedReportRowOut])
def scoped_reports(user: StaffOrAbove, db: DB, f: Annotated[ReportFilters, Depends(report_filters)]):
    routing = routing_map(db)
    rows = db.scalars(f.apply(scope_query(select(Report), user, routing), routing)).all()
    return svc.rows_out(db, f.post_filter(list(rows)))


@router.get("/assignments/mine", response_model=list[S.ScopedReportRowOut])
def my_assignments(user: StaffOrAbove, db: DB):
    rows = db.scalars(select(Report).where(Report.assigned_staff_id == user.id).order_by(Report.updated_at.desc())).all()
    return svc.rows_out(db, list(rows))


@router.get("/reports/{report_id}", response_model=S.WorkBundleOut)
def work_detail(report_id: uuid.UUID, user: StaffOrAbove, db: DB):
    r = svc.get_report(db, report_id)
    ensure_view(user, r, routing_map(db))
    return svc.work_bundle(db, r)


@router.get("/reports/{report_id}/history", response_model=list[S.TimelineEntryOut])
def history(report_id: uuid.UUID, user: StaffOrAbove, db: DB):
    r = svc.get_report(db, report_id)
    ensure_view(user, r, routing_map(db))
    return svc.build_timeline(db, r, "internal")


@router.get("/reports/{report_id}/evidence", response_model=list[S.EvidenceOut])
def list_evidence(report_id: uuid.UUID, user: StaffOrAbove, db: DB):
    r = svc.get_report(db, report_id)
    ensure_view(user, r, routing_map(db))
    return svc.work_bundle(db, r).evidence


@router.post("/reports/{report_id}/accept", response_model=S.ReportOut)
def accept(report_id: uuid.UUID, body: S.AcceptIn, user: StaffOrAbove, db: DB):
    return svc.report_out(svc.accept(db, user, svc.get_report(db, report_id, lock=True), routing_map(db), body.note))


@router.post("/reports/{report_id}/assign", response_model=S.ReportOut)
@router.post("/reports/{report_id}/reassign", response_model=S.ReportOut)
def assign(report_id: uuid.UUID, body: S.AssignIn, user: StaffOrAbove, db: DB):
    r = svc.get_report(db, report_id, lock=True)
    return svc.report_out(svc.assign(db, user, r, routing_map(db), body.department_id, body.staff_id, body.reason))


@router.post("/reports/{report_id}/status", response_model=S.ReportOut)
def update_status(report_id: uuid.UUID, body: S.StatusUpdateIn, user: StaffOrAbove, db: DB):
    r = svc.get_report(db, report_id, lock=True)
    return svc.report_out(svc.update_status(db, user, r, routing_map(db), body.new_status, body.comment, body.resolution_summary))


@router.patch("/reports/{report_id}", response_model=S.ReportOut)
def triage(report_id: uuid.UUID, body: S.SeverityUpdateIn, user: StaffOrAbove, db: DB):
    """Only severity can be changed here (with a reason). Status, assignment and deadlines have dedicated endpoints."""
    r = svc.get_report(db, report_id, lock=True)
    return svc.report_out(svc.update_severity(db, user, r, routing_map(db), body.severity, body.reason))


@router.post("/reports/{report_id}/notes", response_model=S.ProgressNoteOut, status_code=201)
def add_note(report_id: uuid.UUID, body: S.NoteIn, user: StaffOrAbove, db: DB):
    return svc.add_note(db, user, svc.get_report(db, report_id), routing_map(db), body.body, body.internal)


@router.post("/reports/{report_id}/evidence", response_model=S.EvidenceOut, status_code=201)
async def add_evidence(
    report_id: uuid.UUID,
    user: StaffOrAbove,
    db: DB,
    evidence_type: Annotated[str, Form(alias="type", max_length=20)],
    caption: Annotated[str, Form(max_length=200)] = "",
    photo: UploadFile | None = File(default=None),
):
    rate_limit.check(f"upload:{user.id}", get_settings().upload_rate_limit_per_hour)
    r = svc.get_report(db, report_id)
    ensure_view(user, r, routing_map(db))
    data, ctype, ext = await read_image(photo)
    e = svc.add_evidence(db, user, r, routing_map(db), data, ctype, ext, evidence_type, caption)
    return svc.evidence_out([e], public=False, demo=False)[0]


@router.post("/reports/{report_id}/extension-requests", response_model=S.ExtensionOut, status_code=201)
def request_extension(report_id: uuid.UUID, body: S.ExtensionRequestIn, user: StaffOrAbove, db: DB):
    r = svc.get_report(db, report_id)
    return svc.request_extension(db, user, r, routing_map(db), body.deadline_kind, body.requested_deadline, body.reason)
