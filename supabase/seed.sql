-- CIVICVISION AI — reference data: generic departments/zones (rename for your city) and ILLUSTRATIVE SLA hours.
-- Same rows and UUIDs as backend/app/seed.py. Safe to re-run.

insert into public.departments (id, slug, name, short_name, description, categories) values
  ('00000000-0000-4000-8000-0000000000d1', 'solid-waste', 'Solid Waste Management', 'Solid Waste', 'Collection, clearance of dumping spots and bin maintenance.', '["garbage"]'::jsonb),
  ('00000000-0000-4000-8000-0000000000d2', 'stormwater-drains', 'Stormwater Drains & Sewerage', 'Drains', 'Drain desilting, overflow response and waterlogging relief.', '["drainage"]'::jsonb),
  ('00000000-0000-4000-8000-0000000000d3', 'roads', 'Roads & Street Maintenance', 'Roads', 'Pothole patching, resurfacing and road-edge repairs.', '["pothole"]'::jsonb),
  ('00000000-0000-4000-8000-0000000000d4', 'ward-services', 'Ward Civic Services', 'Ward Services', 'General civic issues that need triage before routing.', '["other"]'::jsonb)
on conflict (id) do nothing;

insert into public.zones (id, slug, name, description, center_lat, center_lng) values
  ('00000000-0000-4000-8000-0000000000e1', 'north', 'North Zone', 'Northern wards', 13.076, 80.244),
  ('00000000-0000-4000-8000-0000000000e2', 'central', 'Central Zone', 'Central wards', 13.052000000000001, 80.246),
  ('00000000-0000-4000-8000-0000000000e3', 'south', 'South Zone', 'Southern wards', 13.024000000000001, 80.24199999999999),
  ('00000000-0000-4000-8000-0000000000e4', 'west', 'West Zone', 'Western wards', 13.051, 80.21)
on conflict (id) do nothing;

insert into public.sla_policies (id, category, severity, acknowledgement_hours, action_hours, resolution_hours) values
  ('00000000-0000-4000-8000-000000000501', 'garbage', 'critical', 4, 12, 48),
  ('00000000-0000-4000-8000-000000000502', 'garbage', 'high', 12, 24, 96),
  ('00000000-0000-4000-8000-000000000503', 'garbage', 'medium', 24, 72, 168),
  ('00000000-0000-4000-8000-000000000504', 'garbage', 'low', 48, 120, 336),
  ('00000000-0000-4000-8000-000000000505', 'drainage', 'critical', 4, 12, 36),
  ('00000000-0000-4000-8000-000000000506', 'drainage', 'high', 12, 24, 72),
  ('00000000-0000-4000-8000-000000000507', 'drainage', 'medium', 24, 72, 126),
  ('00000000-0000-4000-8000-000000000508', 'drainage', 'low', 48, 120, 252),
  ('00000000-0000-4000-8000-000000000509', 'pothole', 'critical', 4, 12, 72),
  ('00000000-0000-4000-8000-00000000050a', 'pothole', 'high', 12, 24, 144),
  ('00000000-0000-4000-8000-00000000050b', 'pothole', 'medium', 24, 72, 252),
  ('00000000-0000-4000-8000-00000000050c', 'pothole', 'low', 48, 120, 504),
  ('00000000-0000-4000-8000-00000000050d', 'other', 'critical', 4, 12, 60),
  ('00000000-0000-4000-8000-00000000050e', 'other', 'high', 12, 24, 120),
  ('00000000-0000-4000-8000-00000000050f', 'other', 'medium', 24, 72, 210),
  ('00000000-0000-4000-8000-000000000510', 'other', 'low', 48, 120, 420)
on conflict (id) do nothing;
