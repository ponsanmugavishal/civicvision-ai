"""Pydantic request/response models. JSON uses camelCase to match the frontend TypeScript types."""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

Role = Literal["citizen", "staff", "supervisor", "administrator"]
Category = Literal["garbage", "drainage", "pothole", "other"]
Status = Literal["open", "assigned", "in_progress", "resolved", "rejected", "reopened"]
Severity = Literal["low", "medium", "high", "critical"]
DeadlineKind = Literal["acknowledgement", "action", "resolution"]
EvidenceType = Literal["original", "progress", "resolution", "other"]
EscalationStatus = Literal["open", "under_review", "actioned", "closed"]


class Camel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


# ---------------------------------------------------------------- directory / profile


class DepartmentOut(Camel):
    id: uuid.UUID
    name: str
    short_name: str
    description: str
    categories: list[Category]
    active: bool


class ZoneOut(Camel):
    id: uuid.UUID
    name: str
    description: str
    center: tuple[float, float]


class UserProfileOut(Camel):
    id: uuid.UUID
    display_name: str
    role: Role
    department_id: uuid.UUID | None
    zone_ids: list[uuid.UUID]
    all_zones: bool
    email: str | None = None
    phone: str | None = None
    title: str | None = None
    is_demo: bool = False


class MeOut(Camel):
    profile: UserProfileOut
    permissions: list[str]


class SlaPolicyOut(Camel):
    id: uuid.UUID
    category: Category
    severity: Severity
    acknowledgement_hours: float
    action_hours: float
    resolution_hours: float
    enabled: bool


# ---------------------------------------------------------------- reports


class Deadlines(Camel):
    acknowledgement: datetime
    action: datetime
    resolution: datetime


class PublicReportOut(Camel):
    id: uuid.UUID
    public_id: str
    category: Category
    description: str
    latitude: float
    longitude: float
    address: str
    landmark: str
    severity: Severity
    status: Status
    department_id: uuid.UUID | None
    zone_id: uuid.UUID | None
    reported_at: datetime
    updated_at: datetime
    deadlines: Deadlines
    acknowledged_at: datetime | None
    action_started_at: datetime | None
    resolved_at: datetime | None
    resolution_summary: str | None
    is_demo: bool


class ReportOut(PublicReportOut):
    citizen_id: uuid.UUID
    assigned_staff_id: uuid.UUID | None
    original_deadlines: Deadlines
    rejection_reason: str | None
    ai_suggested_category: Category | None
    ai_explanation: str | None
    ai_suggested_severity: Severity | None = None
    possible_duplicate_ids: list[str] = []


class ScopedReportRowOut(ReportOut):
    department_name: str | None
    assigned_staff_name: str | None
    zone_name: str | None
    pending_extension: bool
    open_escalations: int


class EvidenceOut(Camel):
    id: uuid.UUID
    report_id: uuid.UUID
    uploaded_by: str
    uploaded_by_role: Role
    url: str
    type: EvidenceType
    caption: str
    is_placeholder: bool = False
    created_at: datetime


class TimelineEntryOut(Camel):
    id: str
    kind: Literal["status", "evidence", "note", "assignment", "extension", "escalation", "feedback"]
    title: str
    detail: str
    actor_label: str
    created_at: datetime
    status: Status | None = None
    internal: bool | None = None


class StatusHistoryOut(Camel):
    id: uuid.UUID
    report_id: uuid.UUID
    previous_status: Status | None
    new_status: Status
    changed_by: uuid.UUID | None
    changed_by_role: Role
    comment: str
    created_at: datetime


class ProgressNoteOut(Camel):
    id: uuid.UUID
    report_id: uuid.UUID
    author_id: uuid.UUID
    author_role: Role
    body: str
    internal: bool
    created_at: datetime


class AssignmentOut(Camel):
    id: uuid.UUID
    report_id: uuid.UUID
    department_id: uuid.UUID
    assigned_staff_id: uuid.UUID | None
    assigned_by: uuid.UUID
    reason: str
    assigned_at: datetime
    unassigned_at: datetime | None


class ExtensionOut(Camel):
    id: uuid.UUID
    report_id: uuid.UUID
    deadline_kind: DeadlineKind
    current_deadline: datetime
    requested_deadline: datetime
    requested_by: uuid.UUID
    reason: str
    status: Literal["pending", "approved", "rejected"]
    reviewed_by: uuid.UUID | None
    review_reason: str | None
    created_at: datetime
    reviewed_at: datetime | None


class EscalationOut(Camel):
    id: uuid.UUID
    report_id: uuid.UUID
    level: int
    reason: str
    deadline_kind: DeadlineKind
    deadline_at: datetime
    triggered_at: datetime
    notified_role: Role
    action_taken: str | None
    status: EscalationStatus
    reviewed_by: uuid.UUID | None
    reviewed_at: datetime | None


class FeedbackOut(Camel):
    id: uuid.UUID
    report_id: uuid.UUID
    citizen_id: uuid.UUID
    rating: int
    comment: str
    reopen_requested: bool
    reopen_decision: Literal["pending", "approved", "declined"] | None
    decision_reason: str | None
    decided_by: uuid.UUID | None
    created_at: datetime


class ReporterOut(Camel):
    display_name: str
    email: str | None
    phone: str | None


