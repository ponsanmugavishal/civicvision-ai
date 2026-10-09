import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.models import AuditLog, StatusHistory
from conftest import DEPT_DRAINS, DEPT_WASTE, PNG, USERS


def uid(name):
    return str(USERS[name]["id"])


def test_citizen_creates_and_reads_own_report(api, storage):
    r = api.create_report()
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["status"] == "open" and body["publicId"].startswith("CV-")
    assert body["severity"] == "medium" and body["citizenId"] == uid("citizen")
    assert len(storage.files) == 1  # photo stored in object storage, not the database
    mine = api.get("/api/reports/mine", "citizen").json()
    assert [m["id"] for m in mine] == [body["id"]]
    detail = api.get(f"/api/reports/mine/{body['id']}", "citizen").json()
    assert detail["timeline"][0]["title"] == "Complaint submitted"
    assert detail["evidence"][0]["type"] == "original" and detail["evidence"][0]["url"].startswith("memory://")


def test_report_validation(api, storage):
    bad = api.create_report(description="too short")
    assert bad.status_code == 422 and "description" in bad.json()["field_errors"]
    not_image = api.create_report(photo=b"%PDF-1.7 " + b"x" * 500)
    assert not_image.status_code == 422 and "photo" in not_image.json()["field_errors"]
    huge = api.create_report(photo=PNG + b"\0" * (6 * 1024 * 1024))
    assert huge.status_code == 422
    bad_coords = api.create_report(lat=123.0)
    assert bad_coords.status_code == 422
    assert storage.files == {}  # nothing left behind by failed submissions


def test_only_citizens_can_submit(api):
    assert api.create_report(who="supervisor").status_code == 403


def test_citizen_cannot_read_others_or_staff_views(api):
    rid = api.create_report().json()["id"]
    assert api.get(f"/api/reports/mine/{rid}", "citizen2").status_code == 403
    assert api.get(f"/api/reports/{rid}", "citizen").status_code == 403
    assert api.get("/api/reports", "citizen").status_code == 403


def test_staff_scope_by_department_and_zone(api):
    drain = api.create_report(category="drainage").json()
    # North-zone waste report and a south-zone one
    north_waste = api.create_report(category="garbage", lat=13.076, lng=80.244).json()
    south_waste = api.create_report(category="garbage", lat=13.024, lng=80.242).json()
    ids = {r["id"] for r in api.get("/api/reports", "waste_north").json()}
    assert north_waste["id"] in ids and south_waste["id"] not in ids and drain["id"] not in ids
    assert api.get(f"/api/reports/{south_waste['id']}", "waste_north").status_code == 403
    assert api.get(f"/api/reports/{drain['id']}", "waste_north").status_code == 403
    assert api.get(f"/api/reports/{drain['id']}", "drains").status_code == 200
    assert len(api.get("/api/reports", "supervisor").json()) == 3


