-- Eigener Toggle für HR-/Personal-Verantwortliche.
-- Default Recruiting: HR-Suche an, "Alle Ansprechpartner" aus
-- (User kann beide kombinieren oder nur HR aktivieren).
update enrichment_defaults
   set config = (config - 'contacts_all')
                || jsonb_build_object('contacts_hr', true, 'contacts_all', false),
       updated_at = now()
 where service_mode = 'recruiting';

update enrichment_defaults
   set config = (config - 'contacts_all')
                || jsonb_build_object('contacts_hr', false, 'contacts_all', false),
       updated_at = now()
 where service_mode = 'webdev';
