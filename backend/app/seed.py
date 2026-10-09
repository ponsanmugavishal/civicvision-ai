"""Seed data.

  python -m app.seed               reference data only (departments, zones, illustrative SLA policies) — idempotent
  python -m app.seed --dev         + dev accounts (@dev.civicvision.local) and fictional demo complaints (local only)

Departments and zones are generic starting points — rename/re-centre them for your city (or edit in the database).
Dev accounts and demo complaints (--dev) are FICTIONAL and for local development only. SLA hours are illustrative, configurable
examples — not official standards. The same reference rows (same UUIDs) are in supabase/seed.sql.
"""

import argparse
import random
import struct
import uuid
import zlib
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import get_settings
from .db import Base, get_engine, session_factory, utcnow
from .models import Assignment, Department, Evidence, Feedback, Profile, ProfileZone, ProgressNote, Report, ReportCounter, SlaPolicy, StatusHistory, Zone
from .services import sla
from .services.storage import get_storage

U = lambda n: uuid.UUID(f"00000000-0000-4000-8000-{n:012x}")  # noqa: E731 — fixed, readable ids

DEPARTMENTS = [
    (U(0xD1), "solid-waste", "Solid Waste Management", "Solid Waste", "Collection, clearance of dumping spots and bin maintenance.", ["garbage"]),
    (U(0xD2), "stormwater-drains", "Stormwater Drains & Sewerage", "Drains", "Drain desilting, overflow response and waterlogging relief.", ["drainage"]),
    (U(0xD3), "roads", "Roads & Street Maintenance", "Roads", "Pothole patching, resurfacing and road-edge repairs.", ["pothole"]),
    (U(0xD4), "ward-services", "Ward Civic Services", "Ward Services", "General civic issues that need triage before routing.", ["other"]),
]
LAT, LNG = 13.05, 80.24
ZONES = [
    (U(0xE1), "north", "North Zone", "Northern wards", LAT + 0.026, LNG + 0.004),
    (U(0xE2), "central", "Central Zone", "Central wards", LAT + 0.002, LNG + 0.006),
    (U(0xE3), "south", "South Zone", "Southern wards", LAT - 0.026, LNG + 0.002),
    (U(0xE4), "west", "West Zone", "Western wards", LAT + 0.001, LNG - 0.030),
]
BASE_HOURS = {"critical": (4, 12, 48), "high": (12, 24, 96), "medium": (24, 72, 168), "low": (48, 120, 336)}
CATEGORY_FACTOR = {"garbage": 1.0, "drainage": 0.75, "pothole": 1.5, "other": 1.25}


def sla_rows() -> list[tuple[uuid.UUID, str, str, float, float, float]]:
    out, n = [], 0x500
    for cat, f in CATEGORY_FACTOR.items():
        for sev, (a, b, c) in BASE_HOURS.items():
            n += 1
            out.append((U(n), cat, sev, a, b, round(c * f)))
    return out


def seed_reference(db: Session) -> None:
    for id_, slug, name, short, desc, cats in DEPARTMENTS:
        if db.get(Department, id_) is None:
            db.add(Department(id=id_, slug=slug, name=name, short_name=short, description=desc, categories=cats, active=True))
    for id_, slug, name, desc, lat, lng in ZONES:
        if db.get(Zone, id_) is None:
            db.add(Zone(id=id_, slug=slug, name=name, description=desc, center_lat=lat, center_lng=lng))
    for id_, cat, sev, a, b, c in sla_rows():
        if db.get(SlaPolicy, id_) is None:
            db.add(SlaPolicy(id=id_, category=cat, severity=sev, acknowledgement_hours=a, action_hours=b, resolution_hours=c, enabled=True))
    db.commit()


# ---------------------------------------------------------------- dev-only data

