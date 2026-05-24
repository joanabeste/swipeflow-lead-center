-- Selbstlernende Lead-Qualitaet: passive Faktor-Erfassung pro Enrichment-Lauf,
-- strukturierter Initial-Quality-Score, strukturierte Cancel-Reasons,
-- Override-Tracking. Ziel: Pre-CRM-Pipeline lernt automatisch, welche Leads
-- den Recherche-Aufwand wert sind.

-- 1) Faktor-Snapshot pro Enrichment-Lauf -------------------------------------
-- Snapshottet ALLE bewertungsrelevanten Faktoren, mit denen die Entscheidung
-- "qualified/cancelled/enriched" getroffen wurde, plus die Config zum Zeitpunkt
-- der Entscheidung. Damit ist jede vergangene Entscheidung rekonstruierbar,
-- auch wenn die Config spaeter geaendert wird.
ALTER TABLE lead_enrichments
  ADD COLUMN IF NOT EXISTS factor_snapshot jsonb;

CREATE INDEX IF NOT EXISTS lead_enrichments_factor_outcome_idx
  ON lead_enrichments ((factor_snapshot->'decision'->>'outcome'));
CREATE INDEX IF NOT EXISTS lead_enrichments_factor_reason_idx
  ON lead_enrichments ((factor_snapshot->'decision'->>'reason_code'));

-- 2) Strukturierter Cancel-Reason --------------------------------------------
-- cancel_reason bleibt als Freitext erhalten (UI-Anzeige), aber zusaetzlich
-- ein normalisierter Code fuer Aggregationen und Lern-Cron.
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS cancel_reason_code text;

CREATE INDEX IF NOT EXISTS leads_cancel_reason_code_idx
  ON leads (cancel_reason_code)
  WHERE cancel_reason_code IS NOT NULL;

-- Cancel-Rules bekommen optional einen reason_code, der bei Match auf den Lead
-- propagiert wird. Bestehende Rules ohne Code fallen auf 'rule_match' zurueck.
ALTER TABLE cancel_rules
  ADD COLUMN IF NOT EXISTS reason_code text;

-- 3) Initial-Quality-Score 0-100 ---------------------------------------------
-- Basiert ausschliesslich auf Daten-Vollstaendigkeit, Erreichbarkeit, Fit —
-- NICHT auf Sales-Outcome. Lead "kein Interesse" kann hohen Score haben.
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS initial_quality_score integer,
  ADD COLUMN IF NOT EXISTS quality_factors jsonb;

ALTER TABLE leads
  ADD CONSTRAINT leads_initial_quality_score_range
  CHECK (initial_quality_score IS NULL OR (initial_quality_score >= 0 AND initial_quality_score <= 100));

CREATE INDEX IF NOT EXISTS leads_initial_quality_score_idx
  ON leads (initial_quality_score DESC NULLS LAST)
  WHERE status NOT IN ('imported');

-- 4) Erweiterte Lead-Daten fuer Qualitaets-Beurteilung -----------------------
-- Granular gehaltene Spalten nur fuer Felder, die regelmaessig gefiltert werden;
-- Rest landet im quality_factors JSONB damit Schema flach bleibt.
ALTER TABLE leads
  -- HTTP / Erreichbarkeit
  ADD COLUMN IF NOT EXISTS website_status_code integer,
  ADD COLUMN IF NOT EXISTS website_final_url text,
  ADD COLUMN IF NOT EXISTS website_html_size_bytes integer,
  -- Inhalt / Sprache
  ADD COLUMN IF NOT EXISTS website_page_title text,
  ADD COLUMN IF NOT EXISTS website_meta_description text,
  ADD COLUMN IF NOT EXISTS website_language text,
  -- Strukturelle Indikatoren (Vertrauenswuerdigkeit)
  ADD COLUMN IF NOT EXISTS website_has_impressum boolean,
  ADD COLUMN IF NOT EXISTS website_has_privacy boolean,
  ADD COLUMN IF NOT EXISTS website_has_contact_form boolean,
  ADD COLUMN IF NOT EXISTS website_image_count integer,
  ADD COLUMN IF NOT EXISTS website_internal_link_count integer,
  ADD COLUMN IF NOT EXISTS website_external_link_count integer,
  -- Visuelles Design via Vision-LLM
  ADD COLUMN IF NOT EXISTS website_design_score integer,
  ADD COLUMN IF NOT EXISTS website_visual_issues jsonb,
  -- Social-Profile (oft gut als HR-/Kontakt-Quelle)
  ADD COLUMN IF NOT EXISTS social_linkedin_url text,
  ADD COLUMN IF NOT EXISTS social_xing_url text,
  ADD COLUMN IF NOT EXISTS social_facebook_url text,
  ADD COLUMN IF NOT EXISTS social_instagram_url text,
  ADD COLUMN IF NOT EXISTS social_youtube_url text,
  -- Daten-Konsistenz-Signal
  ADD COLUMN IF NOT EXISTS email_domain_matches_website boolean,
  -- Versuchs-Counter fuer Trend-Analyse
  ADD COLUMN IF NOT EXISTS enrichment_attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS successful_enrichment_count integer NOT NULL DEFAULT 0;

ALTER TABLE leads
  ADD CONSTRAINT leads_website_design_score_range
  CHECK (website_design_score IS NULL OR (website_design_score >= 0 AND website_design_score <= 100));

-- 5) Cancel-Override-Log -----------------------------------------------------
-- Jede manuelle Korrektur "cancelled -> qualified/enriched" wird automatisch
-- protokolliert. Das ist das staerkste passive Lernsignal: User hat dem System
-- widersprochen, weil die Cancel-Entscheidung falsch war.
CREATE TABLE IF NOT EXISTS cancel_override_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  previous_status text NOT NULL,
  new_status text NOT NULL,
  previous_cancel_reason text,
  previous_cancel_reason_code text,
  previous_cancel_rule_id uuid,
  factor_snapshot jsonb,  -- Snapshot zum Zeitpunkt der Cancel-Entscheidung
  overridden_by uuid REFERENCES auth.users(id),
  overridden_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cancel_override_log_lead_idx
  ON cancel_override_log (lead_id);
CREATE INDEX IF NOT EXISTS cancel_override_log_reason_code_idx
  ON cancel_override_log (previous_cancel_reason_code, overridden_at DESC)
  WHERE previous_cancel_reason_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS cancel_override_log_rule_idx
  ON cancel_override_log (previous_cancel_rule_id, overridden_at DESC)
  WHERE previous_cancel_rule_id IS NOT NULL;

-- 6) scoring_suggestions Erweiterung -----------------------------------------
-- Lern-Cron schreibt jetzt nicht nur Config-Diff, sondern auch:
--  - Beispiel-Leads zum Springen im UI (sample_lead_ids)
--  - Faktor-Verteilungen die zur Empfehlung gefuehrt haben (factor_analysis)
--  - Trigger-Quelle ('crm_status' vs 'override_rate' vs 'quality_score')
ALTER TABLE scoring_suggestions
  ADD COLUMN IF NOT EXISTS sample_lead_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  ADD COLUMN IF NOT EXISTS factor_analysis jsonb,
  ADD COLUMN IF NOT EXISTS trigger_source text NOT NULL DEFAULT 'crm_status'
    CHECK (trigger_source IN ('crm_status','override_rate','quality_distribution','manual'));
