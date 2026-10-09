from datetime import UTC, datetime, timedelta

import jwt

from conftest import ISSUER, USERS, token_for


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["database"] == "ok"


def test_protected_routes_require_token(api):
    for path in ("/api/me", "/api/reports/mine", "/api/reports", "/api/supervisor/escalations", "/api/notifications"):
        assert api.get(path).status_code == 401, path


def test_rejects_bad_tokens(client):
    uid = USERS["citizen"]["id"]
    expired = token_for(uid, exp=datetime.now(UTC) - timedelta(hours=2))
    wrong_secret = jwt.encode({"sub": str(uid), "aud": "authenticated", "iss": ISSUER, "exp": datetime.now(UTC) + timedelta(hours=1)}, "another-secret-another-secret-xx", algorithm="HS256")
    wrong_iss = token_for(uid, iss="https://evil.example/auth/v1")
    wrong_aud = token_for(uid, aud="anon")
    dev_token = token_for(uid, iss="civicvision-dev")
    for t in (expired, wrong_secret, wrong_iss, wrong_aud, dev_token, "not-a-jwt"):
        assert client.get("/api/me", headers={"Authorization": f"Bearer {t}"}).status_code == 401


def test_me_returns_server_side_role(api, client):
    r = api.get("/api/me", "supervisor")
    assert r.status_code == 200
    assert r.json()["profile"]["role"] == "supervisor"
    # A role claim inside the token is ignored — the role always comes from the profiles table.
    t = token_for(USERS["citizen"]["id"], user_metadata={"role": "administrator"}, app_role="administrator")
    assert client.get("/api/me", headers={"Authorization": f"Bearer {t}"}).json()["profile"]["role"] == "citizen"


def test_unknown_user_is_provisioned_as_citizen(client):
    import uuid

    t = token_for(uuid.uuid4(), user_metadata={"display_name": "New Person", "role": "supervisor"})
    body = client.get("/api/me", headers={"Authorization": f"Bearer {t}"}).json()
    assert body["profile"]["role"] == "citizen"
    assert body["profile"]["displayName"] == "New Person"


def test_directory_is_public(api):
    assert len(api.get("/api/directory/departments").json()) == 4
    assert len(api.get("/api/directory/zones").json()) == 4
    assert len(api.get("/api/directory/sla-policies").json()) == 16
    assert api.get("/api/directory/staff").status_code == 401
    assert api.get("/api/directory/staff", "citizen").status_code == 403


def test_public_views_hide_private_fields(api):
    created = api.create_report().json()
    listing = api.get("/api/public/reports").json()
    assert listing and all("citizenId" not in r and "assignedStaffId" not in r for r in listing)
    bundle = api.get(f"/api/public/reports/{created['id']}").json()
    assert "citizenId" not in bundle["report"]
    assert all(e["uploadedBy"] == "" for e in bundle["evidence"])
    found = api.get(f"/api/public/reports/by-public-id/{created['publicId'].lower()}")
    assert found.status_code == 200 and found.json()["id"] == created["id"]
    assert api.get("/api/public/reports/by-public-id/CV-1999-00001").status_code == 404


def test_cors_allows_only_configured_origins(client):
    ok = client.options("/api/public/reports", headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET"})
    bad = client.options("/api/public/reports", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"})
    assert ok.headers.get("access-control-allow-origin") == "http://localhost:5173"
    assert "access-control-allow-origin" not in bad.headers


def test_dev_login_disabled_by_default(client):
    assert client.post("/api/dev/login", json={"email": "asha@dev.civicvision.local"}).status_code == 404