DEV_DOMAIN = "dev.civicvision.local"
DEV_USERS = [
    # id, name, email local-part, role, dept, zones (None = all), title
    (U(0xA1), "Asha Raman", "asha", "citizen", None, [], None),
    (U(0xA2), "Vikram Sundar", "vikram", "citizen", None, [], None),
    (U(0xA3), "Meera Krishnan", "meera", "citizen", None, [], None),
    (U(0xB1), "Karthik Natarajan", "karthik", "staff", U(0xD1), [U(0xE1), U(0xE2)], "Sanitation Inspector"),
    (U(0xB2), "Divya Prakash", "divya", "staff", U(0xD1), [U(0xE3), U(0xE4)], "Sanitation Inspector"),
    (U(0xB3), "Rahul Menon", "rahul", "staff", U(0xD2), None, "Assistant Engineer (Drains)"),
    (U(0xB4), "Arun Balaji", "arun", "staff", U(0xD3), None, "Assistant Engineer (Roads)"),
    (U(0xB5), "Joseph Daniel", "joseph", "staff", U(0xD4), None, "Ward Officer"),
    (U(0xC1), "Lakshmi Iyer", "lakshmi", "supervisor", None, None, "Zonal Oversight Officer"),
    (U(0xC9), "Admin Account", "admin", "administrator", None, None, "Platform administrator"),
]

DESCRIPTIONS = {
    "garbage": ["Garbage has been piling up next to the community bin for several days and is spilling onto the footpath.", "Construction debris and household waste dumped on the vacant plot; stray animals are scattering it.", "Overflowing bin near the market entrance. Strong smell and flies in the area."],
    "drainage": ["Drain is completely blocked with silt and plastic; water overflows onto the road after light rain.", "Sewage overflow from the manhole near the junction; pedestrians are walking through dirty water.", "Standing water for three days next to the school gate, mosquitoes breeding."],
    "pothole": ["Large pothole in the middle of the lane, roughly half a metre wide. Vehicles swerve suddenly to avoid it.", "Series of potholes after the recent cable trench work; road surface not restored.", "Road edge has crumbled near the culvert, narrowing the carriageway."],
    "other": ["Fallen tree branch partly blocking the footpath after the storm.", "Open digging left unbarricaded near the park entrance."],
}
STREETS = ["Market Street", "Lake View Road", "Temple Lane", "Station Road", "School Road", "Canal Bank Road", "Park Avenue"]
LANDMARKS = ["Opposite the bus stop", "Near the community hall", "Beside the primary school gate", "Next to the vegetable market"]
COLOURS = {"garbage": (15, 118, 110), "drainage": (3, 105, 161), "pothole": (146, 64, 14), "other": (71, 84, 103), "resolution": (7, 148, 85)}


def placeholder_png(rgb: tuple[int, int, int], w: int = 160, h: int = 120) -> bytes:
    """Tiny solid-colour PNG with a light border — clearly a placeholder, not a photo."""
    light = tuple(min(255, c + 150) for c in rgb)
    rows = []
    for y in range(h):
        row = bytearray([0])
        for x in range(w):
            row += bytes(light if (x < 6 or y < 6 or x >= w - 6 or y >= h - 6) else rgb)
        rows.append(bytes(row))

    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(b"".join(rows))) + chunk(b"IEND", b"")


