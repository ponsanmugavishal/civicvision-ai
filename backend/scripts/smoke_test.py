"""End-to-end smoke test against a running backend (local or deployed).

    python scripts/smoke_test.py --base http://localhost:8000            # uses /api/dev/login (local dev only)

Exercises the main citizen → staff → supervisor flow over real HTTP and checks forbidden operations.
Requires dev accounts from `python -m app.seed --dev` and DEV_LOGIN_ENABLED=true on the server.
"""

import argparse
import struct
import sys
import zlib

import httpx

results: list[tuple[bool, str, str]] = []


def check(name: str, cond: bool, detail: str = "") -> None:
    results.append((cond, name, detail))


def png() -> bytes:
    w, h = 64, 48
    raw = b"".join(b"\x00" + bytes((30, 120, 200)) * w for _ in range(h))

    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:8000")
    base = ap.parse_args().base.rstrip("/")
    c = httpx.Client(base_url=base, timeout=20)

    h = c.get("/health").json()
    check("health", h.get("database") == "ok", str(h))

    def login(local: str) -> dict:
        r = c.post("/api/dev/login", json={"email": f"{local}@dev.civicvision.local"})
        r.raise_for_status()
        return {"Authorization": f"Bearer {r.json()['accessToken']}"}

    citizen, drains, waste_north, sup = login("asha"), login("rahul"), login("karthik"), login("lakshmi")
    check("roles come from the server", c.get("/api/me", headers=sup).json()["profile"]["role"] == "supervisor")

    form = {"category": "drainage", "description": "Smoke test: drain blocked and overflowing near the junction.", "latitude": "13.052", "longitude": "80.246", "address": "1 Smoke Test Road"}
    r = c.post("/api/reports", headers=citizen, data=form, files={"photo": ("p.png", png(), "image/png")})
    check("citizen creates report", r.status_code == 201, r.text[:200])
    rid = r.json()["id"]
    check("bad file type rejected", c.post("/api/reports", headers=citizen, data=form, files={"photo": ("x.txt", b"hello world" * 20, "text/plain")}).status_code == 422)
    check("staff cannot submit as citizen", c.post("/api/reports", headers=drains, data=form, files={"photo": ("p.png", png(), "image/png")}).status_code == 403)

    dup = c.get("/api/duplicates", headers=citizen, params={"lat": 13.0521, "lng": 80.2461, "category": "drainage", "description": "drain overflowing near junction"})
    check("duplicate check finds the new report", dup.status_code == 200 and any(d["id"] == rid for d in dup.json()), dup.text[:200])
    ai_r = c.post("/api/ai/classify-issue", headers=citizen, files={"photo": ("p.png", png(), "image/png")})
    check("AI endpoint answers without fabricating", ai_r.status_code == 200 and (ai_r.json()["available"] or ai_r.json()["suggestion"] is None), ai_r.text[:200])

    pub = c.get(f"/api/public/reports/{rid}").json()
    check("public detail hides reporter", "citizenId" not in pub["report"])
    img = pub["evidence"][0]["url"]
    img_url = img if img.startswith("http") else base + img
    check("photo served via signed URL", c.get(img_url).status_code == 200, img_url[:80])
    check("tampered media token rejected", c.get(img_url[:-4] + "AAAA").status_code in (403, 404))

    check("out-of-scope staff blocked", c.get(f"/api/reports/{rid}", headers=waste_north).status_code == 403)
    check("citizen blocked from staff view", c.get(f"/api/reports/{rid}", headers=citizen).status_code == 403)
    check("staff accepts", c.post(f"/api/reports/{rid}/accept", headers=drains, json={"note": "On it"}).json().get("status") == "assigned")
    check("start work", c.post(f"/api/reports/{rid}/status", headers=drains, json={"newStatus": "in_progress", "comment": "Crew on site now"}).status_code == 200)
    no_photo = c.post(f"/api/reports/{rid}/status", headers=drains, json={"newStatus": "resolved", "comment": "Cleared all silt", "resolutionSummary": "Drain desilted over 20 metres."})
    check("resolve blocked without photo", no_photo.status_code == 422)
    ev = c.post(f"/api/reports/{rid}/evidence", headers=drains, data={"type": "resolution", "caption": "After"}, files={"photo": ("a.png", png(), "image/png")})
    check("evidence upload", ev.status_code == 201, ev.text[:200])
    done = c.post(f"/api/reports/{rid}/status", headers=drains, json={"newStatus": "resolved", "comment": "Cleared all silt", "resolutionSummary": "Drain desilted over 20 metres."})
    check("resolve", done.status_code == 200 and done.json()["status"] == "resolved", done.text[:200])

    fb = c.post(f"/api/reports/{rid}/reopen-request", headers=citizen, json={"comment": "Overflowing again after rain last night"})
    check("citizen reopen request", fb.status_code == 201, fb.text[:200])
    check("staff cannot decide disputes", c.post(f"/api/supervisor/disputes/{fb.json()['id']}/decision", headers=drains, json={"decision": "approved", "reason": "Looks right"}).status_code == 403)
    d = c.post(f"/api/supervisor/disputes/{fb.json()['id']}/decision", headers=sup, json={"decision": "approved", "reason": "Recurrence confirmed by photo"})
    check("supervisor reopens", d.status_code == 204 and c.get(f"/api/reports/mine/{rid}", headers=citizen).json()["report"]["status"] == "reopened")

    hist = [t["status"] for t in c.get(f"/api/reports/{rid}/history", headers=sup).json() if t["kind"] == "status"]
    check("status history recorded", hist == ["open", "assigned", "in_progress", "resolved", "reopened"], str(hist))
    check("supervisor sees escalations", c.get("/api/supervisor/escalations", headers=sup).status_code == 200)
    check("audit trail populated", any(a["reportId"] == rid for a in c.get("/api/supervisor/audit", headers=sup).json()))
    check("citizen cannot change roles", c.patch(f"/api/admin/users/{rid}", headers=citizen, json={"role": "administrator"}).status_code == 403)
    check("analytics summary", c.get("/api/analytics/summary", headers=sup).json()["total"] >= 1)

    for ok, name, detail in results:
        print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f"  — {detail}" if not ok and detail else ""))
    failed = sum(not ok for ok, _, _ in results)
    print(f"\n{len(results) - failed}/{len(results)} checks passed against {base}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
