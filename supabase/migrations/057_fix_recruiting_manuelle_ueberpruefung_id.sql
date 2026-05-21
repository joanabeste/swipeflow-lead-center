-- Prod-DB hat den Recruiting-Status historisch unter der ID
-- 'manuelle-ueberpruefung' angelegt (Seed 048 wurde abweichend ausgefuehrt).
-- Der Code in lead-table.tsx erwartet aber 'recruiting-manuelle-ueberpruefung'
-- und fuehrt sonst beim „Ins CRM" zu einem FK-Constraint-Fehler.
-- Da 0 Leads die alte ID referenzieren, koennen wir gefahrlos umbenennen
-- und gleichzeitig die korrekte `vertical`-Zuordnung setzen.

UPDATE custom_lead_statuses
SET id = 'recruiting-manuelle-ueberpruefung',
    vertical = 'recruiting'
WHERE id = 'manuelle-ueberpruefung';

-- Fallback, falls die Quellzeile in einer anderen Umgebung gar nicht existiert:
INSERT INTO custom_lead_statuses (id, label, color, description, display_order, is_active, vertical)
VALUES (
  'recruiting-manuelle-ueberpruefung',
  'Recruiting – Manuelle Überprüfung',
  '#10b981',
  'Qualifizierte Recruiting-Leads zur manuellen Sichtung',
  10, true, 'recruiting'
)
ON CONFLICT (id) DO NOTHING;
