-- 120: Reversibler Duplikat-Merge ("Duplikat wieder trennen").
--
-- Setzt Migration 118 (merge_lead 'merged-duplicate') voraus. NUR 118 + 120 anwenden.
--
-- Hintergrund: 118 hängt die Kind-Daten des Verlierers auf den Survivor um, OHNE Herkunft
-- zu speichern, und füllt leere Survivor-Stammdaten per COALESCE — beides nicht umkehrbar.
-- Diese Migration macht künftige Merges trennbar:
--   • merged_from_lead_id auf den 5 Kern-Kind-Tabellen (wie lead_notes/114),
--   • lead_merges protokolliert pro Merge die vom Loser befüllten Survivor-Felder,
--   • unmerge_lead dreht beides zurück + reaktiviert den Verlierer (mit seinen Stammdaten).
-- Bereits VOR 120 zusammengeführte Leads: keine Tags/kein Protokoll → unmerge_lead reaktiviert
-- nur den Verlierer (reverted=false); umgehängte Aktivitäten bleiben am Survivor.

-- 1) Herkunfts-Spalten (idempotent).
ALTER TABLE public.lead_calls        ADD COLUMN IF NOT EXISTS merged_from_lead_id uuid;
ALTER TABLE public.lead_contacts     ADD COLUMN IF NOT EXISTS merged_from_lead_id uuid;
ALTER TABLE public.lead_job_postings ADD COLUMN IF NOT EXISTS merged_from_lead_id uuid;
ALTER TABLE public.lead_enrichments  ADD COLUMN IF NOT EXISTS merged_from_lead_id uuid;
ALTER TABLE public.lead_changes      ADD COLUMN IF NOT EXISTS merged_from_lead_id uuid;

