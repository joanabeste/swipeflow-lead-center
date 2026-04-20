-- Profilbild-URL pro User. Das Bild selbst liegt im Supabase-Storage-Bucket
-- `avatars` (public read, authenticated write). Der Bucket muss einmalig
-- manuell im Supabase-Dashboard angelegt werden:
--
--   Storage → New bucket → Name: avatars → Public: true
--   Policies (unter Storage → Policies):
--     - SELECT: allow anyone
--     - INSERT: allow authenticated (auth.role() = 'authenticated')
--     - UPDATE: allow owner (owner = auth.uid())
--     - DELETE: allow owner (owner = auth.uid())
--
-- Pfad-Konvention: avatars/<user_id>/<timestamp>.jpg

alter table profiles
  add column if not exists avatar_url text;

