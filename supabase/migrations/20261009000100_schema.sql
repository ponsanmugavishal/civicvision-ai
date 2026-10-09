-- CIVICVISION AI — core schema
-- Applies to Supabase Postgres (15+). Keep in sync with backend/app/models.py.

-- gen_random_uuid() is built into Postgres 13+; no extension needed.

-- ---------------------------------------------------------------- helpers
create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create or replace function public.forbid_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception '% is append-only; % is not allowed', tg_table_name, tg_op using errcode = 'insufficient_privilege';
end $$;

-- ---------------------------------------------------------------- reference data
create table public.departments (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  short_name text not null,
  description text not null default '',
  categories jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.zones (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null default '',
  center_lat double precision not null check (center_lat between -90 and 90),
  center_lng double precision not null check (center_lng between -180 and 180),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- people
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 120),
  email text,
  phone text,
  title text,
  role text not null default 'citizen' check (role in ('citizen', 'staff', 'supervisor', 'administrator')),
  department_id uuid references public.departments (id) on delete set null,
  all_zones boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_needs_department check (role <> 'staff' or department_id is not null)
);
create index profiles_role_idx on public.profiles (role);

create table public.profile_zones (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  zone_id uuid not null references public.zones (id) on delete cascade,
  primary key (profile_id, zone_id)
);

-- Every new auth user gets a CITIZEN profile. Elevated roles are only ever set by an administrator
-- (backend /api/admin or scripts/provision_user.py). Metadata supplied at sign-up cannot choose a role.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, email, role)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(coalesce(new.email, 'Citizen'), '@', 1)), 120),
    new.email,
    'citizen'
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- reports
create table public.report_counters (
  year integer primary key,
  last_value integer not null default 0
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique,
  citizen_id uuid not null references public.profiles (id) on delete restrict,
  category text not null check (category in ('garbage', 'drainage', 'pothole', 'other')),
  description text not null check (char_length(description) between 20 and 1000),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  address text not null default '' check (char_length(address) <= 200),
  landmark text not null default '' check (char_length(landmark) <= 120),
  image_path text,
  ai_suggested_category text check (ai_suggested_category in ('garbage', 'drainage', 'pothole', 'other')),
  ai_explanation text,
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high', 'critical')),
  status text not null default 'open' check (status in ('open', 'assigned', 'in_progress', 'resolved', 'rejected', 'reopened')),
  department_id uuid references public.departments (id),
  zone_id uuid references public.zones (id),
  assigned_staff_id uuid references public.profiles (id),
  reported_at timestamptz not null default now(),
  acknowledgement_deadline timestamptz not null,
  action_deadline timestamptz not null,
  resolution_deadline timestamptz not null,
  original_acknowledgement_deadline timestamptz not null,
  original_action_deadline timestamptz not null,
  original_resolution_deadline timestamptz not null,
  acknowledged_at timestamptz,
  action_started_at timestamptz,
  resolved_at timestamptz,
  resolution_summary text,
  rejection_reason text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint resolved_needs_summary check (status <> 'resolved' or (resolved_at is not null and resolution_summary is not null)),
  constraint rejected_needs_reason check (status <> 'rejected' or rejection_reason is not null)
);
create index reports_status_idx on public.reports (status);
create index reports_category_idx on public.reports (category);
create index reports_department_idx on public.reports (department_id);
create index reports_zone_idx on public.reports (zone_id);
create index reports_assigned_staff_idx on public.reports (assigned_staff_id);
create index reports_citizen_idx on public.reports (citizen_id);
create index reports_reported_at_idx on public.reports (reported_at desc);
create index reports_lat_lng_idx on public.reports (latitude, longitude);

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports (id) on delete restrict,
  department_id uuid not null references public.departments (id),
  assigned_staff_id uuid references public.profiles (id),
  assigned_by uuid not null references public.profiles (id),
  reason text not null,
  assigned_at timestamptz not null default now(),
  unassigned_at timestamptz
);
create index assignments_report_idx on public.assignments (report_id);
create index assignments_staff_idx on public.assignments (assigned_staff_id);

create table public.status_history (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports (id) on delete restrict,
  previous_status text check (previous_status in ('open', 'assigned', 'in_progress', 'resolved', 'rejected', 'reopened')),
  new_status text not null check (new_status in ('open', 'assigned', 'in_progress', 'resolved', 'rejected', 'reopened')),
  changed_by uuid references public.profiles (id),
  changed_by_role text not null,
  comment text not null default '',
  created_at timestamptz not null default now()
);
create index status_history_report_idx on public.status_history (report_id, created_at);

