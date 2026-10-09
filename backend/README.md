# CIVICVISION AI — Backend

FastAPI · SQLAlchemy 2 · Pydantic 2 · PyJWT · psycopg 3. Python 3.12+ (tested on 3.14).

## Run locally (no Supabase needed)

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate            # macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt
copy .env.example .env            # then set DEV_LOGIN_ENABLED=true and a 32+ char DEV_JWT_SECRET
python -m app.seed --dev          # reference data + dev accounts + demo complaints (SQLite)
uvicorn app.main:app --reload --port 8000
```

Frontend against it: in `frontend/`, set `VITE_API_BASE_URL=http://localhost:8000` in `.env.apidev` (or a
`.env.local`) and run `npm run dev:api`. Sign in with the "Local development accounts" on the login page.

## Against Supabase
Follow [`../supabase/README.md`](../supabase/README.md), then set in `.env`:
`DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STORAGE_BACKEND=supabase`, `AUTO_CREATE_SCHEMA=false`,
`DEV_LOGIN_ENABLED=false`. Run `python -m app.seed` (reference data only) if you did not run `seed.sql`.

## Tests

```bash
pytest                                   # 29 API tests: auth, scope, workflow, forbidden operations, escalations
python scripts/smoke_test.py --base http://localhost:8000   # end-to-end over HTTP (needs dev login + --dev seed)
```

Postgres integration without Docker: `cd ../supabase/tests && npm install && npm run pg` starts PGlite (real Postgres)
on port 54329 with all migrations applied; then run the backend with
`DATABASE_URL=postgresql+psycopg://postgres:postgres@127.0.0.1:54329/postgres AUTO_CREATE_SCHEMA=false`,
`python -m app.seed --dev`, and the smoke test.

## Layout
```
app/
  main.py          app factory, CORS, routers, in-process SLA loop
  config.py        settings (env vars) with production guards
  auth.py          JWT verification (JWKS / HS256 / dev), profile loading, role dependencies
  permissions.py   scope rules shared by every endpoint
  models.py        ORM models (mirror supabase/migrations)
  schemas.py       Pydantic request/response models (camelCase JSON)
  filters.py       list filters
  services/        reports (workflows), sla (deadlines + idempotent escalations), analytics,
                   storage (Supabase / local / memory), uploads (file signature checks), rate_limit
  routers/         public, reports, supervisor, analytics, directory (/api/me), notifications, admin, system
  seed.py          reference + dev data
scripts/           provision_user.py (role provisioning), smoke_test.py
tests/             pytest suite
```

See [`../docs/API.md`](../docs/API.md) and [`../docs/SECURITY.md`](../docs/SECURITY.md).
