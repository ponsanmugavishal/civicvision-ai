import uuid

from fastapi import APIRouter
from sqlalchemy import select

from ..auth import DB, CurrentUser, StaffOrAbove
from ..models import Department, Profile, SlaPolicy, Zone
from ..permissions import permissions_for
from .. import schemas as S

router = APIRouter(prefix="/api", tags=["directory"])


def profile_out(p: Profile, include_contact: bool = True) -> S.UserProfileOut:
    return S.UserProfileOut(
        id=p.id, display_name=p.display_name, role=p.role, department_id=p.department_id, zone_ids=p.zone_ids, all_zones=p.all_zones,  # type: ignore[arg-type]
        email=p.email if include_contact else None, phone=p.phone if include_contact else None, title=p.title,
    )


@router.get("/me", response_model=S.MeOut)
def me(user: CurrentUser) -> S.MeOut:
    return S.MeOut(profile=profile_out(user), permissions=permissions_for(user))


@router.get("/me/permissions", response_model=list[str])
def my_permissions(user: CurrentUser) -> list[str]:
    return permissions_for(user)


@router.get("/directory/departments", response_model=list[S.DepartmentOut])
def departments(db: DB):
    return db.scalars(select(Department).order_by(Department.slug)).all()


@router.get("/directory/zones", response_model=list[S.ZoneOut])
def zones(db: DB):
    return [S.ZoneOut(id=z.id, name=z.name, description=z.description, center=(z.center_lat, z.center_lng)) for z in db.scalars(select(Zone).order_by(Zone.slug))]


@router.get("/directory/sla-policies", response_model=list[S.SlaPolicyOut])
def sla_policies(db: DB):
    return db.scalars(select(SlaPolicy).where(SlaPolicy.department_id.is_(None), SlaPolicy.zone_id.is_(None)).order_by(SlaPolicy.category, SlaPolicy.severity)).all()


@router.get("/directory/staff", response_model=list[S.UserProfileOut])
def staff(user: StaffOrAbove, db: DB, department_id: uuid.UUID | None = None):
    """Colleagues and supervisors, for assignment pickers and name display. Contact details are omitted."""
    stmt = select(Profile).where(Profile.role.in_(("staff", "supervisor", "administrator")))
    if department_id:
        stmt = stmt.where(Profile.department_id == department_id)
    if user.role == "staff":  # staff only see their own department's people (plus supervisors)
        stmt = stmt.where((Profile.department_id == user.department_id) | (Profile.role != "staff"))
    return [profile_out(p, include_contact=False) for p in db.scalars(stmt.order_by(Profile.display_name))]
