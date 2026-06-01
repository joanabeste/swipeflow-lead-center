-- 110: Widerrufsbelehrung pro Vertrag steuerbar. Additiv, kein Datenverlust.
-- Die Widerrufsbelehrung (Fernabsatz, § 13 BGB) gilt nur für Verbraucher bzw.
-- Unternehmen in Gründung. Statt sie fest am Vertragstyp 'webdesign' zu rendern,
-- wird sie nun pro Vertrag über dieses Flag gesteuert (Checkbox auf /vertraege/neu).

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS withdrawal_right boolean NOT NULL DEFAULT false;

-- Bestandsschutz: bisher zeigte NUR der Webdesign-Vertrag eine Widerrufsbelehrung
-- (immer). Bereits angelegte Webdesign-Verträge sollen unverändert bleiben, damit
-- ihr PDF beim Regenerieren die Belehrung nicht verliert.
UPDATE public.contracts SET withdrawal_right = true WHERE type = 'webdesign';
