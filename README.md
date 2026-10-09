# CIVICVISION AI

**From Citizen Reports to Intelligent Civic Action.**

A map-first civic issue reporting and accountability platform for three issue categories (garbage & waste
dumping, blocked drains & waterlogging, potholes & damaged roads), with separate portals for citizens,
department staff and supervisors.

> Independent hackathon prototype. Not affiliated with, endorsed by, or operated for any government body.

## Project status

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Frontend, UX, all three portals, demo data, mock service layer | **Complete** |
| 2 | FastAPI backend, Supabase DB/Auth/Storage/RLS migrations, real workflows | **Complete** (verified locally; not yet run against a real Supabase project) |
| 3 | Gemini image assistance (free tier), duplicate detection, database-scheduled SLA checks, realtime updates, deployment config | **Code complete** — waiting for Supabase/Gemini credentials and the actual deploy |

The frontend runs in two modes:
- **Demo mode** (`VITE_DATA_MODE=mock`, default) — fictional data in the browser only, no backend.
- **API mode** (`VITE_DATA_MODE=api`) — FastAPI backend + Supabase Postgres/Auth/Storage.

## Repository layout

```
hackathon/
├─ frontend/            React + Vite + TypeScript + Tailwind app
├─ backend/             FastAPI API (see backend/README.md)
├─ supabase/            SQL migrations, seed, migration tests (see supabase/README.md)
├─ docs/                API.md, SECURITY.md, DEPLOYMENT.md (Supabase/Render/Vercel), DEMO_CHECKLIST.md
├─ render.yaml          Render blueprint for the backend
│  ├─ src/
│  │  ├─ types/         Domain models (mirror the planned Supabase schema)
│  │  ├─ config/        Typed access to public VITE_* env vars
│  │  ├─ data/          Demo directory (departments, zones, people, SLA examples) + seed generator
│  │  ├─ services/      CivicApi contract, mock implementation, HTTP implementation
│  │  ├─ lib/           Deadline logic, filters, formatting, geo, image handling, placeholders
│  │  ├─ hooks/         useApi / useMutation / useDebounced
│  │  ├─ context/       Demo auth session, toasts
│  │  ├─ components/    ui/ (design system), report/, map/, charts/, supervisor/
│  │  ├─ layouts/       Public layout, portal layout (sidebar), route guard, demo banner
│  │  └─ pages/         public/, citizen/, staff/, supervisor/
│  └─ .env.example
└─ .claude/launch.json  Dev-server launch config
```

## Quick start

Requirements: Node.js 20.19+ or 22.12+ (tested with Node 24.14), Python 3.12+ (tested with 3.14).

**Demo mode (frontend only):**

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173.

**API mode, fully local (no Supabase account needed):** start the backend as in [backend/README.md](backend/README.md)
(SQLite + dev login), set `VITE_API_BASE_URL=http://localhost:8000` in `frontend/.env.apidev`, then
`npm run dev:api` and use the "Local development accounts" on the login page.

**API mode with Supabase:** follow [supabase/README.md](supabase/README.md), configure `backend/.env` and
`frontend/.env.local` (`VITE_DATA_MODE=api`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_BASE_URL`).

Other commands (run inside `frontend/`):

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server on port 5173 (demo mode) |
| `npm run dev:api` | Dev server using `.env.apidev` (API mode + dev login) |
| `npm run typecheck` | TypeScript project check (`tsc -b`) |
| `npm run lint` | oxlint |
| `npm test` | Vitest unit tests (domain rules, permissions, workflow, escalation idempotency) |
| `npm run build` | Type-check + production build into `frontend/dist` |
| `npm run preview` | Serve the production build locally |

## Trying the demo

Sign in from **/login** with a demo persona (no password needed in demo mode):

| Persona | Role | Scope |
| --- | --- | --- |
| Asha Raman | Citizen | Own complaints |
| Karthik Natarajan | Staff — Solid Waste | North & Central zones only |
| Rahul Menon | Staff — Drains | All zones, drainage only |
| Arun Balaji | Staff — Roads | All zones, potholes only |
| Lakshmi Iyer | Supervisor | All departments and zones |

You can also create a demo **citizen** account at **/register**. Self-registration can never create staff or
supervisor accounts.

Suggested walkthrough: citizen reports a drainage issue → Drains staff accepts it from the *Unclaimed* queue,
moves it to *In progress*, uploads a resolution photo and resolves it → citizen requests reopening →
supervisor approves the dispute under *Extensions & disputes* and reviews escalations.

## Design notes

- **Severity ≠ deadline status.** Severity is shown by marker colour/size and a bar glyph; deadline status by a
  separate corner badge (orange clock = due soon, red "!" with pulse = overdue) and clock badges in lists.
- **Three SLA stages** per complaint (acknowledgement, initial action, resolution). Targets in the demo are
  *illustrative, configurable examples* — not legal or municipal standards.
- **Escalations** are created when a stage target is missed. The check is idempotent (keyed by report, stage
  and deadline timestamp) and never erases an earlier breach, even after an approved extension.
- **Public views** never show reporter identity, contact details or internal notes.
- **Photos** in seed data are generated SVG illustrations visibly labelled "DEMO PLACEHOLDER — not a real photo".

## Known limitations

- **Not yet verified against a real Supabase project** (no credentials were available). Migrations were verified on
  real Postgres via PGlite with stub `auth`/`storage` schemas; Supabase Auth sign-up/sign-in and Supabase Storage
  uploads are implemented but untested end-to-end.
- Demo mode: no real authentication; permission checks run in the browser; data lives in `localStorage`.
- AI suggestions need `GEMINI_API_KEY` on the backend; without it the app shows "AI assistance unavailable".
  Suggestions are never applied automatically, and no confidence score is shown (none has been calibrated).
- Duplicate detection is rules-based (distance, category, time window, word overlap) — no image similarity.
- Deadline checks run in the database every 5 minutes via pg_cron (plus an idempotent backup loop in the backend).
- Rate limiting is per process (fine for a single instance).
- Report photos are public on the map and may include bystanders or number plates; there is no automatic blurring.
- Notifications are in-app only (polled every minute in API mode); no email/SMS/push is sent.
- Zones are assigned by nearest zone centre, not real ward boundaries.
- Map tiles come from the public OpenStreetMap tile server; if they fail to load, a notice is shown and the rest
  of the interface keeps working.
