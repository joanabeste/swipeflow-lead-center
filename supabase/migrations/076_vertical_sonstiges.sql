-- 076: 'sonstiges' als zulaessigen Wert fuer leads.vertical und projects.vertical erlauben.
-- Im UI heisst das Feld "Bereich" (statt "Vertikale"), Werte: webdesign | recruiting | sonstiges.

DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname FROM pg_constraint
  WHERE conrelid = 'public.leads'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%vertical%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.leads DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE public.leads
  ADD CONSTRAINT leads_vertical_check
  CHECK (vertical IS NULL OR vertical IN ('webdesign', 'recruiting', 'sonstiges'));

DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname FROM pg_constraint
  WHERE conrelid = 'public.projects'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%vertical%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.projects DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE public.projects
  ADD CONSTRAINT projects_vertical_check
  CHECK (vertical IS NULL OR vertical IN ('webdesign', 'recruiting', 'sonstiges'));
