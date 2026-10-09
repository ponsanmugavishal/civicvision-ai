"""Administrator provisioning: grant a role and scope to a user (server-side only).

Users always sign up as citizens. Run this (or call PATCH /api/admin/users/{id} as an administrator) to
promote someone. It needs the backend's DATABASE_URL; --create additionally needs SUPABASE_URL and
SUPABASE_SERVICE_ROLE_KEY to create the auth user. Never run it from a browser or expose those keys.

Examples
  python scripts/provision_user.py --email lead@city.example --role supervisor --all-zones
  python scripts/provision_user.py --email crew@city.example --role staff --department roads --zones north,central
  python scripts/provision_user.py --email first.admin@city.example --role administrator --all-zones --create --name "Platform Admin"
"""

import argparse
import getpass
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx  # noqa: E402
from sqlalchemy import select  # noqa: E402

from app import schemas as S  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.db import session_factory  # noqa: E402
from app.errors import AppError  # noqa: E402
from app.models import Department, Profile, Zone  # noqa: E402
from app.routers.admin import apply_role  # noqa: E402


def create_auth_user(email: str, name: str) -> None:
    s = get_settings()
    if not s.supabase_url or not s.supabase_service_role_key:
        raise SystemExit("--create needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the backend environment.")
    password = getpass.getpass(f"Initial password for {email} (min 8 chars): ")
    if len(password) < 8:
        raise SystemExit("Password too short.")
    r = httpx.post(
        f"{s.supabase_url.rstrip('/')}/auth/v1/admin/users",
        headers=s.supabase_admin_headers,
        json={"email": email, "password": password, "email_confirm": True, "user_metadata": {"display_name": name}},
        timeout=20,
    )
    if r.status_code >= 300:
        raise SystemExit(f"Supabase rejected the request ({r.status_code}): {r.json().get('msg') or r.text[:200]}")
    print(f"Created auth user {email} (profile created as citizen by the database trigger).")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--email", required=True)
    ap.add_argument("--role", required=True, choices=["citizen", "staff", "supervisor", "administrator"])
    ap.add_argument("--department", help="department slug, e.g. roads (required for staff)")
    ap.add_argument("--zones", default="", help="comma-separated zone slugs, e.g. north,central")
    ap.add_argument("--all-zones", action="store_true")
    ap.add_argument("--title")
    ap.add_argument("--create", action="store_true", help="create the Supabase auth user first")
    ap.add_argument("--name", default="", help="display name when creating")
    a = ap.parse_args()
    email = a.email.strip().lower()
    if a.create:
        create_auth_user(email, a.name or email.split("@")[0])

    with session_factory()() as db:
        profile = db.scalar(select(Profile).where(Profile.email == email))
        if profile is None:
            raise SystemExit(f"No profile with email {email}. The person must sign up first (or use --create).")
        dept = db.scalar(select(Department).where(Department.slug == a.department)) if a.department else None
        if a.department and dept is None:
            raise SystemExit(f"Unknown department slug '{a.department}'. Options: {', '.join(db.scalars(select(Department.slug)))}")
        slugs = [z.strip() for z in a.zones.split(",") if z.strip()]
        zones = db.scalars(select(Zone).where(Zone.slug.in_(slugs))).all() if slugs else []
        if len(zones) != len(slugs):
            raise SystemExit(f"Unknown zone slug. Options: {', '.join(db.scalars(select(Zone.slug)))}")
        body = S.AdminUserUpdateIn(role=a.role, department_id=dept.id if dept else None, zone_ids=[z.id for z in zones], all_zones=a.all_zones, title=a.title)
        try:
            p = apply_role(db, None, profile, body)
        except AppError as e:
            raise SystemExit(f"{e.message} {e.field_errors or ''}")
        print(f"{p.display_name} <{p.email}> is now {p.role}" + (f" in {dept.short_name}" if dept else "") + (" (all zones)" if p.all_zones else f" (zones: {', '.join(z.name for z in p.zones) or 'none'})"))


if __name__ == "__main__":
    main()
