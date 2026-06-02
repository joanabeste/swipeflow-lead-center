-- 116: merge_lead — Telefon-Provenienz (phone_source) beim Zusammenführen mitnehmen.
--
-- Löst 113 ab (identisch, plus EINE Zeile im Stammdaten-COALESCE-Block). NUR diese
-- Migration muss ausgeführt werden. Setzt Migration 115 (Spalte leads.phone_source) voraus.
--
-- Problem: 113 füllt fehlende Survivor-Stammdaten aus dem Loser per COALESCE
-- (phone = COALESCE(s.phone, l.phone)), überträgt aber NICHT phone_source. Erbt der
-- Survivor die Loser-Nummer (weil seine eigene NULL war), bleibt sein phone_source
-- NULL — eine von Hand gepflegte (phone_source='manual') Nummer verliert dadurch
-- ihren Schutz vor der Anreicherungs-Auto-Korrektur (Guard in lib/enrichment/enrich-lead.ts).
--
-- Fix: phone_source synchron zur Nummer mitführen. Im selben UPDATE beziehen sich
-- s.* auf die Werte VOR dem Update, daher ist die Zuordnung konsistent:
--   bleibt die Survivor-Nummer (s.phone NOT NULL) → s.phone_source behalten,
--   sonst (Survivor erbt l.phone)                 → l.phone_source übernehmen.
-- Sonst unverändert ggü. 113 (Kind-Daten-Umhängen, datenverlustsichere ctid-Logik,
-- v_archived_status als text).

CREATE OR REPLACE FUNCTION public.merge_lead(p_survivor uuid, p_loser uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_archived_status text;
  v_ctids tid[];
  v_ctid tid;
BEGIN
  IF p_survivor IS NULL OR p_loser IS NULL OR p_survivor = p_loser THEN
    RETURN;
  END IF;

  -- Umzuhängende (Tabelle, Spalte): deklarierte FKs ∪ explizite Kern-Tabellen.
  FOR r IN
    SELECT DISTINCT tbl, col FROM (
      -- (a) Alle Spalten, die per Foreign Key auf leads(id) zeigen.
      SELECT con.conrelid::regclass::text AS tbl, att.attname::text AS col
      FROM pg_constraint con
      JOIN pg_attribute att
        ON att.attrelid = con.conrelid
       AND att.attnum = ANY (con.conkey)
      WHERE con.contype = 'f'
        AND con.confrelid = 'public.leads'::regclass
      UNION
      -- (b) Kern-Kind-Tabellen aus dem Basis-Schema, auch ohne deklarierten FK.
      --     Nur aufnehmen, wenn Tabelle UND Spalte 'lead_id' existieren.
      SELECT ('public.' || c.table_name)::regclass::text, c.column_name::text
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.column_name = 'lead_id'
        AND c.table_name IN (
          'lead_notes', 'lead_calls', 'lead_contacts',
          'lead_job_postings', 'lead_enrichments', 'lead_changes'
        )
    ) pairs
  LOOP
    BEGIN
      -- Fast-Path: alle Kind-Zeilen des Losers auf den Survivor umhängen.
      EXECUTE format('UPDATE %s SET %I = $1 WHERE %I = $2', r.tbl, r.col, r.col)
        USING p_survivor, p_loser;
    EXCEPTION WHEN unique_violation THEN
      -- Konflikt: der Survivor hat für mind. eine Zeile bereits den kanonischen
      -- Datensatz. Pro Zeile (ctid) einzeln umhängen; nur die kollidierende
      -- Zeile verwerfen, die übrigen erhalten.
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

  -- Fehlende Survivor-Stammdaten aus dem Loser füllen.
  UPDATE public.leads s SET
    website       = COALESCE(s.website, l.website),
    phone         = COALESCE(s.phone, l.phone),
    -- phone_source synchron zur resultierenden Nummer mitführen (s. Kopf der Migration).
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

  -- Loser archivieren: auf einen archivierten CRM-Status setzen + lifecycle_stage.
  SELECT id INTO v_archived_status
  FROM public.custom_lead_statuses
  WHERE is_archived = true
  ORDER BY display_order
  LIMIT 1;

  UPDATE public.leads
  SET crm_status_id   = COALESCE(v_archived_status, crm_status_id),
      lifecycle_stage = 'archived',
      cancel_reason   = 'merged into ' || p_survivor::text,
      updated_at      = now()
  WHERE id = p_loser;
END;
$$;

GRANT EXECUTE ON FUNCTION public.merge_lead(uuid, uuid) TO authenticated, service_role;