class PublicBundleOut(Camel):
    report: PublicReportOut
    timeline: list[TimelineEntryOut]
    evidence: list[EvidenceOut]


class CitizenBundleOut(Camel):
    report: ReportOut
    timeline: list[TimelineEntryOut]
    evidence: list[EvidenceOut]
    feedback: list[FeedbackOut]


class WorkBundleOut(Camel):
    report: ReportOut
    history: list[StatusHistoryOut]
    evidence: list[EvidenceOut]
    notes: list[ProgressNoteOut]
    feedback: list[FeedbackOut]
    assignments: list[AssignmentOut]
    extensions: list[ExtensionOut]
    escalations: list[EscalationOut]
    timeline: list[TimelineEntryOut]
    reporter: ReporterOut | None


class ExtensionRowOut(ExtensionOut):
    report: ReportOut
    requested_by_name: str
    reviewed_by_name: str | None


class EscalationRowOut(EscalationOut):
    report: ReportOut
    reviewed_by_name: str | None


class DisputeRowOut(FeedbackOut):
    report: ReportOut


class AuditOut(Camel):
    id: uuid.UUID
    actor_id: str
    actor_role: Role
    actor_name: str | None
    action: str
    entity_type: str
    entity_id: str
    report_id: uuid.UUID | None
    summary: str
    created_at: datetime


class NotificationOut(Camel):
    id: uuid.UUID
    user_id: uuid.UUID
    title: str
    body: str
    link: str | None
    read: bool
    created_at: datetime
    channel: Literal["in_app"] = "in_app"


# ---------------------------------------------------------------- AI & duplicates


class AiSuggestionOut(Camel):
    id: uuid.UUID
    suggested_category: Category
    explanation: str
    visible_indicators: list[str]
    uncertainty_warning: str | None
    suggested_severity: Severity | None
    model: str


class AiClassifyOut(Camel):
    available: bool
    message: str
    suggestion: AiSuggestionOut | None = None


class DuplicateCandidateOut(Camel):
    id: uuid.UUID
    public_id: str
    category: Category
    status: Status
    distance_m: float
    reported_at: datetime
    description: str
    text_similarity: float


# ---------------------------------------------------------------- analytics


class SummaryStatsOut(Camel):
    total: int
    active: int
    resolved: int
    rejected: int
    overdue: int
    approaching: int
    critical_active: int
    by_status: dict[str, int]
    by_category: dict[str, int]
    by_severity: dict[str, int]
    avg_resolution_hours: float | None
    resolved_on_time_rate: float | None
    open_escalations: int
    pending_extensions: int
    pending_disputes: int


class DepartmentStatsOut(Camel):
    department_id: uuid.UUID
    name: str
    total: int
    active: int
    resolved: int
    overdue: int
    critical: int
    avg_resolution_hours: float | None
    on_time_rate: float | None


class TrendPointOut(Camel):
    week_start: datetime
    reported: int
    resolved: int


class HotspotOut(Camel):
    id: str
    latitude: float
    longitude: float
    count: int
    active_count: int
    categories: dict[str, int]
    report_ids: list[uuid.UUID]
    public_ids: list[str]
    label: str


# ---------------------------------------------------------------- inputs


class AcceptIn(Camel):
    note: str = Field(default="", max_length=500)


class AssignIn(Camel):
    department_id: uuid.UUID
    staff_id: uuid.UUID | None = None
    reason: str = Field(max_length=500)


class StatusUpdateIn(Camel):
    new_status: Status
    comment: str = Field(max_length=1000)
    resolution_summary: str | None = Field(default=None, max_length=1000)


class SeverityUpdateIn(Camel):
    severity: Severity
    reason: str = Field(max_length=500)


class NoteIn(Camel):
    body: str = Field(max_length=2000)
    internal: bool = False


class ExtensionRequestIn(Camel):
    deadline_kind: DeadlineKind
    requested_deadline: datetime
    reason: str = Field(max_length=1000)


class SupervisorDeadlineIn(Camel):
    deadline_kind: DeadlineKind
    new_deadline: datetime
    reason: str = Field(max_length=1000)


class ExtensionReviewIn(Camel):
    decision: Literal["approved", "rejected"]
    reason: str = Field(max_length=1000)


class EscalationReviewIn(Camel):
    status: Literal["under_review", "actioned", "closed"]
    action_taken: str = Field(max_length=1000)


class DisputeDecisionIn(Camel):
    decision: Literal["approved", "declined"]
    reason: str = Field(max_length=1000)


class FeedbackIn(Camel):
    rating: int = Field(ge=1, le=5)
    comment: str = Field(default="", max_length=600)


class ReopenRequestIn(Camel):
    rating: int = Field(default=1, ge=1, le=5)
    comment: str = Field(max_length=600)


class MarkReadIn(Camel):
    ids: list[uuid.UUID] = Field(default_factory=list, max_length=200)
    all: bool = False


class AdminUserUpdateIn(Camel):
    role: Role
    department_id: uuid.UUID | None = None
    zone_ids: list[uuid.UUID] = Field(default_factory=list)
    all_zones: bool = False
    title: str | None = Field(default=None, max_length=120)


class DevLoginIn(Camel):
    email: str = Field(max_length=320)


class DevLoginOut(Camel):
    access_token: str
    profile: UserProfileOut
