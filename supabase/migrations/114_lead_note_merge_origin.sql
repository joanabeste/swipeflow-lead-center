-- 114: Notiz-Herkunft beim Zusammenführen kennzeichnen.
--
-- Löst 101/112/113 ab (vollständige merge_lead-Fassung — NUR diese Migration muss
-- laufen, sie ist self-contained: legt die Spalten an UND ersetzt die Funktion).
--
-- Wunsch: Beim Zusammenführen bleiben ALLE Notizen beider Leads erhalten (das tat
-- merge_lead schon: lead_notes werden umgehängt). Zusätzlich soll in der Historie
-- pro Notiz erkennbar sein, von welchem URSPRUNGS-Lead sie stammt.
--
-- Lösung: zwei Spalten auf lead_notes + beim Merge werden die Notizen des
-- Verlierers vor/beim Umhängen mit Herkunft markiert. COALESCE bewahrt die
-- ursprüngliche Herkunft über mehrstufige Merges (C→B→A bleibt "von C").

ALTER TABLE public.lead_notes
  ADD COLUMN IF NOT EXISTS merged_from_lead_id uuid,
  ADD COLUMN IF NOT EXISTS merged_from_company text;

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

  -- Notizen des Verlierers ZUERST gesondert behandeln: mit Herkunft kennzeichnen
  -- und auf den Survivor umhängen. Bereits markierte Notizen (früherer Merge)
  -- behalten ihre ursprüngliche Herkunftsangabe.
  -- Hinweis: merged_from_company bleibt NULL, falls der Verlierer keinen
  -- Firmennamen hat; merged_from_lead_id ist ein reiner Historien-Marker
  -- (zeigt ggf. auf einen archivierten Lead) — kein FK.
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

  -- Übrige Kind-Daten umhängen: deklarierte FKs auf leads(id) ∪ explizite
  -- Kern-Tabellen (Basis-Schema). lead_notes ist hier AUSGESCHLOSSEN (oben erledigt).
  FOR r IN
    SELECT DISTINCT tbl, col FROM (
      SELECT con.conrelid::regclass::text AS tbl, att.attname::text AS col
      FROM pg_constraint con
      JOIN pg_attribute att
        ON att.attrelid = con.conrelid
       AND att.attnum = ANY (con.conkey)
      WHERE con.contype = 'f'
        AND con.confrelid = 'public.leads'::regclass
        -- lead_notes wird oben gesondert (mit Herkunft) behandelt → hier nie mitnehmen,
        -- auch falls lead_notes künftig einen FK auf leads(id) bekommt.
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

  -- Fehlende Survivor-Stammdaten aus dem Loser füllen.
  UPDATE public.leads s SET
    website       = COALESCE(s.website, l.website),
    phone         = COALESCE(s.phone, l.phone),
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
