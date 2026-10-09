-- CIVICVISION AI — Row Level Security
--
-- Access model
--   * The FastAPI backend connects with the database owner role (bypasses RLS) and enforces every role/scope
--     rule itself (backend/app/permissions.py). All writes go through the backend.
--   * RLS below is defence in depth for anything reachable with the public anon key through the Supabase
--     Data API: anonymous users can read reference data and the safe `public_reports` view only; signed-in
--     users can additionally read their own profile, reports and notifications. Nobody can write directly.

alter table public.departments enable row level security;
alter table public.zones enable row level security;
alter table public.profiles enable row level security;
alter table public.profile_zones enable row level security;
alter table public.report_counters enable row level security;
alter table public.reports enable row level security;
alter table public.assignments enable row level security;
alter table public.status_history enable row level security;
alter table public.progress_notes enable row level security;
alter table public.evidence enable row level security;
alter table public.sla_policies enable row level security;
alter table public.escalation_events enable row level security;
alter table public.deadline_extension_requests enable row level security;
alter table public.feedback enable row level security;
alter table public.audit_logs enable row level security;
alter table public.notifications enable row level security;

-- Start from nothing, then grant the minimum.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

-- Reference data: readable by everyone.
grant select on public.departments, public.zones, public.sla_policies to anon, authenticated;
create policy "reference data is public" on public.departments for select to anon, authenticated using (true);
create policy "reference data is public" on public.zones for select to anon, authenticated using (true);
create policy "reference data is public" on public.sla_policies for select to anon, authenticated using (true);

-- Profiles: a user can read their own row and change only harmless columns. `role`, `department_id`
-- and `all_zones` are not updatable by any client role, so nobody can promote themselves.
grant select on public.profiles to authenticated;
grant update (display_name, phone) on public.profiles to authenticated;
create policy "read own profile" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "update own profile" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Reports: citizens can read their own rows directly.
grant select on public.reports to authenticated;
create policy "citizens read own reports" on public.reports for select to authenticated using (citizen_id = (select auth.uid()));

-- Notifications: read own, mark own as read.
grant select on public.notifications to authenticated;
grant update (read) on public.notifications to authenticated;
create policy "read own notifications" on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy "mark own notifications" on public.notifications for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Every other table (assignments, status_history, progress_notes, evidence, escalation_events,
-- deadline_extension_requests, feedback, audit_logs, profile_zones, report_counters) has RLS enabled and
-- no client policies: only the backend can read or write them.

-- Public map data: a view exposing approved public columns only (no citizen_id, staff ids or notes).
-- It runs with the owner's privileges by design, so it can read rows that RLS hides from anon.
create view public.public_reports as
select id, public_id, category, description, latitude, longitude, address, landmark, severity, status,
       department_id, zone_id, reported_at, updated_at,
       acknowledgement_deadline, action_deadline, resolution_deadline,
       acknowledged_at, action_started_at, resolved_at, resolution_summary, is_demo
from public.reports;
grant select on public.public_reports to anon, authenticated;

-- Supabase also exposes new tables to these roles by default; keep future tables locked down too.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
