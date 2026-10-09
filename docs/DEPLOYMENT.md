# Deployment (free tiers): Supabase + Render + Vercel

Order: **Supabase → Render (backend) → Vercel (frontend) → update CORS → verify.**

## 1. Supabase (database, auth, storage, scheduled deadline checks)
Follow [`supabase/README.md`](../supabase/README.md): apply the four migrations in `supabase/migrations/` plus
`supabase/seed.sql`, configure Email auth and URLs.

The Phase 3 migration also:
- creates `public.run_sla_check()` and schedules it every 5 minutes with **pg_cron** (verify:
  `select jobname, schedule, active from cron.job;`). If pg_cron could not be enabled, enable it under
  *Database → Extensions* and re-run the `do $$ … cron.schedule … $$` block from that migration.
- adds `notifications` to the `supabase_realtime` publication for instant in-app notifications.

Realtime broadcast (used for live dashboards) works out of the box; keep *Realtime → Settings → "Allow public
access"* enabled (the channel carries only ids, never personal data).

## 2. Render (FastAPI backend)
1. Push the repository to GitHub.
2. Render → **New → Blueprint** → pick the repo. `render.yaml` defines `civicvision-api` (free plan, Python 3.13,
   health check `/health`).
3. Fill the prompted secrets:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Supabase → Connect → **Session pooler** URI, with the driver prefix changed to `postgresql+psycopg://` |
| `SUPABASE_URL` | `https://<ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API keys → service_role / secret key |
| `SUPABASE_JWT_SECRET` | blank unless the project still uses the legacy JWT secret |
| `GEMINI_API_KEY` | optional free key from https://aistudio.google.com/apikey (blank = "AI assistance unavailable") |
| `CORS_ORIGINS` | your Vercel URL, e.g. `https://civicvision.vercel.app` (set after step 3; comma-separate several) |

`CRON_SECRET` is generated automatically; use it with `POST /api/internal/sla/run` if you add an external scheduler.
Free Render instances sleep after ~15 minutes idle (first request then takes ~1 minute); deadline checks keep running
in the database regardless.

4. Check: `https://<service>.onrender.com/health` → `{"status":"ok","database":"ok","storage":"supabase",...}`.

## 3. Vercel (frontend)
1. Vercel → **Add New → Project** → import the repo → **Root Directory: `frontend`** (framework: Vite).
2. Environment variables (Production):

| Variable | Value |
|---|---|
| `VITE_API_BASE_URL` | `https://<service>.onrender.com` |
| `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon / publishable key (public by design) |

`frontend/.env.production` already sets `VITE_DATA_MODE=api` and disables dev login. Never put the service-role key,
database URL or Gemini key in any `VITE_` variable.
3. Deploy, then put the Vercel URL into Render's `CORS_ORIGINS` and Supabase's *Auth → URL Configuration*
   (Site URL + Redirect URLs).

## 4. First accounts
Sign up on the deployed site (creates a citizen). Promote yourself and staff from a machine with the backend
environment (`backend/.env` pointing at Supabase):

```bash
cd backend
python scripts/provision_user.py --email you@example.org --role administrator --all-zones
python scripts/provision_user.py --email crew@example.org --role staff --department roads --zones north,central
```

## 5. Verify
- `GET /health` is ok; `GET /api/public/reports` returns `[]` on a fresh project.
- Sign up → confirm email → submit a report with a photo → it appears on the public map without your name.
- Run the manual end-to-end checklist in [`DEMO_CHECKLIST.md`](DEMO_CHECKLIST.md).
- `cd frontend && npm run build` then search `dist/` for `service_role` — there must be no matches.

## Environment variable reference
Backend: see `backend/.env.example`. Frontend: see `frontend/.env.example`.
