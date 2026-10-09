"""SQLAlchemy ORM models.

These mirror `supabase/migrations/*.sql`, which are the source of truth for the production schema
(constraints, RLS policies, triggers). The ORM metadata is also used to create a throwaway schema for
tests and local SQLite development.
"""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Boolean, CheckConstraint, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base, UTCDateTime, utcnow

JsonType = JSON().with_variant(JSONB(), "postgresql")

ROLES = ("citizen", "staff", "supervisor", "administrator")
CATEGORIES = ("garbage", "drainage", "pothole", "other")
STATUSES = ("open", "assigned", "in_progress", "resolved", "rejected", "reopened")
SEVERITIES = ("low", "medium", "high", "critical")
DEADLINE_KINDS = ("acknowledgement", "action", "resolution")
EVIDENCE_TYPES = ("original", "progress", "resolution", "other")
ESCALATION_STATUSES = ("open", "under_review", "actioned", "closed")
EXTENSION_STATUSES = ("pending", "approved", "rejected")


def _in(col: str, values: tuple[str, ...]) -> str:
    return f"{col} IN ({', '.join(repr(v) for v in values)})"


def _id() -> Mapped[uuid.UUID]:
    return mapped_column(Uuid, primary_key=True, default=uuid.uuid4)


def _created() -> Mapped[datetime]:
    return mapped_column(UTCDateTime, default=utcnow, nullable=False)


def _updated() -> Mapped[datetime]:
    return mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow, nullable=False)


class Department(Base):
    __tablename__ = "departments"
    id: Mapped[uuid.UUID] = _id()
    slug: Mapped[str] = mapped_column(String(64), unique=True)
    name: Mapped[str] = mapped_column(String(160))
    short_name: Mapped[str] = mapped_column(String(60))
    description: Mapped[str] = mapped_column(Text, default="")
    categories: Mapped[list[str]] = mapped_column(JsonType, default=list)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = _created()
    updated_at: Mapped[datetime] = _updated()


class Zone(Base):
    __tablename__ = "zones"
    id: Mapped[uuid.UUID] = _id()
    slug: Mapped[str] = mapped_column(String(64), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text, default="")
    center_lat: Mapped[float] = mapped_column(Float)
    center_lng: Mapped[float] = mapped_column(Float)
    created_at: Mapped[datetime] = _created()
    updated_at: Mapped[datetime] = _updated()


class Profile(Base):
    """One row per Supabase auth user. `id` equals `auth.users.id`."""

    __tablename__ = "profiles"
    __table_args__ = (CheckConstraint(_in("role", ROLES), name="profiles_role_check"),)
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    display_name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(40), nullable=True)
    title: Mapped[str | None] = mapped_column(String(120), nullable=True)
    role: Mapped[str] = mapped_column(String(20), default="citizen")
    department_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("departments.id", ondelete="SET NULL"), nullable=True)
    # Explicit flag rather than "empty list means everything", so a missing scope never widens access.
    all_zones: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = _created()
    updated_at: Mapped[datetime] = _updated()

    zones: Mapped[list[Zone]] = relationship(secondary="profile_zones", lazy="selectin")

    @property
    def zone_ids(self) -> list[uuid.UUID]:
        return [z.id for z in self.zones]


class ProfileZone(Base):
    __tablename__ = "profile_zones"
    profile_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), primary_key=True)
    zone_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("zones.id", ondelete="CASCADE"), primary_key=True)


