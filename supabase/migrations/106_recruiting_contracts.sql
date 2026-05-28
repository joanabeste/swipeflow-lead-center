-- 106: Felder für Social-Recruiting-Verträge (zweiter Vertragstyp neben Webdesign).
--
-- Der Recruiting-Vertrag (Agentur- und Auftragsverarbeitungsvertrag) hat eigene
-- variable Daten: Jobtitel, Kampagnen-Laufzeit (Start/Ende), ein Werbebudget
-- zusätzlich zur Agenturleistung sowie eine optionale Bewerbergarantie.
--
-- Wiederverwendung: setup_price_cents = Agenturleistung (Pauschalvergütung).
-- monthly_maint_cents bleibt für Recruiting 0 (einmalige Leistung).

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS job_title          text,
  ADD COLUMN IF NOT EXISTS campaign_start     date,
  ADD COLUMN IF NOT EXISTS campaign_end       date,
  ADD COLUMN IF NOT EXISTS ad_budget_cents    integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS applicant_guarantee boolean NOT NULL DEFAULT false;
