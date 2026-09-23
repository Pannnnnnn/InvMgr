-- Storage bucket for worker checkout photos --------------------------------
-- Private bucket: objects are never publicly readable. The API issues
-- short-lived signed URLs (see src/lib/storage.ts) for display in the UI.
insert into storage.buckets (id, name, public)
values ('worker-photos', 'worker-photos', false)
on conflict (id) do nothing;

-- Authenticated operators can upload photos.
drop policy if exists "worker_photos_insert_authenticated" on storage.objects;
create policy "worker_photos_insert_authenticated"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'worker-photos');

-- Authenticated operators can read photo metadata (needed for signed URL
-- generation client-side, if ever done outside the service-role API).
drop policy if exists "worker_photos_select_authenticated" on storage.objects;
create policy "worker_photos_select_authenticated"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'worker-photos');

-- No public policy is created: anonymous/public role has zero access, so
-- direct object URLs 404 unless requested through a signed URL.