class Report(Base):
    __tablename__ = "reports"
    __table_args__ = (
        CheckConstraint(_in("category", CATEGORIES), name="reports_category_check"),
        CheckConstraint(_in("status", STATUSES), name="reports_status_check"),
        CheckConstraint(_in("severity", SEVERITIES), name="reports_severity_check"),
        CheckConstraint("latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180", name="reports_coords_check"),
        Index("reports_status_idx", "status"),
        Index("reports_category_idx", "category"),
        Index("reports_department_idx", "department_id"),
        Index("reports_zone_idx", "zone_id"),
        Index("reports_assigned_staff_idx", "assigned_staff_id"),
        Index("reports_citizen_idx", "citizen_id"),
        Index("reports_reported_at_idx", "reported_at"),
        Index("reports_lat_lng_idx", "latitude", "longitude"),
    )
    id: Mapped[uuid.UUID] = _id()
    public_id: Mapped[str] = mapped_column(String(32), unique=True)
    citizen_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id", ondelete="RESTRICT"))
    category: Mapped[str] = mapped_column(String(20))
    description: Mapped[str] = mapped_column(Text)
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    address: Mapped[str] = mapped_column(String(200), default="")
    landmark: Mapped[str] = mapped_column(String(120), default="")
    image_path: Mapped[str | None] = mapped_column(String(300), nullable=True)
    ai_suggested_category: Mapped[str | None] = mapped_column(String(20), nullable=True)
    ai_explanation: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_suggested_severity: Mapped[str | None] = mapped_column(String(10), nullable=True)
    ai_suggestion_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("ai_suggestions.id"), nullable=True)
    # Reports the duplicate check flagged at submission time. Informational only — never used to discard a report.
    possible_duplicate_ids: Mapped[list[str]] = mapped_column(JsonType, default=list)
    severity: Mapped[str] = mapped_column(String(10), default="medium")
    status: Mapped[str] = mapped_column(String(20), default="open")
    department_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("departments.id"), nullable=True)
    zone_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("zones.id"), nullable=True)
    assigned_staff_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("profiles.id"), nullable=True)
    reported_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    acknowledgement_deadline: Mapped[datetime] = mapped_column(UTCDateTime)
    action_deadline: Mapped[datetime] = mapped_column(UTCDateTime)
    resolution_deadline: Mapped[datetime] = mapped_column(UTCDateTime)
    original_acknowledgement_deadline: Mapped[datetime] = mapped_column(UTCDateTime)
    original_action_deadline: Mapped[datetime] = mapped_column(UTCDateTime)
    original_resolution_deadline: Mapped[datetime] = mapped_column(UTCDateTime)
    acknowledged_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    action_started_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    resolution_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = _created()
    updated_at: Mapped[datetime] = _updated()

    def deadline(self, kind: str) -> datetime:
        return getattr(self, f"{kind}_deadline")

    def original_deadline(self, kind: str) -> datetime:
        return getattr(self, f"original_{kind}_deadline")


class AiSuggestion(Base):
    """Output of the pretrained image model, stored separately from the citizen-confirmed category."""

    __tablename__ = "ai_suggestions"
    __table_args__ = (
        CheckConstraint(_in("suggested_category", CATEGORIES), name="ai_category_check"),
        Index("ai_suggestions_user_idx", "user_id", "created_at"),
    )
    id: Mapped[uuid.UUID] = _id()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"))
    model: Mapped[str] = mapped_column(String(80))
    suggested_category: Mapped[str] = mapped_column(String(20))
    explanation: Mapped[str] = mapped_column(Text)
    visible_indicators: Mapped[list[str]] = mapped_column(JsonType, default=list)
    uncertainty_warning: Mapped[str | None] = mapped_column(Text, nullable=True)
    suggested_severity: Mapped[str | None] = mapped_column(String(10), nullable=True)
    image_sha256: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = _created()


class Assignment(Base):
    __tablename__ = "assignments"
    __table_args__ = (Index("assignments_report_idx", "report_id"), Index("assignments_staff_idx", "assigned_staff_id"))
    id: Mapped[uuid.UUID] = _id()
    report_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("reports.id", ondelete="CASCADE"))
    department_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("departments.id"))
    assigned_staff_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("profiles.id"), nullable=True)
    assigned_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id"))
    reason: Mapped[str] = mapped_column(Text)
    assigned_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    unassigned_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)


class StatusHistory(Base):
    __tablename__ = "status_history"
    __table_args__ = (Index("status_history_report_idx", "report_id", "created_at"),)
    id: Mapped[uuid.UUID] = _id()
    report_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("reports.id", ondelete="CASCADE"))
    previous_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    new_status: Mapped[str] = mapped_column(String(20))
    changed_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("profiles.id"), nullable=True)
    changed_by_role: Mapped[str] = mapped_column(String(20))
    comment: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = _created()


class ProgressNote(Base):
    __tablename__ = "progress_notes"
    __table_args__ = (Index("progress_notes_report_idx", "report_id"),)
    id: Mapped[uuid.UUID] = _id()
    report_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("reports.id", ondelete="CASCADE"))
    author_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id"))
    author_role: Mapped[str] = mapped_column(String(20))
    body: Mapped[str] = mapped_column(Text)
    internal: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = _created()


class Evidence(Base):
    __tablename__ = "evidence"
    __table_args__ = (
        CheckConstraint(_in("evidence_type", EVIDENCE_TYPES), name="evidence_type_check"),
        Index("evidence_report_idx", "report_id"),
    )
    id: Mapped[uuid.UUID] = _id()
    report_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("reports.id", ondelete="CASCADE"))
    uploaded_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id"))
    uploaded_by_role: Mapped[str] = mapped_column(String(20))
    storage_path: Mapped[str] = mapped_column(String(300))
    evidence_type: Mapped[str] = mapped_column(String(20))
    caption: Mapped[str] = mapped_column(String(200), default="")
    content_type: Mapped[str] = mapped_column(String(40))
    size_bytes: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = _created()


