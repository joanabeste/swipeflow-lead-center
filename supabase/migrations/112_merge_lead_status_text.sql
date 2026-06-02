-- 112: merge_lead Typ-Fix für custom_lead_statuses.id.
--
-- Bug (101): die Variable `v_archived_status` war als `uuid` deklariert, aber
-- `custom_lead_statuses.id` ist `text` (Slugs wie 'recruiting-passt-nicht',
-- 'webdesign-manuelle-ueberpruefung'). Dadurch scheiterte `SELECT id INTO
-- v_archived_status` mit „invalid input syntax for type uuid: 'recruiting-passt-nicht'"
-- und JEDES Zusammenführen schlug fehl (152 Fehler auf /admin/duplikate).
--
-- Fix: `v_archived_status text`. Sonst identisch zu 101. (leads.id / p_survivor /
-- p_loser bleiben uuid — nur die CRM-Status-ID ist text.)

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

  -- Alle Spalten finden, die per Foreign Key auf leads(id) zeigen.
  FOR r IN
    SELECT con.conrelid::regclass AS tbl, att.attname AS col
    FROM pg_constraint con
    JOIN pg_attribute att
      ON att.attrelid = con.conrelid
     AND att.attnum = ANY (con.conkey)
    WHERE con.contype = 'f'
      AND con.confrelid = 'public.leads'::regclass
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
