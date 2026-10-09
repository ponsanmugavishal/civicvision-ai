# Authentication & authorisation model

## Identity
- **Supabase Auth** handles sign-up, sign-in, password storage, email confirmation and session refresh in the browser
  (`@supabase/supabase-js`, anon key only).
- The browser sends the Supabase **access token** as `Authorization: Bearer <jwt>` to the FastAPI backend.
- The backend verifies every token (`backend/app/auth.py`): signature (project JWKS for ES256/RS256 signing keys, or
  the legacy HS256 secret), `exp`, `aud = authenticated`, and `iss = <SUPABASE_URL>/auth/v1`. Anything else → `401`.

## Roles come from the database, never the client
- Role and scope live in `public.profiles` (`role`, `department_id`, `all_zones`) and `public.profile_zones`.
- New auth users get a **citizen** profile from the `on_auth_user_created` trigger. Sign-up metadata can set a display
  name only; a `role` field in metadata or token claims is ignored (tested).
- Only an **administrator** can change roles: `PATCH /api/admin/users/{id}` or `backend/scripts/provision_user.py`
  (server-side, uses `DATABASE_URL`). Every change is written to the audit log.
- Clients cannot update `role`, `department_id` or `all_zones`: there are no column grants for them (RLS migration).

## Scope rules (enforced in `backend/app/permissions.py` on every endpoint)
| Role | Can see | Can change |
|---|---|---|
| citizen | own reports (+ public map) | submit reports, rate/dispute own resolved reports |
| staff | reports routed to their department within their zones | accept unclaimed reports; status, notes, evidence, severity and extension requests on reports **assigned to them**; hand over within their department |
| supervisor | all departments (or their `department_id` if set) within their zones (`all_zones` or listed) | assign/reassign, status, severity, review extensions/escalations, decide disputes, set deadlines, read audit |
| administrator | everything | everything above + roles |

List endpoints apply the same rule at SQL level (`scope_query`), detail endpoints re-check (`ensure_view`), and mutating
endpoints check `can_work`. Hiding a button in the UI is never the protection — tests call the API directly as the
wrong role and expect `403`.

## Database (defence in depth)
- The backend connects with the database owner role and enforces the rules above.
- **RLS is enabled on every table.** Through the public Supabase Data API (anon key) a client can read only:
  reference data, its own profile, its own reports and its own notifications. Public map data is served only
  by the backend's field-filtered `/api/public/*` endpoints. No table accepts client writes. Verified by `supabase/tests/verify_migrations.mjs`.
- Trigger and SLA functions are not executable by `anon`/`authenticated`; the Supabase security advisor reports
  no warnings (only the expected "RLS enabled, no policy" notices for backend-only tables).
- `status_history` and `audit_logs` are append-only (UPDATE/DELETE raise), and escalation events cannot be deleted.

## Files
- Photos go to a **private** Supabase Storage bucket (`report-media`, 5 MB, JPEG/PNG/WebP). There are no client storage
  policies; the backend uploads with the service-role key after checking the real file signature and size, and
  returns short-lived **signed URLs** (default 15 minutes).
- Local development uses `STORAGE_BACKEND=local` with HMAC-signed, expiring `/api/media/...` links.

## Public data
Public endpoints (`/api/public/*`, public analytics) never include reporter id/name/contact, staff names, internal
notes, assignment history or feedback. Original and resolution photos are public, so they may show bystanders —
see limitations in the README.

## Other controls
- CORS: exact origins from `CORS_ORIGINS`; `*` is refused in production.
- Rate limits (per user, per hour): report submissions and evidence uploads (`429` when exceeded). In-process — use a
  shared store if you run several backend instances.
- Validation: Pydantic models + explicit business rules (`422` with `field_errors`); unexpected errors return a
  generic `500` without internals.
- Secrets (`DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `CRON_SECRET`) are backend-only.
  The frontend bundle is scanned for them in CI-style checks (see README) — none present.
- Dev login (`/api/dev/login`) exists only when `DEV_LOGIN_ENABLED=true`, only for `@dev.civicvision.local` seeded
  accounts, and the server refuses to start with it in `ENV=production`.