create table public.progress_notes (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports (id) on delete restrict,
  author_id uuid not null references public.profiles (id),
  author_role text not null,
  body text not null check (char_length(body) between 1 and 2000),
  internal boolean not null default false,
  created_at timestamptz not null default now()
);
create index progress_notes_report_idx on public.progress_notes (report_id);

create table public.evidence (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports (id) on delete restrict,
  uploaded_by uuid not null references public.profiles (id),
  uploaded_by_role text not null,
  storage_path text not null,
  evidence_type text not null check (evidence_type in ('original', 'progress', 'resolution', 'other')),
  caption text not null default '' check (char_length(caption) <= 200),
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes integer not null check (size_bytes > 0),
  created_at timestamptz not null default now()
);
create index evidence_report_idx on public.evidence (report_id);

-- ---------------------------------------------------------------- deadlines & escalation
create table public.sla_policies (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('garbage', 'drainage', 'pothole', 'other')),
  severity text not null check (severity in ('low', 'medium', 'high', 'critical')),
  acknowledgement_hours double precision not null,
  action_hours double precision not null,
  resolution_hours double precision not null,
  enabled boolean not null default true,
  department_id uuid references public.departments (id),
  zone_id uuid references public.zones (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sla_hours_check check (acknowledgement_hours > 0 and action_hours >= acknowledgement_hours and resolution_hours >= action_hours),
  constraint sla_policy_scope_unique unique nulls not distinct (category, severity, department_id, zone_id)
);
comment on table public.sla_policies is 'Configurable response targets. Seeded values are illustrative examples, not official standards.';

create table public.escalation_events (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports (id) on delete restrict,
  level integer not null check (level between 1 and 3),
  reason text not null,
  deadline_kind text not null check (deadline_kind in ('acknowledgement', 'action', 'resolution')),
  deadline_at timestamptz not null,
  triggered_at timestamptz not null default now(),
  notified_role text not null default 'supervisor',
  action_taken text,
  status text not null default 'open' check (status in ('open', 'under_review', 'actioned', 'closed')),
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  -- Idempotency: the scheduled check can run any number of times without duplicating events.
  constraint escalation_events_once unique (report_id, deadline_kind, deadline_at)
);
create index escalation_events_status_idx on public.escalation_events (status);

create table public.deadline_extension_requests (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports (id) on delete restrict,
  deadline_kind text not null check (deadline_kind in ('acknowledgement', 'action', 'resolution')),
  current_deadline timestamptz not null,
  requested_deadline timestamptz not null check (requested_deadline > current_deadline),
  requested_by uuid not null references public.profiles (id),
  reason text not null check (char_length(reason) >= 10),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.profiles (id),
  review_reason text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  constraint reviewed_needs_reason check (status = 'pending' or (review_reason is not null and reviewed_by is not null))
);
create index extension_report_idx on public.deadline_extension_requests (report_id);
create unique index extension_one_pending on public.deadline_extension_requests (report_id) where status = 'pending';

-- ---------------------------------------------------------------- feedback, audit, notifications
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports (id) on delete restrict,
  citizen_id uuid not null references public.profiles (id),
  rating integer not null check (rating between 1 and 5),
  comment text not null default '' check (char_length(comment) <= 600),
  reopen_requested boolean not null default false,
  reopen_decision text check (reopen_decision in ('pending', 'approved', 'declined')),
  decision_reason text,
  decided_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index feedback_report_idx on public.feedback (report_id);
create unique index feedback_one_pending_dispute on public.feedback (report_id) where reopen_decision = 'pending';

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id),  -- null = automated system job
  actor_role text not null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  report_id uuid references public.reports (id),
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_report_idx on public.audit_logs (report_id);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  body text not null default '',
  link text,
  read boolean not null default false,
  channel text not null default 'in_app' check (channel = 'in_app'),
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- ---------------------------------------------------------------- triggers
create trigger departments_updated before update on public.departments for each row execute function public.set_updated_at();
create trigger zones_updated before update on public.zones for each row execute function public.set_updated_at();
create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
create trigger reports_updated before update on public.reports for each row execute function public.set_updated_at();
create trigger sla_policies_updated before update on public.sla_policies for each row execute function public.set_updated_at();

-- History tables are append-only for every role, including the backend's database user.
create trigger audit_logs_append_only before update or delete on public.audit_logs for each row execute function public.forbid_mutation();
create trigger status_history_append_only before update or delete on public.status_history for each row execute function public.forbid_mutation();
create trigger escalation_events_no_delete before delete on public.escalation_events for each row execute function public.forbid_mutation();
