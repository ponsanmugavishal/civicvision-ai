# Manual end-to-end checklist

Use three browsers/profiles: **Citizen**, **Staff** (e.g. Roads, zones north+central), **Supervisor** (all zones).
Tick each step on the deployed site (or locally with `npm run dev:api` + dev accounts).

## Citizen → staff → supervisor
- [ ] Citizen signs up, confirms email, signs in. Header shows **Citizen portal**; role cannot be chosen anywhere.
- [ ] *Report an issue*: choose a photo → **Suggest from photo** shows a category with explanation and indicators,
      or "AI assistance unavailable" (no Gemini key) — never a made-up answer.
- [ ] Choose a different category than suggested; drop a pin near an existing report of the same type →
      the orange **similar issue nearby** box lists it; submit anyway → succeeds with a CV-YYYY-NNNNN id.
- [ ] Public map shows the new marker; its panel shows photo and timeline but **no** reporter name or contact.
- [ ] Staff dashboard updates within seconds (**Live** badge) and lists it under *Unclaimed*.
- [ ] Staff from another department/zone opening the URL directly gets "outside your scope".
- [ ] Staff: *Accept* → *Severity triage* to High with a reason → *Move to In progress* → *Triage hints* shows the
      AI suggestion vs the citizen's choice and the possible duplicate.
- [ ] Staff tries *Resolved* without a resolution photo → blocked; upload a resolution photo → resolve succeeds.
- [ ] Citizen receives in-app notifications for each status change; the timeline shows each step.
- [ ] Citizen *Request reopening* with a reason → Supervisor *Extensions & disputes → Disputed resolutions* →
      **Approve & reopen** (reason required) → status becomes *Reopened* with fresh deadlines.

## Deadlines and escalation
- [ ] In the SQL editor, make a test report overdue:
      `update reports set acknowledgement_deadline = now() - interval '1 hour' where public_id = 'CV-…';`
      then `select public.run_sla_check();` (or wait ≤ 5 minutes for pg_cron).
- [ ] Supervisor gets an *Escalation* notification; *Action queues → Overdue* and *Escalations* list it.
- [ ] Run `select public.run_sla_check();` again → returns 0 (no duplicate escalation).
- [ ] Staff requests an extension; supervisor approves with a reason → deadline moves, the earlier escalation stays.
- [ ] *Audit trail* shows every action with actor names; nothing can be edited or deleted.

## Analytics
- [ ] *Performance & hotspots*: filters by period, category, severity, department and zone change the charts.
- [ ] Three or more reports within ~250 m appear as a hotspot.

## Security spot checks
- [ ] Signed-out `GET /api/reports` → 401; citizen token → 403.
- [ ] Uploading a `.txt` renamed to `.jpg` → rejected.
- [ ] Built frontend contains no `service_role`, database URL or Gemini key.
