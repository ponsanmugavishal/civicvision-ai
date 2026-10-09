# CIVICVISION AI — Frontend

React 19 · Vite 8 · TypeScript 6 · Tailwind CSS 4 · React Router 8 · Leaflet + OpenStreetMap
(with marker clustering) · Recharts · Lucide icons.

See the [project README](../README.md) for the overview, demo personas and limitations.

## Commands

```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck
npm run lint
npm test
npm run build      # outputs dist/
```

## Environment

Copy `.env.example` to `.env.local`. Every `VITE_*` value is bundled into public JavaScript, so never put
secrets there. In Phase 1 the app always runs in demo mode; `VITE_DATA_MODE=api` is reserved for the Phase 2
backend and currently logs an error and stays in demo mode.

## Architecture

- **`src/services/types.ts`** defines the `CivicApi` contract every page uses. `src/services/index.ts` exports the
  active implementation (`mockApi` in Phase 1). Phase 2 adds an HTTP implementation with the same shape, so pages
  do not change.
- **`src/services/mock/`** holds the browser-only store (`store.ts`) and the mock API (`mockApi.ts`), including
  role/scope checks, workflow validation, audit logging, in-app notifications and the idempotent escalation check.
- **`src/lib/domain.ts`** holds the shared rules: category/status/severity metadata, deadline-state computation
  and allowed status transitions.
- **`src/data/seed.ts`** deterministically generates ~76 fictional complaints relative to the current time,
  so deadlines, escalations and hotspots stay meaningful whenever the demo is opened.