def seed_dev(db: Session, count: int = 48) -> None:
    for id_, name, local, role, dept, zones, title in DEV_USERS:
        p = db.get(Profile, id_)
        if p is None:  # SQLite dev DB; on Postgres the auth.users trigger has already created a citizen profile
            p = Profile(id=id_, display_name=name, email=f"{local}@{DEV_DOMAIN}")
            db.add(p)
        if p.email != f"{local}@{DEV_DOMAIN}":
            continue  # never touch non-dev accounts
        p.display_name, p.role, p.department_id, p.title = name, role, dept, title
        p.all_zones = zones is None and role != "citizen"
        db.flush()
        if not db.scalar(select(ProfileZone).where(ProfileZone.profile_id == id_).limit(1)):
            for z in zones or []:
                db.add(ProfileZone(profile_id=id_, zone_id=z))
    db.commit()
    if db.scalar(select(Report.id).where(Report.is_demo.is_(True)).limit(1)):
        return  # demo complaints already present

    rng = random.Random(20261009)
    storage = get_storage()
    images = {}
    for key, rgb in COLOURS.items():
        path = f"demo/{key}.png"
        storage.put(path, placeholder_png(rgb), "image/png")
        images[key] = path
    citizens = [u for u in DEV_USERS if u[3] == "citizen"]
    staff = [u for u in DEV_USERS if u[3] == "staff"]
    supervisor = next(u for u in DEV_USERS if u[3] == "supervisor")
    dept_for = {cats[0]: id_ for id_, _, _, _, _, cats in DEPARTMENTS}
    now = utcnow()
    counter = ReportCounter(year=now.year, last_value=0)
    db.add(counter)

    hotspots = [(U(0xE2), 0.004, -0.003, "garbage"), (U(0xE1), -0.003, 0.005, "drainage"), (U(0xE3), 0.002, 0.004, "pothole")]
    for i in range(count):
        if i < 12:
            zid, dlat, dlng, cat = hotspots[i % 3]
            z = next(zz for zz in ZONES if zz[0] == zid)
            lat, lng = z[4] + dlat + rng.uniform(-0.0009, 0.0009), z[5] + dlng + rng.uniform(-0.0009, 0.0009)
        else:
            z = rng.choice(ZONES)
            zid, cat = z[0], rng.choices(["garbage", "drainage", "pothole", "other"], [34, 28, 32, 6])[0]
            lat, lng = z[4] + rng.uniform(-0.013, 0.013), z[5] + rng.uniform(-0.013, 0.013)
        sev = rng.choices(["critical", "high", "medium", "low"], [12, 26, 40, 22])[0]
        status = rng.choices(["open", "assigned", "in_progress", "resolved", "rejected", "reopened"], [14, 12, 18, 44, 6, 6])[0]
        target = rng.choices(["on_track", "approaching", "overdue"], [50, 22, 28])[0]
        late = target == "overdue" if status in sla.ACTIVE else rng.random() < 0.3
        ack_h, act_h, res_h = sla.find_policy(db, cat, sev, None, zid)
        frac = {"on_track": rng.uniform(0.1, 0.65), "approaching": rng.uniform(0.8, 0.95), "overdue": rng.uniform(1.15, 2.5)}[target]
        ack_d = ack_h * (rng.uniform(1.2, 1.8) if late else rng.uniform(0.15, 0.85))
        act_d = (act_h - ack_h) * (rng.uniform(1.1, 1.6) if late else rng.uniform(0.2, 0.8))
        res_d = (res_h - act_h) * (rng.uniform(1.05, 1.4) if late else rng.uniform(0.2, 0.8))
        age = {"open": ack_h * frac, "assigned": act_h * frac, "in_progress": res_h * frac}.get(status, ack_d + act_d + res_d + rng.uniform(30, 900))
        if status == "assigned":
            ack_d = min(ack_d, age * 0.6)
        if status == "in_progress" and ack_d + act_d > age * 0.8:
            k = age * 0.8 / (ack_d + act_d)
            ack_d, act_d = ack_d * k, act_d * k
        reported = now - timedelta(hours=age)
        dl = sla.compute_deadlines((ack_h, act_h, res_h), reported)
        counter.last_value += 1
        citizen = rng.choice(citizens)
        r = Report(
            public_id=f"CV-{now.year}-{counter.last_value:05d}", citizen_id=citizen[0], category=cat, description=rng.choice(DESCRIPTIONS[cat]),
            latitude=round(lat, 6), longitude=round(lng, 6), address=f"{rng.randint(1, 180)}, {rng.choice(STREETS)}, {z[2].replace(' Zone', '')} Sector {rng.randint(1, 9)}",
            landmark=rng.choice(LANDMARKS), image_path=images[cat], severity=sev, status="open", zone_id=zid, reported_at=reported,
            acknowledgement_deadline=dl["acknowledgement"], action_deadline=dl["action"], resolution_deadline=dl["resolution"],
            original_acknowledgement_deadline=dl["acknowledgement"], original_action_deadline=dl["action"], original_resolution_deadline=dl["resolution"], is_demo=True,
        )
        db.add(r)
        db.flush()

        def hist(prev, new, who, at, comment):
            db.add(StatusHistory(report_id=r.id, previous_status=prev, new_status=new, changed_by=who[0], changed_by_role=who[3], comment=comment, created_at=at))
            r.status = new
            r.updated_at = at

        hist(None, "open", citizen, reported, "Complaint submitted by citizen.")
        db.add(Evidence(report_id=r.id, uploaded_by=citizen[0], uploaded_by_role="citizen", storage_path=images[cat], evidence_type="original", caption="Photo submitted with the complaint (demo placeholder)", content_type="image/png", size_bytes=1, created_at=reported))
        pool = [s for s in staff if s[4] == dept_for[cat] and (s[5] is None or zid in s[5])]
        if status == "open" or not pool:
            continue
        st = rng.choice(pool)
        ack_at = reported + timedelta(hours=ack_d)
        r.department_id, r.assigned_staff_id, r.acknowledged_at = dept_for[cat], st[0], ack_at
        db.add(Assignment(report_id=r.id, department_id=dept_for[cat], assigned_staff_id=st[0], assigned_by=supervisor[0], reason="Routed by category and zone (demo rule).", assigned_at=ack_at))
        if status == "rejected":
            r.rejection_reason = "Location is inside a private compound; outside municipal maintenance scope. Citizen advised accordingly."
            hist("open", "rejected", st, ack_at + timedelta(hours=2), r.rejection_reason)
            continue
        hist("open", "assigned", st, ack_at, f"Acknowledged and assigned to {st[1]}.")
        if status == "assigned":
            continue
        act_at = ack_at + timedelta(hours=act_d)
        r.action_started_at = act_at
        hist("assigned", "in_progress", st, act_at, "Field team visited the site and started work.")
        db.add(ProgressNote(report_id=r.id, author_id=st[0], author_role="staff", body="Crew and equipment requested for this location.", internal=True, created_at=act_at + timedelta(minutes=30)))
        db.add(ProgressNote(report_id=r.id, author_id=st[0], author_role="staff", body="Work started on site. Temporary barricade placed for safety.", internal=False, created_at=act_at + timedelta(hours=1)))
        if status == "in_progress":
            continue
        res_at = act_at + timedelta(hours=res_d)
        r.resolved_at, r.resolution_summary = res_at, "Issue cleared on site and area made safe (demo record)."
        hist("in_progress", "resolved", st, res_at, r.resolution_summary)
        db.add(Evidence(report_id=r.id, uploaded_by=st[0], uploaded_by_role="staff", storage_path=images["resolution"], evidence_type="resolution", caption="After resolution (demo placeholder)", content_type="image/png", size_bytes=1, created_at=res_at))
        if status == "resolved":
            if i % 8 == 3:
                db.add(Feedback(report_id=r.id, citizen_id=citizen[0], rating=1, comment="The problem is back within two days. Only the surface was cleaned.", reopen_requested=True, reopen_decision="pending", created_at=min(res_at + timedelta(hours=30), now)))
            continue
        reopen_at = now - timedelta(hours=rng.uniform(6, 40))
        db.add(Feedback(report_id=r.id, citizen_id=citizen[0], rating=1, comment="Issue has returned at the same spot.", reopen_requested=True, reopen_decision="approved", decision_reason="Photo evidence confirms recurrence.", decided_by=supervisor[0], created_at=reopen_at - timedelta(hours=6)))
        fresh = sla.compute_deadlines((ack_h, act_h, res_h), reopen_at)
        r.action_deadline, r.resolution_deadline = fresh["action"], fresh["resolution"]
        r.action_started_at = r.resolved_at = None
        hist("resolved", "reopened", supervisor, reopen_at, "Reopened after citizen dispute was upheld.")
    db.commit()
    sla.sync_escalations(db)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dev", action="store_true", help="also create dev accounts and demo complaints (never in production)")
    args = parser.parse_args()
    settings = get_settings()
    if settings.auto_create_schema:
        Base.metadata.create_all(get_engine())
    with session_factory()() as db:
        seed_reference(db)
        print("Reference data ready (departments, zones, SLA policies).")
        if args.dev:
            if settings.env == "production":
                raise SystemExit("Refusing to create dev accounts in production.")
            seed_dev(db)
            print(f"Dev accounts (@{DEV_DOMAIN}) and demo complaints ready.")


if __name__ == "__main__":
    main()
