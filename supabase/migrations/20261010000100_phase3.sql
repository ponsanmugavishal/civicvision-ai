-- CIVICVISION AI — Phase 3: AI suggestions, duplicate flags, database-side SLA check, realtime.

-- ---------------------------------------------------------------- AI suggestions
-- Output of the pretrained Gemini model, kept separate from the category the citizen confirms.
create table public.ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  model text not null,
  suggested_category text not null check (suggested_category in ('garbage', 'drainage', 'pothole', 'other')),
  explanation text not null check (char_length(explanation) <= 600),
  visible_indicators jsonb not null default '[]'::jsonb,
  uncertainty_warning text,
  suggested_severity text check (suggested_severity in ('low', 'medium', 'high', 'critical')),
  image_sha256 text not null,
  created_at timestamptz not null default now()
);
create index ai_suggestions_user_idx on public.ai_suggestions (user_id, created_at desc);
alter table public.ai_suggestions enable row level security;  -- backend only; no client policies

alter table public.reports
  add column ai_suggested_severity text check (ai_suggested_severity in ('low', 'medium', 'high', 'critical')),
  add column ai_suggestion_id uuid references public.ai_suggestions (id),
  add column possible_duplicate_ids jsonb not null default '[]'::jsonb;

-- ---------------------------------------------------------------- SLA check inside the database
-- Same rules as backend/app/services/sla.py. Runs on a schedule (pg_cron, below) so deadlines are monitored even
-- when the backend is asleep. Idempotent: escalation_events_once + ON CONFLICT DO NOTHING.
create or replace function public.run_sla_check() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  k text;
  due timestamptz;
  done timestamptz;
  lvl integer;
  new_id uuid;
  created integer := 0;
  label text;
begin
  for r in
    select * from public.reports where status in ('open', 'assigned', 'in_progress', 'reopened')
  loop
    foreach k in array array['acknowledgement', 'action', 'resolution'] loop
      due := case k when 'acknowledgement' then r.acknowledgement_deadline when 'action' then r.action_deadline else r.resolution_deadline end;
      done := case k when 'acknowledgement' then r.acknowledged_at when 'action' then coalesce(r.action_started_at, r.resolved_at) else r.resolved_at end;
      continue when due > now() or done is not null;
      lvl := least(3, (case k when 'acknowledgement' then 1 when 'action' then 2 else 3 end) + (case when r.severity = 'critical' then 1 else 0 end));
      label := case k when 'acknowledgement' then 'Acknowledgement' when 'action' then 'Initial action' else 'Resolution' end;
      new_id := null;
      insert into public.escalation_events (report_id, level, reason, deadline_kind, deadline_at, triggered_at, notified_role, status)
      values (r.id, lvl, format('%s target missed for a %s %s complaint.', label, r.severity, r.category), k, due, now(), 'supervisor', 'open')
      on conflict on constraint escalation_events_once do nothing
      returning id into new_id;
      continue when new_id is null;
      created := created + 1;
      insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, report_id, summary, metadata)
      values (null, 'administrator', 'escalation.created', 'escalation', new_id::text, r.id,
              format('%s: level %s escalation — %s deadline missed', r.public_id, lvl, k), jsonb_build_object('deadline_at', due, 'source', 'pg_cron'));
      insert into public.notifications (user_id, title, body, link)
      select p.id, format('Escalation: %s', r.public_id), format('%s target missed for a %s %s complaint.', label, r.severity, r.category), format('/supervisor/reports/%s', r.id)
      from public.profiles p where p.role in ('supervisor', 'administrator');
    end loop;
  end loop;
  return created;
end $$;
revoke all on function public.run_sla_check() from public, anon, authenticated;

-- Schedule every 5 minutes with pg_cron (available on Supabase, including the free plan).
-- Verify afterwards with: select jobname, schedule, active from cron.job;
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('civicvision-sla-check', '*/5 * * * *', 'select public.run_sla_check()');
exception when others then
  raise notice 'pg_cron not available here (%); schedule run_sla_check() another way — see docs/DEPLOYMENT.md', sqlerrm;
end $$;

-- ---------------------------------------------------------------- realtime
-- Users receive their own new notifications instantly (RLS limits each user to their own rows).
do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception when others then
  raise notice 'supabase_realtime publication not available here (%)', sqlerrm;
end $$;
