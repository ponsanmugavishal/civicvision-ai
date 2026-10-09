# API reference

Base URL: `VITE_API_BASE_URL` (local `http://localhost:8000`). JSON uses camelCase. Errors: `{"detail": str, "field_errors": {field: msg}}` with 401/403/404/409/422/429.
Interactive docs: `/docs` (disabled in production). Generated from the FastAPI OpenAPI schema.

Report list endpoints accept filters: `search`, `categories`, `statuses`, `severities`, `departmentIds`, `zoneIds` (comma-separated), `dateFrom`, `dateTo` (YYYY-MM-DD or ISO 8601), `overdueOnly`.

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/health` | Public | Health |
| POST | `/api/internal/sla/run` | `X-Cron-Secret` header | Trigger the deadline check from an external scheduler (Phase 3). Requires the CRON_SECRET header. |
| GET | `/api/me` | Signed in | Me |
| GET | `/api/me/permissions` | Signed in | My Permissions |
| GET | `/api/directory/departments` | Public | Departments |
| GET | `/api/directory/zones` | Public | Zones |
| GET | `/api/directory/sla-policies` | Public | Sla Policies |
| GET | `/api/directory/staff` | Staff+ (scoped) | Colleagues and supervisors, for assignment pickers and name display. Contact details are omitted. |
| GET | `/api/public/reports` | Public | List Public |
| GET | `/api/public/reports/by-public-id/{public_id}` | Public | By Public Id |
| GET | `/api/public/reports/{report_id}` | Public | Public Detail |
| POST | `/api/reports` | Citizen (own) | Create Report |
| GET | `/api/reports` | Staff+ (scoped) | Scoped Reports |
| GET | `/api/reports/mine` | Citizen (own) | My Reports |
| GET | `/api/reports/mine/{report_id}` | Citizen (own) | My Report |
| POST | `/api/reports/{report_id}/feedback` | Citizen (own) | Feedback |
| POST | `/api/reports/{report_id}/reopen-request` | Citizen (own) | Reopen Request |
| GET | `/api/assignments/mine` | Staff+ (scoped) | My Assignments |
| GET | `/api/reports/{report_id}` | Staff+ (scoped) | Work Detail |
| PATCH | `/api/reports/{report_id}` | Staff+ (scoped) | Only severity can be changed here (with a reason). Status, assignment and deadlines have dedicated endpoints. |
| GET | `/api/reports/{report_id}/history` | Staff+ (scoped) | History |
| GET | `/api/reports/{report_id}/evidence` | Staff+ (scoped) | List Evidence |
| POST | `/api/reports/{report_id}/evidence` | Staff+ (scoped) | Add Evidence |
| POST | `/api/reports/{report_id}/accept` | Staff+ (scoped) | Accept |
| POST | `/api/reports/{report_id}/reassign` | Staff+ (scoped) | Assign |
| POST | `/api/reports/{report_id}/assign` | Staff+ (scoped) | Assign |
| POST | `/api/reports/{report_id}/status` | Staff+ (scoped) | Update Status |
| POST | `/api/reports/{report_id}/notes` | Staff+ (scoped) | Add Note |
| POST | `/api/reports/{report_id}/extension-requests` | Staff+ (scoped) | Request Extension |
| GET | `/api/supervisor/overview` | Supervisor+ (scoped) | Overview |
| GET | `/api/supervisor/overdue` | Supervisor+ (scoped) | Overdue |
| GET | `/api/supervisor/escalations` | Supervisor+ (scoped) | Escalations |
| POST | `/api/supervisor/escalations/{event_id}/review` | Supervisor+ (scoped) | Review Escalation |
| GET | `/api/supervisor/extensions` | Supervisor+ (scoped) | Extensions |
| POST | `/api/supervisor/extensions/{extension_id}/review` | Supervisor+ (scoped) | Review Extension |
| POST | `/api/supervisor/reports/{report_id}/deadline-extension` | Supervisor+ (scoped) | Set Deadline |
| GET | `/api/supervisor/disputes` | Supervisor+ (scoped) | Disputes |
| POST | `/api/supervisor/disputes/{feedback_id}/decision` | Supervisor+ (scoped) | Decide |
| GET | `/api/supervisor/audit` | Supervisor+ (scoped) | Audit Log |
| GET | `/api/analytics/summary` | Public (scoped when signed in) | Summary |
| GET | `/api/analytics/hotspots` | Public (scoped when signed in) | Hotspots |
| GET | `/api/analytics/departments` | Staff+ (scoped) | Departments |
| GET | `/api/analytics/trend` | Staff+ (scoped) | Trend |
| GET | `/api/notifications` | Signed in | List Notifications |
| POST | `/api/notifications/read` | Signed in | Mark Read |
| GET | `/api/admin/users` | Administrator | Users |
| PATCH | `/api/admin/users/{user_id}` | Administrator | Update User |
| POST | `/api/admin/users` | Administrator | Create Authority / Official account (temporary password) |
| GET | `/api/admin/access-requests?status=` | Administrator | Access requests |
| POST | `/api/admin/access-requests/{request_id}/decision` | Administrator | Approve (role, department, zones) or reject (reason required) |
| POST | `/api/auth/register` | Public (rate-limited) | Citizen sign-up, confirmed without email; optional `requestedRole` creates an access request |
| GET | `/api/me/access-request` | Signed in | Caller's latest access request |
| POST | `/api/dev/login` | Dev only (`DEV_LOGIN_ENABLED`) | Issue a token for a seeded @dev.civicvision.local account; 404 otherwise. |
| GET | `/api/media/{token}` | Signed link | Serves local-storage files (dev); HMAC-signed, expiring. |

`POST /api/reports` and `POST /api/reports/{report_id}/evidence` are `multipart/form-data` with a `photo` file (JPEG/PNG/WebP, ≤ 5 MB, verified by file signature). Report fields: `category`, `description`, `latitude`, `longitude`, `address`, `landmark`. Evidence fields: `type` (`progress`|`resolution`|`other`), `caption`.
