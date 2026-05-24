-- 086: projects.clickup_folder_id — Dedup-Key fuer Reverse-Sync (ClickUp → LC).
-- Wenn der Sync einen Folder aus dem ClickUp-Space "Fulfillment" findet,
-- wird hier seine ClickUp-Folder-ID gespeichert. Bei wiederholten Syncs werden
-- bekannte Folders erkannt und ueberspringen die Anlage.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS clickup_folder_id text;

-- Partial unique: NULL ist OK (alte / manuell angelegte Projekte), aber gesetzte
-- folder-IDs duerfen sich nicht doppeln.
CREATE UNIQUE INDEX IF NOT EXISTS projects_clickup_folder_id_key
  ON public.projects (clickup_folder_id)
  WHERE clickup_folder_id IS NOT NULL;