def test_full_staff_workflow_with_history(api, db_session):
    rid = api.create_report().json()["id"]
    assert api.post(f"/api/reports/{rid}/accept", "supervisor", json={"note": ""}).status_code == 403  # supervisors assign, not accept
    assert api.post(f"/api/reports/{rid}/accept", "waste_north", json={"note": ""}).status_code == 403  # other department
    r = api.post(f"/api/reports/{rid}/accept", "drains", json={"note": "On it"})
    assert r.status_code == 200 and r.json()["status"] == "assigned" and r.json()["assignedStaffId"] == uid("drains")
    assert api.post(f"/api/reports/{rid}/accept", "drains2", json={"note": ""}).status_code == 422  # already claimed

    # Colleague in the same department cannot work on someone else's assignment
    assert api.post(f"/api/reports/{rid}/status", "drains2", json={"newStatus": "in_progress", "comment": "Taking over now"}).status_code == 403
    # Invalid jump
    assert api.post(f"/api/reports/{rid}/status", "drains", json={"newStatus": "resolved", "comment": "Done already", "resolutionSummary": "x" * 30}).status_code == 422
    assert api.post(f"/api/reports/{rid}/status", "drains", json={"newStatus": "in_progress", "comment": "Crew on site now"}).status_code == 200
    # Resolution needs a photo
    no_photo = api.post(f"/api/reports/{rid}/status", "drains", json={"newStatus": "resolved", "comment": "All cleared up", "resolutionSummary": "Drain desilted over 20 m."})
    assert no_photo.status_code == 422 and "evidence" in no_photo.json()["field_errors"]
    ev = api.post(f"/api/reports/{rid}/evidence", "drains", data={"type": "resolution", "caption": "After"}, files={"photo": ("a.png", PNG, "image/png")})
    assert ev.status_code == 201, ev.text
    done = api.post(f"/api/reports/{rid}/status", "drains", json={"newStatus": "resolved", "comment": "All cleared up", "resolutionSummary": "Drain desilted over 20 m."})
    assert done.status_code == 200 and done.json()["resolvedAt"]

    hist = db_session.scalars(select(StatusHistory.new_status).where(StatusHistory.report_id == uuid.UUID(done.json()["id"])).order_by(StatusHistory.created_at)).all()
    assert hist == ["open", "assigned", "in_progress", "resolved"]
    actions = set(db_session.scalars(select(AuditLog.action)))
    assert {"report.created", "assignment.accepted", "report.status_changed", "evidence.uploaded"} <= actions


def test_internal_notes_never_reach_citizen_or_public(api):
    rid = api.create_report().json()["id"]
    api.post(f"/api/reports/{rid}/accept", "drains", json={"note": ""})
    assert api.post(f"/api/reports/{rid}/notes", "drains", json={"body": "Contractor is unreliable", "internal": True}).status_code == 201
    assert api.post(f"/api/reports/{rid}/notes", "drains", json={"body": "Crew scheduled tomorrow", "internal": False}).status_code == 201
    pub = str(api.get(f"/api/public/reports/{rid}").json())
    mine = str(api.get(f"/api/reports/mine/{rid}", "citizen").json())
    work = str(api.get(f"/api/reports/{rid}", "drains").json())
    assert "Contractor is unreliable" not in pub and "Contractor is unreliable" not in mine and "Contractor is unreliable" in work
    assert "Crew scheduled tomorrow" in pub
    assert "Drains All" not in pub  # staff names are not shown publicly


def test_assignment_rules(api):
    rid = api.create_report().json()["id"]
    assert api.post(f"/api/reports/{rid}/assign", "citizen", json={"departmentId": str(DEPT_DRAINS), "reason": "please assign"}).status_code == 403
    bad = api.post(f"/api/reports/{rid}/assign", "supervisor", json={"departmentId": str(DEPT_DRAINS), "staffId": uid("waste_north"), "reason": "Wrong department person"})
    assert bad.status_code == 422
    ok = api.post(f"/api/reports/{rid}/assign", "supervisor", json={"departmentId": str(DEPT_DRAINS), "staffId": uid("drains"), "reason": "Drains crew is nearest"})
    assert ok.status_code == 200 and ok.json()["status"] == "assigned"
    # Staff may hand over within their department but not to another department
    assert api.post(f"/api/reports/{rid}/reassign", "drains", json={"departmentId": str(DEPT_WASTE), "reason": "Not drainage really"}).status_code == 403
    assert api.post(f"/api/reports/{rid}/reassign", "drains", json={"departmentId": str(DEPT_DRAINS), "staffId": uid("drains2"), "reason": "Shift change handover"}).status_code == 200


def test_severity_triage_requires_reason_and_scope(api):
    rid = api.create_report().json()["id"]
    api.post(f"/api/reports/{rid}/accept", "drains", json={"note": ""})
    assert api.patch(f"/api/reports/{rid}", "citizen", json={"severity": "critical", "reason": "It is very bad"}).status_code == 403
    assert api.patch(f"/api/reports/{rid}", "drains", json={"severity": "critical", "reason": ""}).status_code == 422
    r = api.patch(f"/api/reports/{rid}", "drains", json={"severity": "critical", "reason": "Open manhole, risk to pedestrians"})
    assert r.status_code == 200 and r.json()["severity"] == "critical"


