"""Account creation.

* POST /api/auth/register      — public citizen sign-up (no confirmation email; rate-limited per IP).
* POST /api/admin/users        — administrator creates Authority (staff) or Higher Official accounts.
"""

import re
import uuid
from typing import Literal

from fastapi import APIRouter, Request
from pydantic import Field
from sqlalchemy import select

from ..auth import DB, Admin, CurrentUser
from ..db import utcnow
from ..errors import invalid, not_found
from ..models import AccessRequest, Department, Profile
from ..services import rate_limit
from ..services.reports import audit, notify
from ..services.supabase_admin import create_user
from .. import schemas as S
from .admin import apply_role
from .directory import profile_out

router = APIRouter(tags=["accounts"])
EMAIL = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


class RegisterIn(S.Camel):
    display_name: str = Field(min_length=2, max_length=120)
    email: str = Field(max_length=320)
    password: str = Field(min_length=8, max_length=72)
    # Optional: ask for Department Authority (staff) or Higher Official (supervisor) access. Reviewed by an admin.
    requested_role: Literal["staff", "supervisor"] | None = None
    department_id: uuid.UUID | None = None
    note: str = Field(default="", max_length=500)


class AccessRequestOut(S.Camel):
    id: uuid.UUID
    user_id: uuid.UUID
    display_name: str
    email: str | None
    requested_role: Literal["staff", "supervisor"]
    department_id: uuid.UUID | None
    note: str
    status: Literal["pending", "approved", "rejected"]
    decision_reason: str | None
    created_at: S.datetime
    decided_at: S.datetime | None


class AccessDecisionIn(S.AdminUserUpdateIn):
    role: S.Role = "citizen"  # only used when approving
    decision: Literal["approved", "rejected"]
    reason: str = Field(default="", max_length=500)


class AdminCreateUserIn(S.AdminUserUpdateIn):
    display_name: str = Field(min_length=2, max_length=120)
    email: str = Field(max_length=320)
    password: str = Field(min_length=8, max_length=72)


def _check(email: str, password: str) -> str:
    email = email.strip().lower()
    if not EMAIL.match(email):
        raise invalid("Enter a valid email address.", {"email": "Invalid email"})
    if password.lower() == password or not re.search(r"\d", password):
        raise invalid("Use at least 8 characters including a capital letter and a number.", {"password": "Too weak"})
    return email


def _profile(db, user_id, name: str, email: str) -> Profile:
    # Normally created by the auth.users trigger; create it here if the trigger is not installed (tests/dev).
    db.expire_all()
    p = db.get(Profile, user_id)
    if p is None:
        p = Profile(id=user_id, display_name=name, email=email, role="citizen")
        db.add(p)
        db.commit()
    return p


def _request_out(r: AccessRequest, p: Profile) -> AccessRequestOut:
    return AccessRequestOut(
        id=r.id, user_id=r.user_id, display_name=p.display_name, email=p.email, requested_role=r.requested_role, department_id=r.department_id,  # type: ignore[arg-type]
        note=r.note, status=r.status, decision_reason=r.decision_reason, created_at=r.created_at, decided_at=r.decided_at,  # type: ignore[arg-type]
    )


@router.post("/api/auth/register", status_code=201)
def register(body: RegisterIn, request: Request, db: DB):
    """Self-registration. Always creates a CITIZEN account, confirmed immediately (no email). If the person asks for
    Department Authority or Higher Official access, a pending request is recorded for an administrator to decide."""
    ip = request.client.host if request.client else "unknown"
    rate_limit.check(f"register:{ip}", 10)
    email = _check(body.email, body.password)
    if body.requested_role == "staff" and body.department_id is None:
        raise invalid("Choose the department you work in.", {"departmentId": "Required for Department Authority"})
    if body.department_id and db.get(Department, body.department_id) is None:
        raise invalid("Unknown department.", {"departmentId": "Invalid"})
    user_id = create_user(email, body.password, body.display_name.strip())
    profile = _profile(db, user_id, body.display_name.strip(), email)
    request_id = None
    if body.requested_role:
        req = AccessRequest(user_id=profile.id, requested_role=body.requested_role, department_id=body.department_id, note=body.note.strip())
        db.add(req)
        db.flush()
        request_id = str(req.id)
        label = "Department Authority" if body.requested_role == "staff" else "Higher Official"
        audit(db, profile, "access.requested", "profile", profile.id, None, f"{profile.display_name} requested {label} access")
        for admin in db.scalars(select(Profile).where(Profile.role == "administrator")):
            notify(db, admin.id, f"Access request: {profile.display_name}", f"Requested {label} access. {body.note.strip()}"[:500], "/supervisor/users")
        db.commit()
    return {"id": str(user_id), "email": email, "accessRequestId": request_id}


