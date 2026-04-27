-- Vertikale am Lead (für Webdesign- und Recruiting-Importe) +
-- Toggle, ob Webdesign-Leads ohne Website akzeptiert werden.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS vertical text
  CHECK (vertical IN ('webdesign', 'recruiting'));

CREATE INDEX IF NOT EXISTS leads_vertical_idx ON leads(vertical) WHERE vertical IS NOT NULL;

ALTER TABLE webdev_scoring_config
  ADD COLUMN IF NOT EXISTS allow_leads_without_website boolean NOT NULL DEFAULT true;
