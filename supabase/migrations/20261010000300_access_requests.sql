-- CIVICVISION AI — requests for Department Authority / Higher Official access, approved by administrators.
create table public.access_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  requested_role text not null check (requested_role in ('staff', 'supervisor')),
  department_id uuid references public.departments (id),
  note text not null default '' check (char_length(note) <= 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by uuid references public.profiles (id),
  decision_reason text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  constraint decided_needs_decider check (status = 'pending' or decided_by is not null)
);
create index access_requests_status_idx on public.access_requests (status, created_at desc);
create unique index access_requests_one_pending on public.access_requests (user_id) where status = 'pending';
alter table public.access_requests enable row level security;  -- backend only; no client policies
