-- 107: Felder für Social-Media-Content-Verträge (dritter Vertragstyp).
--
-- Anders als Webdesign/Recruiting ist dies ein unbefristeter, monatlich
-- laufender Betreuungsvertrag. Variabel: Plattformen, Posting-Frequenz,
-- optionale Vor-Ort-Produktion (mit Intervall), Mindestlaufzeit & Kündigungsfrist.
--
-- Wiederverwendung: monthly_maint_cents = monatlicher Betreuungsbetrag,
-- setup_price_cents = optionale Einrichtungsgebühr, campaign_start = Vertragsbeginn.

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS content_platforms     text,
  ADD COLUMN IF NOT EXISTS posts_per_week        integer,
  ADD COLUMN IF NOT EXISTS onsite_production     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS onsite_interval_months integer,
  ADD COLUMN IF NOT EXISTS min_term_months       integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notice_period_weeks   integer NOT NULL DEFAULT 4;
