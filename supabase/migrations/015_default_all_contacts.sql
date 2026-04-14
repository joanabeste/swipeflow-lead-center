-- Default für Recruiting: alle Ansprechpartner extrahieren (nicht nur Management),
-- HR-Verantwortliche werden vom Prompt explizit gesucht.
update enrichment_defaults
   set config = jsonb_set(config, '{contacts_all}', 'true'::jsonb),
       updated_at = now()
 where service_mode = 'recruiting';
