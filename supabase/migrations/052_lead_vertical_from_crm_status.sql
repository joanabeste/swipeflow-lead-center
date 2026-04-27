-- KI-Scoring-Reviewer filtert Trainingsdaten per `leads.vertical`. Aeltere
-- Importe (ohne explizite Vertikale-Auswahl) haben aber `vertical = NULL`,
-- selbst wenn der CRM-Status eindeutig zu einer Vertikale gehoert
-- (z. B. `recruiting-todo`, `webdesign-todo`). Folge: positive=0/negative=0
-- trotz vieler Leads — Reviewer ueberspringt mit "Zu wenig Trainings-Daten".

-- 1. Backfill: aus dem CRM-Status die Vertikale ziehen, wo Lead noch keine hat.
UPDATE leads l
SET vertical = c.vertical
FROM custom_lead_statuses c
WHERE l.crm_status_id = c.id
  AND l.vertical IS NULL
  AND c.vertical IS NOT NULL;

-- 2. Trigger: zukuenftige Updates auf crm_status_id ziehen vertical mit,
-- wenn der Lead noch keine Vertikale hat. So bleibt der Datenstand auch
-- ohne explizites Setzen in den Server-Actions konsistent.
CREATE OR REPLACE FUNCTION sync_lead_vertical_from_crm_status()
RETURNS trigger AS $$
BEGIN
  IF NEW.crm_status_id IS NOT NULL
     AND NEW.vertical IS NULL
     AND (TG_OP = 'INSERT' OR NEW.crm_status_id IS DISTINCT FROM OLD.crm_status_id) THEN
    SELECT vertical INTO NEW.vertical
      FROM custom_lead_statuses
      WHERE id = NEW.crm_status_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_lead_vertical ON leads;
CREATE TRIGGER sync_lead_vertical
BEFORE INSERT OR UPDATE OF crm_status_id ON leads
FOR EACH ROW
EXECUTE FUNCTION sync_lead_vertical_from_crm_status();
