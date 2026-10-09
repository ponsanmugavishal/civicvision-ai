from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select

from app.models import EscalationEvent, Report
from app.services import sla
from conftest import USERS, ZONE_NORTH


def _make_overdue(db, report_id):
    r = db.get(Report, report_id)
    past = datetime.now(UTC) - timedelta(hours=1)
    r.acknowledgement_deadline = past
    r.original_acknowledgement_deadline = past
    db.commit()


def test_escalations_are_idempotent_and_never_erased(api, db_session):
    import uuid

    rid = uuid.UUID(api.create_report().json()["id"])
    _make_overdue(db_session, rid)
    assert sla.sync_escalations(db_session) == 1
    assert sla.sync_escalations(db_session) == 0
    assert sla.sync_escalations(db_session) == 0
    assert db_session.scalar(select(func.count()).select_from(EscalationEvent)) == 1
    # Approving an extension moves the target but keeps the earlier breach on record
    r = db_session.get(Report, rid)
    r.acknowledgement_deadline = datetime.now(UTC) + timedelta(days=1)
    db_session.commit()
    sla.sync_escalations(db_session)
    assert db_session.scalar(select(func.count()).select_from(EscalationEvent)) == 1
    # A later miss of the new deadline is a separate event
    r.acknowledgement_deadline = datetime.now(UTC) - timedelta(minutes=5)
    db_session.commit()
    assert sla.sync_escalations(db_session) == 1


def test_supervisor_reviews_escalations(api, db_session):
    import uuid

    rid = uuid.UUID(api.create_report().json()["id"])
    _make_overdue(db_session, rid)
    sla.sync_escalations(db_session)
    assert api.get("/api/supervisor/escalations", "drains").status_code == 403
    rows = api.get("/api/supervisor/escalations", "supervisor").json()
    assert len(rows) == 1 and rows[0]["report"]["id"] == str(rid)
    eid = rows[0]["id"]
    assert api.post(f"/api/supervisor/escalations/{eid}/review", "supervisor", json={"status": "actioned", "actionTaken": "short"}).status_code == 422
    assert api.post(f"/api/supervisor/escalations/{eid}/review", "supervisor", json={"status": "actioned", "actionTaken": "Called the drains lead; crew dispatched"}).status_code == 204
    assert api.get("/api/supervisor/escalations", "supervisor").json()[0]["status"] == "actioned"
    overdue = api.get("/api/supervisor/overdue", "supervisor").json()
    assert [o["id"] for o in overdue] == [str(rid)]


def test_cron_trigger_requires_secret(client):
    assert client.post("/api/internal/sla/run").status_code == 401
    assert client.post("/api/internal/sla/run", headers={"X-Cron-Secret": "wrong"}).status_code == 401
    assert client.post("/api/internal/sla/run", headers={"X-Cron-Secret": "test-cron-secret"}).json() == {"created": 0}


def test_supervisor_direct_deadline_change(api):
    rid = api.create_report().json()["id"]
    new = (datetime.now(UTC) + timedelta(days=10)).isoformat()
    assert api.post(f"/api/supervisor/reports/{rid}/deadline-extension", "drains", json={"deadlineKind": "resolution", "newDeadline": new, "reason": "Monsoon backlog"}).status_code == 403
    r = api.post(f"/api/supervisor/reports/{rid}/deadline-extension", "supervisor", json={"deadlineKind": "resolution", "newDeadline": new, "reason": "Monsoon backlog agreed"})
    assert r.status_code == 201 and r.json()["status"] == "approved"


def test_audit_trail_is_read_only(api):
    api.create_report()
    assert api.get("/api/supervisor/audit", "citizen").status_code == 403
    entries = api.get("/api/supervisor/audit", "supervisor").json()
    assert any(e["action"] == "report.created" for e in entries)
    # No endpoint can edit or delete audit history
    assert api.patch("/api/supervisor/audit", "admin", json={}).status_code == 405
    assert api.c.delete("/api/supervisor/audit", headers=api.headers("admin")).status_code == 405


def test_role_changes_only_by_admin(api):
    target = str(USERS["citizen"]["id"])
    body = {"role": "supervisor", "allZones": True}
    for who in ("citizen", "drains", "supervisor"):
        assert api.patch(f"/api/admin/users/{target}", who, json=body).status_code == 403
    assert api.patch(f"/api/admin/users/{target}", "admin", json={"role": "staff", "zoneIds": [str(ZONE_NORTH)]}).status_code == 422  # staff needs department
    r = api.patch(f"/api/admin/users/{target}", "admin", json=body)
    assert r.status_code == 200 and r.json()["role"] == "supervisor"
    assert api.get("/api/me", "citizen").json()["profile"]["role"] == "supervisor"


def test_analytics(api):
    api.create_report(category="drainage")
    api.create_report(category="drainage", lat=13.0521, lng=80.2461)
    api.create_report(category="garbage", lat=13.0522, lng=80.2462)
    summary = api.get("/api/analytics/summary").json()
    assert summary["total"] == 3 and summary["byCategory"]["drainage"] == 2
    assert api.get("/api/analytics/summary", "citizen2").json()["total"] == 0  # citizens: own reports only
    hs = api.get("/api/analytics/hotspots").json()
    assert len(hs) == 1 and hs[0]["count"] == 3
    assert api.get("/api/analytics/departments", "citizen").status_code == 403
    depts = api.get("/api/analytics/departments", "supervisor").json()
    assert {d["name"]: d["total"] for d in depts}["Drains"] == 2
    assert len(api.get("/api/analytics/trend?weeks=4", "supervisor").json()) == 4
