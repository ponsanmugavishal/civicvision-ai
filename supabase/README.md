# Supabase setup

Free plan is enough. You need: a project, the SQL below applied, Auth configured, and four values for the
backend/frontend environment.

## 1. Create the project
supabase.com → New project. Note the **Project URL** (`https://<ref>.supabase.co`).

## 2. Apply the schema
Either paste each file into **SQL Editor → New query → Run**, in this order:

1. `migrations/20261009000100_schema.sql` — tables, constraints, triggers (incl. auth.users → profiles)
2. `migrations/20261009000200_rls.sql` — Row Level Security and grants
3. `migrations/20261009000300_storage.sql` — private `report-media` bucket
4. `migrations/20261010000100_phase3.sql` — AI suggestions, duplicate flags, pg_cron deadline check, realtime
5. `migrations/20261010000200_security_hardening.sql`
6. `seed.sql` — demo departments, zones and illustrative SLA policies (safe to re-run)

…or with the Supabase CLI: `supabase link --project-ref <ref>` then `supabase db push`, and run `seed.sql` in the SQL editor.

Verify locally without a project (real Postgres via PGlite): `cd supabase/tests && npm install && npm run verify`.

## 3. Auth settings
- **Authentication → Providers → Email**: enabled. Email confirmation on is recommended (the app shows a
  "check your email" screen); turn it off for quicker hackathon demos.
- **Authentication → URL Configuration**: Site URL = your frontend URL (e.g. `http://localhost:5173`, later the Vercel
  URL); add the same to Redirect URLs.

## 4. Collect environment values
| Where in Supabase | Variable | Goes to |
|---|---|---|
| Project Settings → API → Project URL | `SUPABASE_URL` / `VITE_SUPABASE_URL` | backend + frontend |
| Project Settings → API → anon / publishable key | `VITE_SUPABASE_ANON_KEY` | frontend only (public by design) |
| Project Settings → API → service_role / secret key | `SUPABASE_SERVICE_ROLE_KEY` | **backend only** (storage + provisioning) |
| Project Settings → Database → Connection string → Session pooler | `DATABASE_URL` (`postgresql+psycopg://…`) | **backend only** |
| Project Settings → JWT (only if still on the legacy shared secret) | `SUPABASE_JWT_SECRET` | **backend only** |

Projects using the newer asymmetric JWT signing keys need no JWT secret: the backend fetches the public keys from
`<SUPABASE_URL>/auth/v1/.well-known/jwks.json`.

Backend settings for Supabase: `STORAGE_BACKEND=supabase`, `AUTO_CREATE_SCHEMA=false`.

## 5. First administrator and staff
Everyone signs up as a citizen. Promote people from the backend machine:

```bash
python scripts/provision_user.py --email you@example.org --role administrator --all-zones
python scripts/provision_user.py --email crew@example.org --role staff --department roads --zones north,central
```

Slugs: departments `solid-waste`, `stormwater-drains`, `roads`, `ward-services`; zones `north`, `central`, `south`, `west`.
After that, administrators can manage roles through `PATCH /api/admin/users/{id}`.
