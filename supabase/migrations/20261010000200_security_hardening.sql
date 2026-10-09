-- CIVICVISION AI — security hardening (from the Supabase security advisor).
-- Public map data is served only through the backend API (field-filtered), so the owner-privileged view is removed.
drop view if exists public.public_reports;
-- Trigger-only functions: never callable through the Data API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.forbid_mutation() from public, anon, authenticated;