def test_feedback_and_dispute_flow(api):
    rid = api.create_report().json()["id"]
    assert api.post(f"/api/reports/{rid}/feedback", "citizen", json={"rating": 5}).status_code == 422  # not resolved yet
    api.post(f"/api/reports/{rid}/accept", "drains", json={"note": ""})
    api.post(f"/api/reports/{rid}/status", "drains", json={"newStatus": "in_progress", "comment": "Crew on site now"})
    api.post(f"/api/reports/{rid}/evidence", "drains", data={"type": "resolution"}, files={"photo": ("a.png", PNG, "image/png")})
    api.post(f"/api/reports/{rid}/status", "drains", json={"newStatus": "resolved", "comment": "All cleared up", "resolutionSummary": "Drain desilted over 20 m."})
    assert api.post(f"/api/reports/{rid}/reopen-request", "citizen2", json={"comment": "This is still a problem here"}).status_code == 403
    assert api.post(f"/api/reports/{rid}/reopen-request", "citizen", json={"comment": "short"}).status_code == 422
    fb = api.post(f"/api/reports/{rid}/reopen-request", "citizen", json={"comment": "Water is overflowing again after rain"})
    assert fb.status_code == 201
    disputes = api.get("/api/supervisor/disputes", "supervisor").json()
    assert [d["id"] for d in disputes] == [fb.json()["id"]]
    assert api.post(f"/api/supervisor/disputes/{fb.json()['id']}/decision", "drains", json={"decision": "approved", "reason": "Confirmed on site"}).status_code == 403
    assert api.post(f"/api/supervisor/disputes/{fb.json()['id']}/decision", "supervisor", json={"decision": "approved", "reason": ""}).status_code == 422
    assert api.post(f"/api/supervisor/disputes/{fb.json()['id']}/decision", "supervisor", json={"decision": "approved", "reason": "Photo confirms recurrence"}).status_code == 204
    assert api.get(f"/api/reports/mine/{rid}", "citizen").json()["report"]["status"] == "reopened"


def test_extension_request_and_review(api):
    rid = api.create_report().json()["id"]
    api.post(f"/api/reports/{rid}/accept", "drains", json={"note": ""})
    later = (datetime.now(UTC) + timedelta(days=30)).isoformat()
    assert api.post(f"/api/reports/{rid}/extension-requests", "drains2", json={"deadlineKind": "resolution", "requestedDeadline": later, "reason": "Need heavy machinery from depot"}).status_code == 403
    x = api.post(f"/api/reports/{rid}/extension-requests", "drains", json={"deadlineKind": "resolution", "requestedDeadline": later, "reason": "Need heavy machinery from depot"})
    assert x.status_code == 201
    assert api.post(f"/api/reports/{rid}/extension-requests", "drains", json={"deadlineKind": "resolution", "requestedDeadline": later, "reason": "Another one for the same report"}).status_code == 422
    assert api.post(f"/api/supervisor/extensions/{x.json()['id']}/review", "supervisor", json={"decision": "approved", "reason": ""}).status_code == 422
    assert api.post(f"/api/supervisor/extensions/{x.json()['id']}/review", "supervisor", json={"decision": "approved", "reason": "Verified equipment delay"}).status_code == 204
    detail = api.get(f"/api/reports/{rid}", "supervisor").json()
    assert detail["report"]["deadlines"]["resolution"].startswith(later[:16])
    assert detail["report"]["originalDeadlines"]["resolution"] != detail["report"]["deadlines"]["resolution"]


def test_notifications_are_private(api):
    api.create_report()
    mine = api.get("/api/notifications", "citizen").json()
    assert mine and all(n["userId"] == uid("citizen") for n in mine)
    assert api.get("/api/notifications", "citizen2").json() == []
    api.post("/api/notifications/read", "citizen2", json={"all": True})  # cannot touch other users' rows
    assert any(not n["read"] for n in api.get("/api/notifications", "citizen").json())


def test_rate_limit_on_submissions(api, monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "report_rate_limit_per_hour", 2)
    assert api.create_report().status_code == 201
    assert api.create_report().status_code == 201
    assert api.create_report().status_code == 429
