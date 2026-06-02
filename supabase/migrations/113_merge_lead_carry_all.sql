-- 113: merge_lead — Notizen & ALLE Kind-Daten garantiert übernehmen.
--
-- Löst 101 + 112 ab (enthält den v_archived_status-text-Fix aus 112). NUR diese
-- Migration muss ausgeführt werden.
--
-- Problem: 101/112 ermitteln die umzuhängenden Tabellen rein dynamisch über
-- pg_constraint, also nur Tabellen mit einem DEKLARIERTEN Foreign Key auf
-- leads(id). Die Kern-Kind-Tabellen (lead_notes, lead_calls, lead_contacts,
-- lead_changes, lead_job_postings, lead_enrichments) stammen aus dem Basis-Schema
-- (vor Migration 041). Fehlt dort ein FK auf leads, würden z.B. NOTIZEN beim
-- Zusammenführen NICHT mit umgehängt → sie blieben am archivierten Verlierer
-- hängen und wären aus Sicht des behaltenen Leads verloren.
--
-- Fix: Die Liste der (Tabelle, Spalte) wird aus der VEREINIGUNG gebildet von
--   (a) allen deklarierten FKs auf leads(id)  — wie bisher, und
--   (b) einer expliziten Liste der Kern-Kind-Tabellen (nur wenn Tabelle+Spalte
--       wirklich existieren).
-- UNION+DISTINCT (beide auf regclass::text normalisiert) ⇒ jede Tabelle wird genau
-- EINMAL verarbeitet, also idempotent, falls ein FK doch existiert. Die
-- datenverlustsichere Umhäng-Logik (Bulk-UPDATE; bei unique_violation pro-Zeile
-- über ctid, nur die echte Kollision wird verworfen) bleibt unverändert.

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
