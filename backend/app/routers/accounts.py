"""Account creation.

* POST /api/auth/register      — public citizen sign-up (no confirmation email; rate-limited per IP).
* POST /api/admin/users        — administrator creates Authority (staff) or Higher Official accounts.
"""

import re

from fastapi import APIRouter, Request
from pydantic import Field

from ..auth import DB, Admin
from ..errors import invalid
from ..models import Profile
from ..services import rate_limit
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


@router.post("/api/auth/register", status_code=201)
def register(body: RegisterIn, request: Request, db: DB):
    """Citizen self-registration. Always creates a citizen; the account is confirmed immediately (no email)."""
    ip = request.client.host if request.client else "unknown"
    rate_limit.check(f"register:{ip}", 10)
    email = _check(body.email, body.password)
    user_id = create_user(email, body.password, body.display_name.strip())
    _profile(db, user_id, body.display_name.strip(), email)
    return {"id": str(user_id), "email": email}


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