class SlaPolicy(Base):
    __tablename__ = "sla_policies"
    __table_args__ = (
        CheckConstraint(_in("category", CATEGORIES), name="sla_category_check"),
        CheckConstraint(_in("severity", SEVERITIES), name="sla_severity_check"),
        CheckConstraint("acknowledgement_hours > 0 AND action_hours >= acknowledgement_hours AND resolution_hours >= action_hours", name="sla_hours_check"),
    )
    id: Mapped[uuid.UUID] = _id()
    category: Mapped[str] = mapped_column(String(20))
    severity: Mapped[str] = mapped_column(String(10))
    acknowledgement_hours: Mapped[float] = mapped_column(Float)
    action_hours: Mapped[float] = mapped_column(Float)
    resolution_hours: Mapped[float] = mapped_column(Float)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    department_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("departments.id"), nullable=True)
    zone_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("zones.id"), nullable=True)
    created_at: Mapped[datetime] = _created()
    updated_at: Mapped[datetime] = _updated()


class EscalationEvent(Base):
    __tablename__ = "escalation_events"
    __table_args__ = (
        # Idempotency guard for the deadline check: one event per report/stage/deadline value.
        UniqueConstraint("report_id", "deadline_kind", "deadline_at", name="escalation_events_once"),
        CheckConstraint(_in("status", ESCALATION_STATUSES), name="escalation_status_check"),
        CheckConstraint(_in("deadline_kind", DEADLINE_KINDS), name="escalation_kind_check"),
        CheckConstraint("level BETWEEN 1 AND 3", name="escalation_level_check"),
        Index("escalation_events_status_idx", "status"),
    )
    id: Mapped[uuid.UUID] = _id()
    report_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("reports.id", ondelete="CASCADE"))
    level: Mapped[int] = mapped_column(Integer)
    reason: Mapped[str] = mapped_column(Text)
    deadline_kind: Mapped[str] = mapped_column(String(20))
    deadline_at: Mapped[datetime] = mapped_column(UTCDateTime)
    triggered_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    notified_role: Mapped[str] = mapped_column(String(20), default="supervisor")
    action_taken: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="open")
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("profiles.id"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)


class DeadlineExtension(Base):
    __tablename__ = "deadline_extension_requests"
    __table_args__ = (
        CheckConstraint(_in("status", EXTENSION_STATUSES), name="extension_status_check"),
        CheckConstraint(_in("deadline_kind", DEADLINE_KINDS), name="extension_kind_check"),
        Index("extension_report_idx", "report_id"),
    )
    id: Mapped[uuid.UUID] = _id()
    report_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("reports.id", ondelete="CASCADE"))
    deadline_kind: Mapped[str] = mapped_column(String(20))
    current_deadline: Mapped[datetime] = mapped_column(UTCDateTime)
    requested_deadline: Mapped[datetime] = mapped_column(UTCDateTime)
    requested_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id"))
    reason: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("profiles.id"), nullable=True)
    review_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = _created()
    reviewed_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)


class Feedback(Base):
    __tablename__ = "feedback"
    __table_args__ = (CheckConstraint("rating BETWEEN 1 AND 5", name="feedback_rating_check"), Index("feedback_report_idx", "report_id"))
    id: Mapped[uuid.UUID] = _id()
    report_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("reports.id", ondelete="CASCADE"))
    citizen_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id"))
    rating: Mapped[int] = mapped_column(Integer)
    comment: Mapped[str] = mapped_column(Text, default="")
    reopen_requested: Mapped[bool] = mapped_column(Boolean, default=False)
    reopen_decision: Mapped[str | None] = mapped_column(String(20), nullable=True)
    decision_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    decided_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("profiles.id"), nullable=True)
    created_at: Mapped[datetime] = _created()


class AuditLog(Base):
    __tablename__ = "audit_logs"
    __table_args__ = (Index("audit_logs_created_idx", "created_at"), Index("audit_logs_report_idx", "report_id"))
    id: Mapped[uuid.UUID] = _id()
    actor_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("profiles.id"), nullable=True)  # null = system
    actor_role: Mapped[str] = mapped_column(String(20))
    action: Mapped[str] = mapped_column(String(80))
    entity_type: Mapped[str] = mapped_column(String(30))
    entity_id: Mapped[str] = mapped_column(String(64))
    report_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("reports.id", ondelete="SET NULL"), nullable=True)
    summary: Mapped[str] = mapped_column(Text)
    metadata_: Mapped[dict[str, Any]] = mapped_column("metadata", JsonType, default=dict)
    created_at: Mapped[datetime] = _created()


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (Index("notifications_user_idx", "user_id", "created_at"),)
    id: Mapped[uuid.UUID] = _id()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text, default="")
    link: Mapped[str | None] = mapped_column(String(300), nullable=True)
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    channel: Mapped[str] = mapped_column(String(20), default="in_app")
    created_at: Mapped[datetime] = _created()


class ReportCounter(Base):
    """Per-year counter for human-readable public IDs (CV-YYYY-NNNNN). Incremented under a row lock."""

    __tablename__ = "report_counters"
    year: Mapped[int] = mapped_column(Integer, primary_key=True)
    last_value: Mapped[int] = mapped_column(Integer, default=0)
