import json
import uuid

import httpx
import pytest

from app.config import get_settings
from app.services import supabase_admin
from conftest import DEPT_DRAINS, ZONE_NORTH, token_for


@pytest.fixture()
def fake_supabase(monkeypatch):
    """Simulates the Supabase admin API; records created users."""
    monkeypatch.setattr(get_settings(), "supabase_service_role_key", "sb_secret_test")
    created: dict[str, dict] = {}

    def handler(req: httpx.Request):
        body = json.loads(req.content)
        assert req.headers["apikey"] == "sb_secret_test"
        assert body["email_confirm"] is True  # confirmed immediately — no email is sent
        if body["email"] in created:
            return httpx.Response(422, json={"error_code": "email_exists", "msg": "A user with this email address has already been registered"})
        uid = str(uuid.uuid4())
        created[body["email"]] = {"id": uid, **body}
        return httpx.Response(200, json={"id": uid, "email": body["email"]})

    monkeypatch.setattr(supabase_admin, "_transport", httpx.MockTransport(handler))
    return created


def test_register_creates_confirmed_citizen(client, fake_supabase):
    r = client.post("/api/auth/register", json={"displayName": "New Resident", "email": "New@Example.org", "password": "Str0ngPass"})
    assert r.status_code == 201, r.text
    assert fake_supabase["new@example.org"]["user_metadata"] == {"display_name": "New Resident"}
    me = client.get("/api/me", headers={"Authorization": f"Bearer {token_for(uuid.UUID(r.json()['id']))}"}).json()
    assert me["profile"]["role"] == "citizen"


def test_register_validation_and_duplicates(client, fake_supabase):
    assert client.post("/api/auth/register", json={"displayName": "A B", "email": "bad", "password": "Str0ngPass"}).status_code == 422
    assert client.post("/api/auth/register", json={"displayName": "A B", "email": "a@b.org", "password": "weakpassword"}).status_code == 422
    ok = client.post("/api/auth/register", json={"displayName": "A B", "email": "a@b.org", "password": "Str0ngPass"})
    assert ok.status_code == 201
    dup = client.post("/api/auth/register", json={"displayName": "A B", "email": "a@b.org", "password": "Str0ngPass"})
    assert dup.status_code == 409


def test_register_cannot_choose_role(client, fake_supabase):
    r = client.post("/api/auth/register", json={"displayName": "Sneaky", "email": "s@x.org", "password": "Str0ngPass", "role": "administrator"})
    assert r.status_code == 201
    me = client.get("/api/me", headers={"Authorization": f"Bearer {token_for(uuid.UUID(r.json()['id']))}"}).json()
    assert me["profile"]["role"] == "citizen"


def test_register_rate_limited(client, fake_supabase):
    codes = [client.post("/api/auth/register", json={"displayName": "Spam", "email": f"s{i}@x.org", "password": "Str0ngPass"}).status_code for i in range(12)]
    assert codes[:10] == [201] * 10 and codes[-1] == 429


def test_admin_creates_authority_accounts(api, fake_supabase):
    body = {"displayName": "Road Crew", "email": "crew@city.example", "password": "Temp1234x", "role": "staff", "departmentId": str(DEPT_DRAINS), "zoneIds": [str(ZONE_NORTH)]}
    for who in ("citizen", "drains", "supervisor"):
        assert api.post("/api/admin/users", who, json=body).status_code == 403
    assert api.post("/api/admin/users", "admin", json={**body, "role": "citizen"}).status_code == 422
    assert api.post("/api/admin/users", "admin", json={**body, "departmentId": None}).status_code == 422
    assert "crew@city.example" not in fake_supabase  # nothing created by the rejected requests
    r = api.post("/api/admin/users", "admin", json=body)
    assert r.status_code == 201, r.text
    p = r.json()
    assert p["role"] == "staff" and p["departmentId"] == str(DEPT_DRAINS) and p["zoneIds"] == [str(ZONE_NORTH)]
    official = api.post("/api/admin/users", "admin", json={"displayName": "Chief", "email": "chief@city.example", "password": "Temp1234x", "role": "supervisor", "allZones": True})
    assert official.status_code == 201 and official.json()["role"] == "supervisor"
    assert any(u["email"] == "crew@city.example" for u in api.get("/api/admin/users", "admin").json())


def test_account_creation_needs_server_key(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "supabase_service_role_key", "")
    r = client.post("/api/auth/register", json={"displayName": "A B", "email": "a@b.org", "password": "Str0ngPass"})
    assert r.status_code == 503


def test_access_request_flow(api, client, fake_supabase):
    # Sign-up asking for Department Authority access → still a citizen, with a pending request.
    assert client.post("/api/auth/register", json={"displayName": "Crew", "email": "crew2@x.org", "password": "Str0ngPass", "requestedRole": "staff"}).status_code == 422  # department required
    r = client.post("/api/auth/register", json={"displayName": "Crew Member", "email": "crew2@x.org", "password": "Str0ngPass", "requestedRole": "staff", "departmentId": str(DEPT_DRAINS), "note": "Employee ID 1234"})
    assert r.status_code == 201 and r.json()["accessRequestId"]
    uid = uuid.UUID(r.json()["id"])
    h = {"Authorization": f"Bearer {token_for(uid)}"}
    assert client.get("/api/me", headers=h).json()["profile"]["role"] == "citizen"
    mine = client.get("/api/me/access-request", headers=h).json()
    assert mine["status"] == "pending" and mine["requestedRole"] == "staff"
    assert client.get("/api/reports", headers=h).status_code == 403  # no staff powers before approval

    # Only administrators see and decide requests.
    assert api.get("/api/admin/access-requests", "supervisor").status_code == 403
    pending = api.get("/api/admin/access-requests?status=pending", "admin").json()
    assert [p["email"] for p in pending] == ["crew2@x.org"]
    rid = pending[0]["id"]
    assert api.post(f"/api/admin/access-requests/{rid}/decision", "admin", json={"decision": "approved", "role": "staff"}).status_code == 422  # needs department + zones
    ok = api.post(f"/api/admin/access-requests/{rid}/decision", "admin", json={"decision": "approved", "role": "staff", "departmentId": str(DEPT_DRAINS), "zoneIds": [str(ZONE_NORTH)]})
    assert ok.status_code == 200 and ok.json()["status"] == "approved"
    assert client.get("/api/me", headers=h).json()["profile"]["role"] == "staff"
    assert api.post(f"/api/admin/access-requests/{rid}/decision", "admin", json={"decision": "rejected", "reason": "Too late"}).status_code == 422  # already decided


def test_access_request_rejection_needs_reason(api, client, fake_supabase):
    r = client.post("/api/auth/register", json={"displayName": "Boss", "email": "boss@x.org", "password": "Str0ngPass", "requestedRole": "supervisor"})
    rid = api.get("/api/admin/access-requests", "admin").json()[0]["id"]
    assert api.post(f"/api/admin/access-requests/{rid}/decision", "admin", json={"decision": "rejected", "reason": ""}).status_code == 422
    done = api.post(f"/api/admin/access-requests/{rid}/decision", "admin", json={"decision": "rejected", "reason": "Not a city employee"})
    assert done.status_code == 200 and done.json()["status"] == "rejected"
    h = {"Authorization": f"Bearer {token_for(uuid.UUID(r.json()['id']))}"}
    assert client.get("/api/me", headers=h).json()["profile"]["role"] == "citizen"
