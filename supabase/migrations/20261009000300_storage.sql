-- CIVICVISION AI — private storage bucket for report photos and resolution evidence.
-- No storage.objects policies are created for anon/authenticated, so clients cannot list, read or upload
-- directly. The backend uploads with the service-role key after validating type/size and serves files
-- through short-lived signed URLs.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-media', 'report-media', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