@router.get("/api/me/access-request", response_model=AccessRequestOut | None)
def my_access_request(user: CurrentUser, db: DB):
    """The caller's most recent access request, if any (used to explain why official logins are not open yet)."""
    r = db.scalar(select(AccessRequest).where(AccessRequest.user_id == user.id).order_by(AccessRequest.created_at.desc()).limit(1))
    return _request_out(r, user) if r else None


@router.get("/api/admin/access-requests", response_model=list[AccessRequestOut])
def access_requests(_: Admin, db: DB, status: Literal["pending", "approved", "rejected"] | None = None):
    stmt = select(AccessRequest, Profile).join(Profile, Profile.id == AccessRequest.user_id).order_by(AccessRequest.created_at.desc()).limit(500)
    if status:
        stmt = stmt.where(AccessRequest.status == status)
    return [_request_out(r, p) for r, p in db.execute(stmt).all()]


@router.post("/api/admin/access-requests/{request_id}/decision", response_model=AccessRequestOut)
def decide_access(request_id: uuid.UUID, body: AccessDecisionIn, admin: Admin, db: DB):
    """Approve (assigning role, department and zones) or reject with a reason."""
    r = db.get(AccessRequest, request_id)
    if r is None:
        raise not_found("Access request not found.")
    if r.status != "pending":
        raise invalid("This request has already been decided.")
    target = db.get(Profile, r.user_id)
    if target is None:
        raise not_found("User not found.")
    if body.decision == "rejected" and len(body.reason.strip()) < 5:
        raise invalid("Give a short reason for rejecting.", {"reason": "Required"})
    if body.decision == "approved":
        if body.role == "citizen":
            raise invalid("Choose the role to grant.", {"role": "Choose staff, supervisor or administrator"})
        apply_role(db, admin, target, body)  # validates department/zones and audits the role change
    r.status = body.decision
    r.decided_by = admin.id
    r.decision_reason = body.reason.strip() or None
    r.decided_at = utcnow()
    audit(db, admin, f"access.{body.decision}", "profile", target.id, None, f"{target.display_name}: access request {body.decision}" + (f" — {body.reason.strip()}" if body.reason.strip() else ""))
    notify(db, target.id, f"Access request {body.decision}", body.reason.strip() or ("You can now use your new login." if body.decision == "approved" else ""), None)
    db.commit()
    return _request_out(r, target)


@router.post("/api/admin/users", response_model=S.UserProfileOut, status_code=201)
def admin_create_user(body: AdminCreateUserIn, admin: Admin, db: DB):
    """Create an Authority (staff) or Higher Official (supervisor/administrator) account with a temporary password."""
    if body.role == "citizen":
        raise invalid("Citizens register themselves on the public sign-up page.", {"role": "Choose staff, supervisor or administrator"})
    email = _check(body.email, body.password)
    # Validate role/department/zones before creating the login, so a bad request leaves nothing behind.
    if body.role == "staff" and body.department_id is None:
        raise invalid("Staff members need a department.", {"departmentId": "Required for staff"})
    if body.role in ("staff", "supervisor") and not body.all_zones and not body.zone_ids:
        raise invalid("Choose at least one zone or grant all zones.", {"zoneIds": "Required"})
    user_id = create_user(email, body.password, body.display_name.strip())
    target = _profile(db, user_id, body.display_name.strip(), email)
    return profile_out(apply_role(db, admin, target, body))