-- 2) Merge-Protokoll. filled_fields = {survivor-Feld: alter Wert} VOR dem COALESCE.
CREATE TABLE IF NOT EXISTS public.lead_merges (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survivor_id   uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  loser_id      uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  merged_at     timestamptz NOT NULL DEFAULT now(),
  merged_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  filled_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  active        boolean NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS lead_merges_survivor_idx ON public.lead_merges(survivor_id);
CREATE INDEX IF NOT EXISTS lead_merges_loser_idx    ON public.lead_merges(loser_id);
-- Höchstens EIN aktiver Eintrag pro Paar (das UPDATE-then-INSERT unten hält das ein).
CREATE UNIQUE INDEX IF NOT EXISTS lead_merges_active_pair_idx
  ON public.lead_merges(survivor_id, loser_id) WHERE active;

ALTER TABLE public.lead_merges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lead_merges_read_all" ON public.lead_merges;
CREATE POLICY "lead_merges_read_all" ON public.lead_merges
  FOR SELECT TO authenticated USING (true);

-- 3) merge_lead neu (Basis 118 + Herkunfts-Tagging + Stammdaten-Protokoll). 2-arg-Signatur bleibt.
CREATE OR REPLACE FUNCTION public.merge_lead(p_survivor uuid, p_loser uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_merged_status text;
  v_ctids tid[];
  v_ctid tid;
  v_filled jsonb := '{}'::jsonb;
BEGIN
  IF p_survivor IS NULL OR p_loser IS NULL OR p_survivor = p_loser THEN
    RETURN;
  END IF;

  -- (114) Notizen des Verlierers ZUERST mit Herkunft kennzeichnen und umhängen.
  IF to_regclass('public.lead_notes') IS NOT NULL THEN
    UPDATE public.lead_notes n
    SET lead_id             = p_survivor,
        merged_from_lead_id = COALESCE(n.merged_from_lead_id, p_loser),
        merged_from_company = COALESCE(
          n.merged_from_company,
          (SELECT l.company_name FROM public.leads l WHERE l.id = p_loser)
        )
    WHERE n.lead_id = p_loser;
  END IF;

  -- (120) Kern-Kind-Tabellen mit Herkunft taggen, BEVOR sie umgehängt werden.
  -- COALESCE bewahrt die Ur-Herkunft über mehrstufige Merges.
  FOR r IN
    SELECT t.tbl FROM (VALUES
      ('public.lead_calls'), ('public.lead_contacts'), ('public.lead_job_postings'),
      ('public.lead_enrichments'), ('public.lead_changes')
    ) AS t(tbl)
    WHERE to_regclass(t.tbl) IS NOT NULL
  LOOP
    EXECUTE format(
      'UPDATE %s SET merged_from_lead_id = COALESCE(merged_from_lead_id, $1) WHERE lead_id = $2',
      r.tbl
    ) USING p_loser, p_loser;
  END LOOP;

  -- (113) Übrige Kind-Daten umhängen: deklarierte FKs ∪ explizite Kern-Tabellen.
  FOR r IN
    SELECT DISTINCT tbl, col FROM (
      SELECT con.conrelid::regclass::text AS tbl, att.attname::text AS col
      FROM pg_constraint con
      JOIN pg_attribute att
        ON att.attrelid = con.conrelid
       AND att.attnum = ANY (con.conkey)
      WHERE con.contype = 'f'
        AND con.confrelid = 'public.leads'::regclass
        AND con.conrelid::regclass <> 'public.lead_notes'::regclass
      UNION
      SELECT ('public.' || c.table_name)::regclass::text, c.column_name::text
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.column_name = 'lead_id'
        AND c.table_name IN (
          'lead_calls', 'lead_contacts',
          'lead_job_postings', 'lead_enrichments', 'lead_changes'
        )
    ) pairs
    WHERE pairs.tbl::regclass <> 'public.lead_notes'::regclass
  LOOP
    BEGIN
      EXECUTE format('UPDATE %s SET %I = $1 WHERE %I = $2', r.tbl, r.col, r.col)
        USING p_survivor, p_loser;
    EXCEPTION WHEN unique_violation THEN
      EXECUTE format('SELECT array_agg(ctid) FROM %s WHERE %I = $1', r.tbl, r.col)
        INTO v_ctids USING p_loser;
      IF v_ctids IS NOT NULL THEN
        FOREACH v_ctid IN ARRAY v_ctids LOOP
          BEGIN
            EXECUTE format('UPDATE %s SET %I = $1 WHERE ctid = $2', r.tbl, r.col)
              USING p_survivor, v_ctid;
          EXCEPTION WHEN unique_violation THEN
            EXECUTE format('DELETE FROM %s WHERE ctid = $1', r.tbl)
              USING v_ctid;
          END;
        END LOOP;
      END IF;
    END;
  END LOOP;

  -- (120) Befüllte Survivor-Stammdaten erfassen (Feld NULL auf Survivor & nicht-NULL auf Loser)
  -- VOR dem COALESCE — alter Survivor-Wert (hier stets JSON null) für das spätere Zurückdrehen.
  SELECT COALESCE(jsonb_object_agg(f.k, to_jsonb(s) -> f.k), '{}'::jsonb)
    INTO v_filled
  FROM public.leads s, public.leads l,
       (VALUES ('website'),('phone'),('phone_source'),('email'),('street'),('city'),
               ('zip'),('state'),('country'),('industry'),('company_size'),
               ('legal_form'),('register_id'),('description')) AS f(k)
  WHERE s.id = p_survivor AND l.id = p_loser
    AND (to_jsonb(s) ->> f.k) IS NULL
    AND (to_jsonb(l) ->> f.k) IS NOT NULL;

  -- (116) Fehlende Survivor-Stammdaten aus dem Loser füllen; phone_source synchron.
  UPDATE public.leads s SET
    website       = COALESCE(s.website, l.website),
    phone         = COALESCE(s.phone, l.phone),
    phone_source  = CASE WHEN s.phone IS NOT NULL THEN s.phone_source ELSE l.phone_source END,
    email         = COALESCE(s.email, l.email),
    street        = COALESCE(s.street, l.street),
    city          = COALESCE(s.city, l.city),
    zip           = COALESCE(s.zip, l.zip),
    state         = COALESCE(s.state, l.state),
    country       = COALESCE(s.country, l.country),
    industry      = COALESCE(s.industry, l.industry),
    company_size  = COALESCE(s.company_size, l.company_size),
    legal_form    = COALESCE(s.legal_form, l.legal_form),
    register_id   = COALESCE(s.register_id, l.register_id),
    description   = COALESCE(s.description, l.description),
    updated_at    = now()
  FROM public.leads l
  WHERE s.id = p_survivor AND l.id = p_loser;

  -- Verlierer als "zusammengeführt" markieren (lern-neutral, kein cancel_reason).
  SELECT id INTO v_merged_status
  FROM public.custom_lead_statuses
  WHERE id = 'merged-duplicate'
  LIMIT 1;

  UPDATE public.leads
  SET crm_status_id   = COALESCE(v_merged_status, crm_status_id),
      lifecycle_stage = 'archived',
      updated_at      = now()
  WHERE id = p_loser;

  -- (120) Merge protokollieren. UPDATE-then-INSERT hält "höchstens 1 aktiv pro Paar" ein,
  -- ohne ON-CONFLICT-Partial-Index-Inferenz (robuster über PG-Versionen).
  UPDATE public.lead_merges
  SET active = false
  WHERE survivor_id = p_survivor AND loser_id = p_loser AND active;

  INSERT INTO public.lead_merges (survivor_id, loser_id, merged_by, filled_fields, active)
  VALUES (p_survivor, p_loser, NULL, v_filled, true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.merge_lead(uuid, uuid) TO authenticated, service_role;

-- 4) unmerge_lead: Merge rückgängig machen.
CREATE OR REPLACE FUNCTION public.unmerge_lead(p_survivor uuid, p_loser uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_rec public.lead_merges%ROWTYPE;
  v_moved int := 0;
  v_n int := 0;
  v_fields int := 0;
  v_target_status text;
  v_vertical text;
  k text;
  v_old jsonb;
BEGIN
  IF p_survivor IS NULL OR p_loser IS NULL OR p_survivor = p_loser THEN
    RETURN jsonb_build_object('reverted', false, 'moved_rows', 0, 'fields_reverted', 0);
  END IF;

  SELECT * INTO v_rec FROM public.lead_merges
  WHERE survivor_id = p_survivor AND loser_id = p_loser AND active
  ORDER BY merged_at DESC LIMIT 1;

  -- 4a) Getaggte Kern-Daten zurückhängen (nur die aus DIESEM Loser).
  FOR r IN
    SELECT t.tbl FROM (VALUES
      ('public.lead_calls'), ('public.lead_contacts'), ('public.lead_job_postings'),
      ('public.lead_enrichments'), ('public.lead_changes')
    ) AS t(tbl)
    WHERE to_regclass(t.tbl) IS NOT NULL
  LOOP
    EXECUTE format(
      'UPDATE %s SET lead_id = $1, merged_from_lead_id = NULL WHERE lead_id = $2 AND merged_from_lead_id = $3',
      r.tbl
    ) USING p_loser, p_survivor, p_loser;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_moved := v_moved + v_n;
  END LOOP;

  -- Notizen zurück, AUSSER Survivor-System-Notizen (🔀 Merge / ↩️ Un-Merge).
  IF to_regclass('public.lead_notes') IS NOT NULL THEN
    UPDATE public.lead_notes
    SET lead_id = p_loser, merged_from_lead_id = NULL, merged_from_company = NULL
    WHERE lead_id = p_survivor AND merged_from_lead_id = p_loser
      AND content NOT LIKE '🔀%' AND content NOT LIKE '↩️%';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_moved := v_moved + v_n;
  END IF;

  -- 4b) Survivor-Stammdaten zurückdrehen (nur die beim Merge befüllten Felder).
  IF v_rec.id IS NOT NULL AND v_rec.filled_fields <> '{}'::jsonb THEN
    FOR k, v_old IN SELECT key, value FROM jsonb_each(v_rec.filled_fields) LOOP
      EXECUTE format('UPDATE public.leads SET %I = $1, updated_at = now() WHERE id = $2', k)
        USING (CASE WHEN v_old = 'null'::jsonb THEN NULL ELSE v_old #>> '{}' END), p_survivor;
      v_fields := v_fields + 1;
    END LOOP;
  END IF;

  -- 4c) Verlierer ent-archivieren (Ziel-Status wie restoreArchivedLead).
  SELECT vertical::text INTO v_vertical FROM public.leads WHERE id = p_loser;
  v_target_status := NULL;
  IF v_vertical = 'webdesign'
     AND EXISTS (SELECT 1 FROM public.custom_lead_statuses WHERE id = 'webdesign-manuelle-ueberpruefung') THEN
    v_target_status := 'webdesign-manuelle-ueberpruefung';
  ELSIF EXISTS (SELECT 1 FROM public.custom_lead_statuses WHERE id = 'recruiting-manuelle-ueberpruefung') THEN
    v_target_status := 'recruiting-manuelle-ueberpruefung';
  END IF;

  UPDATE public.leads
  SET crm_status_id = v_target_status, lifecycle_stage = 'lead', updated_at = now()
  WHERE id = p_loser;

  -- 4d) Merge-Protokoll schließen.
  IF v_rec.id IS NOT NULL THEN
    UPDATE public.lead_merges SET active = false WHERE id = v_rec.id;
  END IF;

  RETURN jsonb_build_object(
    'reverted', (v_rec.id IS NOT NULL),
    'moved_rows', v_moved,
    'fields_reverted', v_fields
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.unmerge_lead(uuid, uuid) TO authenticated, service_role;
