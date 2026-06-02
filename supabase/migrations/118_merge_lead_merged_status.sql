-- 118: Zusammengeführte Duplikate korrekt kennzeichnen (statt "Passt nicht").
--
-- FINALE merge_lead-Fassung — löst 112/113/114/116/117 ab. NUR diese anwenden
-- (plus Migration 115 für leads.phone_source).
--
-- Problem (vorher): merge_lead archivierte den Verlierer per
--   SELECT id ... WHERE is_archived=true ORDER BY display_order LIMIT 1
-- → immer 'recruiting-passt-nicht' (display_order 90 < 91). Folgen:
--   • falsche Vertikale (Webdesign-Lead landete in "Recruiting – Passt nicht")
--   • "Passt nicht" hat learning_signal='negative' → die KI lernte ein Duplikat
--     fälschlich als schlechten Lead (Datenvergiftung)
--   • cancel_reason='merged into …' erschien im UI als "Blacklist-Treffer".
--
-- Fix: dedizierter Archiv-Status 'merged-duplicate' (lern-NEUTRAL, vertikal-
-- unabhängig). Verlierer wird dorthin gesetzt, kein cancel_reason mehr. Lead bleibt
-- ausgeblendet (is_archived) + wiederherstellbar; KEIN KI-Negativ-Signal.

-- Herkunftsspalten für Notiz-Markierung (idempotent, aus 114).
ALTER TABLE public.lead_notes
  ADD COLUMN IF NOT EXISTS merged_from_lead_id uuid,
  ADD COLUMN IF NOT EXISTS merged_from_company text;

-- Dedizierter "Zusammengeführt"-Status: archiviert, aber lern-neutral (learning_signal NULL,
-- daher von scoring-reviewer.ts ignoriert) und ohne Vertikale.
INSERT INTO custom_lead_statuses
  (id, label, color, description, display_order, is_active, is_archived, learning_signal, vertical)
VALUES
  ('merged-duplicate',
   'Zusammengeführt (Duplikat)',
   '#6b7280',
   'Wurde als Duplikat in einen anderen Lead zusammengeführt — aus Neue Leads/CRM ausgeblendet, jederzeit wiederherstellbar. KEIN KI-Signal.',
   95, true, true, NULL, NULL)
ON CONFLICT (id) DO UPDATE
  SET label           = EXCLUDED.label,
      color           = EXCLUDED.color,
      description     = EXCLUDED.description,
      is_archived     = EXCLUDED.is_archived,
      learning_signal = NULL;

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
BEGIN
  IF p_survivor IS NULL OR p_loser IS NULL OR p_survivor = p_loser THEN
    RETURN;
  END IF;

  -- (114) Notizen des Verlierers ZUERST mit Herkunft kennzeichnen und umhängen.
  -- COALESCE bewahrt die ursprüngliche Herkunft über mehrstufige Merges.
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

  -- (113) Übrige Kind-Daten umhängen: deklarierte FKs ∪ explizite Kern-Tabellen.
  -- lead_notes ist AUSGESCHLOSSEN (oben erledigt).
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

  -- (116) Fehlende Survivor-Stammdaten aus dem Loser füllen; phone_source synchron
  -- zur resultierenden Nummer mitführen.
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

  -- Verlierer als "zusammengeführt" markieren: dedizierter, lern-neutraler
  -- Archiv-Status statt "Passt nicht". KEIN cancel_reason (sonst irreführendes
  -- "Blacklist-Treffer"-Banner). Fallback: nur lifecycle, falls Status fehlt.
  SELECT id INTO v_merged_status
  FROM public.custom_lead_statuses
  WHERE id = 'merged-duplicate'
  LIMIT 1;

  UPDATE public.leads
  SET crm_status_id   = COALESCE(v_merged_status, crm_status_id),
      lifecycle_stage = 'archived',
      updated_at      = now()
  WHERE id = p_loser;
END;
$$;

GRANT EXECUTE ON FUNCTION public.merge_lead(uuid, uuid) TO authenticated, service_role;
