-- Profilbild-URL pro User. Das Bild selbst liegt im Supabase-Storage-Bucket
-- `avatars` (public read, authenticated write). Der Bucket + die RLS-Policies
-- werden in Migration 033_avatars_bucket.sql automatisch angelegt.
--
-- Pfad-Konvention: avatars/<user_id>/profile.jpg (upsert, kein Cleanup nötig).

alter table profiles
  add column if not exists avatar_url text;

