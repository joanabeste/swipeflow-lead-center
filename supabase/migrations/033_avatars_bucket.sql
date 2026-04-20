-- Storage-Bucket `avatars` für Profilbilder.
--
-- Der Upload-Code (lib/supabase/avatar.ts) legt Dateien unter dem Pfad
-- `<user_id>/profile.jpg` ab, mit upsert=true. Der Bucket ist public-read,
-- damit die URL direkt in <img>-Tags verwendet werden kann.

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Public Read: jeder darf Profilbilder abrufen.
drop policy if exists "avatars read anyone" on storage.objects;
create policy "avatars read anyone" on storage.objects
  for select using (bucket_id = 'avatars');

-- Upload nur im eigenen User-Ordner.
drop policy if exists "avatars upload own" on storage.objects;
create policy "avatars upload own" on storage.objects
  for insert with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Update nur am eigenen Profilbild (für upsert=true).
drop policy if exists "avatars update own" on storage.objects;
create policy "avatars update own" on storage.objects
  for update using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  ) with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Löschen nur am eigenen Profilbild.
drop policy if exists "avatars delete own" on storage.objects;
create policy "avatars delete own" on storage.objects
  for delete using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
