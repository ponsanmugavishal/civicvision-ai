"""Server-side role and scope rules. Every protected endpoint goes through these checks.

Scope model
  * citizen      — only reports they submitted.
  * staff        — reports routed to their department (assigned, or unassigned and matching the department's
                   categories) within their authorised zones (`all_zones` or `profile_zones`).
  * supervisor   — all departments (or only their `department_id` if set) within their authorised zones.
  * administrator— everything; also manages roles.
"""

import uuid

from sqlalchemy import Select, false, or_, select, true
from sqlalchemy.orm import Session

from .errors import forbidden
from .models import Department, Profile, Report


def routing_map(db: Session) -> dict[str, uuid.UUID]:
    """Category → responsible department (first active department listing the category)."""
    out: dict[str, uuid.UUID] = {}
    for d in db.scalars(select(Department).where(Department.active.is_(True)).order_by(Department.slug)):
        for c in d.categories or []:
            out.setdefault(c, d.id)
    return out


def responsible_department(report: Report, routing: dict[str, uuid.UUID]) -> uuid.UUID | None:
    return report.department_id or routing.get(report.category)


def _in_zone(user: Profile, report: Report) -> bool:
    return user.all_zones or (report.zone_id is not None and report.zone_id in user.zone_ids)


def can_view_report(user: Profile, report: Report, routing: dict[str, uuid.UUID]) -> bool:
    if user.role == "citizen":
        return report.citizen_id == user.id
    if user.role == "administrator":
        return True
    if not _in_zone(user, report):
        return False
    if user.role == "staff":
        return user.department_id is not None and responsible_department(report, routing) == user.department_id
    if user.role == "supervisor":
        return user.department_id is None or responsible_department(report, routing) == user.department_id
    return False


def can_work(user: Profile, report: Report, routing: dict[str, uuid.UUID]) -> bool:
    """Who may change status, add notes or evidence."""
    if user.role in ("supervisor", "administrator"):
        return can_view_report(user, report, routing)
    if user.role == "staff" and can_view_report(user, report, routing):
        return report.assigned_staff_id == user.id or (report.status == "open" and report.assigned_staff_id is None)
    return False


def ensure_view(user: Profile, report: Report, routing: dict[str, uuid.UUID]) -> None:
    if not can_view_report(user, report, routing):
        raise forbidden("This complaint is outside your scope." if user.role != "citizen" else "You can only open complaints you submitted.")


def scope_query(stmt: Select, user: Profile, routing: dict[str, uuid.UUID]) -> Select:
    """Apply the same scope rules as `can_view_report` at the SQL level, for list endpoints."""
    if user.role == "citizen":
        return stmt.where(Report.citizen_id == user.id)
    if user.role == "administrator":
        return stmt
    zone_clause = true() if user.all_zones else (Report.zone_id.in_(user.zone_ids) if user.zone_ids else false())
    stmt = stmt.where(zone_clause)
    dept = user.department_id
    if user.role == "staff" and dept is None:
        return stmt.where(false())
    if dept is None:  # supervisor across departments
        return stmt
    categories = [c for c, d in routing.items() if d == dept]
    return stmt.where(or_(Report.department_id == dept, (Report.department_id.is_(None)) & (Report.category.in_(categories) if categories else false())))


def permissions_for(user: Profile) -> list[str]:
    base = {
        "citizen": ["reports:create", "reports:read:own", "feedback:create", "reopen:request"],
        "staff": ["reports:read:scoped", "reports:accept", "reports:update:assigned", "notes:create", "evidence:upload", "extensions:request"],
        "supervisor": ["reports:read:scoped", "reports:assign", "reports:reassign", "reports:update:scoped", "notes:create", "evidence:upload", "extensions:review", "escalations:review", "disputes:decide", "deadlines:extend", "audit:read", "analytics:read"],
        "administrator": ["*"],
    }
    return base[user.role]
