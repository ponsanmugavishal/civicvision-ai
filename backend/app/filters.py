"""Query-string filters shared by the report list endpoints."""

import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime, time

from fastapi import Query
from sqlalchemy import Select, false, func, or_

from .errors import invalid
from .models import Report
from .services.sla import deadline_info

MAX_ROWS = 2000


def _split(v: str | None) -> list[str]:
    return [p.strip() for p in (v or "").split(",") if p.strip()]


def _parse_dt(v: str | None, end: bool) -> datetime | None:
    if not v:
        return None
    try:
        if len(v) == 10:  # YYYY-MM-DD
            d = datetime.fromisoformat(v).date()
            return datetime.combine(d, time.max if end else time.min, tzinfo=UTC)
        dt = datetime.fromisoformat(v.replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=UTC)
    except ValueError:
        raise invalid("Invalid date filter.", {"dateFrom" if not end else "dateTo": "Use YYYY-MM-DD or ISO 8601"})


@dataclass
class ReportFilters:
    search: str | None = None
    categories: list[str] = field(default_factory=list)
    statuses: list[str] = field(default_factory=list)
    severities: list[str] = field(default_factory=list)
    department_ids: list[uuid.UUID] = field(default_factory=list)
    zone_ids: list[uuid.UUID] = field(default_factory=list)
    date_from: datetime | None = None
    date_to: datetime | None = None
    overdue_only: bool = False

    def apply(self, stmt: Select, routing: dict[str, uuid.UUID]) -> Select:
        if self.categories:
            stmt = stmt.where(Report.category.in_(self.categories))
        if self.statuses:
            stmt = stmt.where(Report.status.in_(self.statuses))
        if self.severities:
            stmt = stmt.where(Report.severity.in_(self.severities))
        if self.department_ids:
            cats = [c for c, d in routing.items() if d in self.department_ids]
            stmt = stmt.where(or_(Report.department_id.in_(self.department_ids), Report.department_id.is_(None) & (Report.category.in_(cats) if cats else false())))
        if self.zone_ids:
            stmt = stmt.where(Report.zone_id.in_(self.zone_ids))
        if self.date_from:
            stmt = stmt.where(Report.reported_at >= self.date_from)
        if self.date_to:
            stmt = stmt.where(Report.reported_at <= self.date_to)
        if self.search and self.search.strip():
            q = f"%{self.search.strip().lower()[:100].replace('%', '').replace('_', '')}%"
            stmt = stmt.where(or_(*(func.lower(c).like(q) for c in (Report.public_id, Report.category, Report.address, Report.landmark, Report.description))))
        return stmt.order_by(Report.reported_at.desc()).limit(MAX_ROWS)

    def post_filter(self, reports: list[Report]) -> list[Report]:
        if not self.overdue_only:
            return reports
        return [r for r in reports if deadline_info(r).state == "overdue"]


def report_filters(
    search: str | None = Query(default=None, max_length=100),
    categories: str | None = Query(default=None, description="Comma-separated"),
    statuses: str | None = Query(default=None),
    severities: str | None = Query(default=None),
    department_ids: str | None = Query(default=None, alias="departmentIds"),
    zone_ids: str | None = Query(default=None, alias="zoneIds"),
    date_from: str | None = Query(default=None, alias="dateFrom"),
    date_to: str | None = Query(default=None, alias="dateTo"),
    overdue_only: bool = Query(default=False, alias="overdueOnly"),
) -> ReportFilters:
    try:
        depts = [uuid.UUID(x) for x in _split(department_ids)]
        zones = [uuid.UUID(x) for x in _split(zone_ids)]
    except ValueError:
        raise invalid("Invalid department or zone id.")
    return ReportFilters(
        search=search, categories=_split(categories), statuses=_split(statuses), severities=_split(severities),
        department_ids=depts, zone_ids=zones, date_from=_parse_dt(date_from, False), date_to=_parse_dt(date_to, True), overdue_only=overdue_only,
    )
