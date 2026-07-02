-- 131: Deal-Pipeline auf echte CRM-Status umstellen.
--
-- Vorher zwei getrennte Systeme:
--   • custom_lead_statuses  → CRM-Status der Leads (leads.crm_status_id)
--   • deal_stages           → Kanban-Spalten der Deals (deals.stage_id, kind open/won/lost)
--
-- Ziel: EINE Vertriebs-Pipeline in custom_lead_statuses, die zugleich die
-- Deals-Kanban-Spalten bildet. Dazu bekommt custom_lead_statuses zwei
-- Pipeline-Spalten (is_deal_stage, deal_kind), die 5 Pipeline-Status werden
-- angelegt/umbenannt, bestehende Deals werden per altem kind gemappt und die
-- FK deals.stage_id zeigt danach auf custom_lead_statuses.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, ON CONFLICT DO UPDATE, FK-Neuanlage
-- über dynamisches Drop. Mehrfaches Anwenden ist gefahrlos.
--
-- Betrieb: Migrationen werden hier von Hand eingespielt — VOR dem Deploy in
-- Supabase ausführen, sonst brechen die Deal-Queries (FK/Join).

-- 1) Pipeline-Metadaten auf den CRM-Status.
ALTER TABLE public.custom_lead_statuses
  ADD COLUMN IF NOT EXISTS is_deal_stage boolean NOT NULL DEFAULT false;
ALTER TABLE public.custom_lead_statuses
  ADD COLUMN IF NOT EXISTS deal_kind text
    CHECK (deal_kind IN ('open', 'won', 'lost'));

-- 2) Die 5 Pipeline-Status.
-- 'termin-gelegt' existiert bereits (APPOINTMENT_STATUS_ID → Konfetti). Nur
-- relabeln + als Pipeline markieren, Farbe/übrige Felder unangetastet lassen.
-- color nur als Fallback für den (unwahrscheinlichen) Fresh-Insert — beim
-- Update NICHT überschrieben, damit die bestehende Farbe erhalten bleibt.
INSERT INTO public.custom_lead_statuses (id, label, color, display_order, is_active, is_deal_stage, deal_kind)
VALUES ('termin-gelegt', 'Setting Termin gelegt', '#3b82f6', 300, true, true, 'open')
ON CONFLICT (id) DO UPDATE
  SET label         = EXCLUDED.label,
      is_deal_stage = true,
      deal_kind     = 'open';

INSERT INTO public.custom_lead_statuses
  (id, label, color, description, display_order, is_active, is_deal_stage, deal_kind)
VALUES
  ('closing-termin-gelegt', 'Closing Termin gelegt', '#f59e0b',
   'Closing-Termin steht — Angebot/Abschluss im Fokus.', 310, true, true, 'open'),
  ('verhandlung', 'Verhandlung', '#8b5cf6',
   'In Verhandlung — Konditionen/Vertrag werden abgestimmt.', 320, true, true, 'open'),
  ('gewonnen', 'Gewonnen', '#10b981',
   'Deal gewonnen — Abschluss erfolgt.', 330, true, true, 'won'),
  ('verloren', 'Verloren', '#ef4444',
   'Deal verloren — kein Abschluss.', 340, true, true, 'lost')
ON CONFLICT (id) DO UPDATE
  SET label         = EXCLUDED.label,
      color         = EXCLUDED.color,
      description   = EXCLUDED.description,
      display_order = EXCLUDED.display_order,
      is_active     = true,
      is_deal_stage = true,
      deal_kind     = EXCLUDED.deal_kind;

-- 3) Alte FK deals.stage_id → deal_stages entfernen (Name kann variieren).
-- MUSS vor dem Remapping passieren, sonst verletzt stage_id='gewonnen' die
-- noch aktive FK auf deal_stages. Droppt beim Re-Run auch die neue FK.
DO $$
DECLARE r record;
BEGIN
  IF to_regclass('public.deals') IS NULL THEN
    RETURN;
  END IF;
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_attribute att
      ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
    WHERE con.contype = 'f'
      AND con.conrelid = 'public.deals'::regclass
      AND att.attname = 'stage_id'
  LOOP
    EXECUTE format('ALTER TABLE public.deals DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

-- 4) Bestehende Deals auf die neuen Status mappen (nur solange stage_id noch
-- auf eine deal_stages-Zeile zeigt → beim Re-Run übersprungen).
DO $$
BEGIN
  IF to_regclass('public.deals') IS NOT NULL
     AND to_regclass('public.deal_stages') IS NOT NULL THEN
    UPDATE public.deals d
    SET stage_id = CASE (SELECT s.kind FROM public.deal_stages s WHERE s.id = d.stage_id)
                     WHEN 'won'  THEN 'gewonnen'
                     WHEN 'lost' THEN 'verloren'
                     ELSE 'termin-gelegt'
                   END
    WHERE EXISTS (SELECT 1 FROM public.deal_stages s WHERE s.id = d.stage_id);
  END IF;
END $$;

-- 5) Neue FK deals.stage_id → custom_lead_statuses.
DO $$
BEGIN
  IF to_regclass('public.deals') IS NOT NULL THEN
    ALTER TABLE public.deals
      ADD CONSTRAINT deals_stage_id_fkey
      FOREIGN KEY (stage_id) REFERENCES public.custom_lead_statuses(id)
      ON DELETE RESTRICT;
  END IF;
END $$;

-- Hinweis: Die Tabelle deal_stages bleibt bestehen (unbenutzt) — kein Drop, um
-- Rollback/Datenverlust zu vermeiden.
