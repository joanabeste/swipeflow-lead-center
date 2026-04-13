-- Service-Modi: Recruiting vs. Webentwicklung

-- Modus pro User
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS service_mode text NOT NULL DEFAULT 'recruiting'
    CHECK (service_mode IN ('recruiting', 'webdev'));

-- Website-Qualitätsdaten auf Leads (für Webdev-Modus)
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS has_ssl boolean,
  ADD COLUMN IF NOT EXISTS is_mobile_friendly boolean,
  ADD COLUMN IF NOT EXISTS page_speed_score integer,
  ADD COLUMN IF NOT EXISTS website_tech text,
  ADD COLUMN IF NOT EXISTS website_age_estimate text,
  ADD COLUMN IF NOT EXISTS website_issues jsonb DEFAULT '[]';
