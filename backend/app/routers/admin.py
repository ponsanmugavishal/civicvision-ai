"""Administrator-only role provisioning. This is the only API path that can change a user's role or scope."""

import uuid

from fastapi import APIRouter
from sqlalchemy import delete, select

from ..auth import DB, Admin
from ..errors import invalid, not_found
from ..models import Department, Profile, ProfileZone, Zone
from ..services.reports import audit
from .. import schemas as S
from .directory import profile_out

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/users", response_model=list[S.UserProfileOut])
def users(_: Admin, db: DB):
    return [profile_out(p) for p in db.scalars(select(Profile).order_by(Profile.role, Profile.display_name))]


def apply_role(db, actor: Profile | None, target: Profile, body: S.AdminUserUpdateIn) -> Profile:
    """Shared by the admin endpoint and the provisioning CLI."""
    if body.role == "staff" and body.department_id is None:
        raise invalid("Staff members need a department.", {"departmentId": "Required for staff"})
    if body.role in ("staff", "supervisor") and not body.all_zones and not body.zone_ids:
        raise invalid("Choose at least one zone or grant all zones.", {"zoneIds": "Required"})
    if body.department_id and db.get(Department, body.department_id) is None:
        raise invalid("Unknown department.", {"departmentId": "Invalid"})
    zones = db.scalars(select(Zone).where(Zone.id.in_(body.zone_ids))).all() if body.zone_ids else []
    if len(zones) != len(set(body.zone_ids)):
        raise invalid("Unknown zone.", {"zoneIds": "Invalid"})
    before = f"{target.role}/{target.department_id}/{'all' if target.all_zones else len(target.zone_ids)}"
    target.role = body.role
    target.department_id = body.department_id if body.role in ("staff", "supervisor") else None
    target.all_zones = body.all_zones if body.role != "citizen" else False
    if body.title is not None:
        target.title = body.title
    db.execute(delete(ProfileZone).where(ProfileZone.profile_id == target.id))
    if body.role != "citizen" and not body.all_zones:
        for z in zones:
            db.add(ProfileZone(profile_id=target.id, zone_id=z.id))
    db.flush()
    audit(db, actor, "profile.role_changed", "profile", target.id, None, f"{target.display_name}: {before} → {body.role}", target=str(target.id))
    db.commit()
    db.refresh(target)
    db.expire(target, ["zones"])
    return target


@router.patch("/users/{user_id}", response_model=S.UserProfileOut)
def update_user(user_id: uuid.UUID, body: S.AdminUserUpdateIn, admin: Admin, db: DB):
    target = db.get(Profile, user_id)
    if target is None:
        raise not_found("User not found.")
    if target.id == admin.id and body.role != "administrator":
        raise invalid("Administrators cannot remove their own administrator role.")
    return profile_out(apply_role(db, admin, target, body))
