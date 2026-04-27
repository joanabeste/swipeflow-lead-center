-- Default-CRM-Status fuer das Qualifizierungsmodal:
-- Beim Qualifizieren eines Leads soll je nach Service-Mode automatisch
-- der passende „Manuelle Ueberpruefung"-Status gesetzt werden. Damit das
-- Frontend zuverlaessig matchen kann, werden die IDs hier deterministisch
-- vergeben (statt slug-abgeleitet).

INSERT INTO custom_lead_statuses (id, label, color, description, display_order, is_active)
VALUES
  ('recruiting-manuelle-ueberpruefung',
   'Recruiting – Manuelle Überprüfung',
   '#10b981',
   'Qualifizierte Recruiting-Leads zur manuellen Sichtung',
   10, true),
  ('webdesign-manuelle-ueberpruefung',
   'Webdesign — Manuelle Überprüfung',
   '#3b82f6',
   'Qualifizierte Webdesign-Leads zur manuellen Sichtung',
   20, true)
ON CONFLICT (id) DO NOTHING;
