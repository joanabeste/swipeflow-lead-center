-- 105: Hinterlegte swipeflow-Unterschrift fürs Vertrags-PDF.
--
-- Die rechte Unterschrifts-Box im Vertrags-PDF (Dienstleister) war bisher ein
-- leerer Platzhalter. Ein Admin kann jetzt in den Firmen-Einstellungen einmalig
-- ein Unterschrift-PNG hinterlegen, das in jedem PDF gerendert wird.
--
-- Das PNG selbst liegt im bestehenden privaten `contracts`-Bucket auf festem
-- Pfad (company/provider-signature.png); hier wird nur der Pfad referenziert.

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS provider_signature_path text,
  ADD COLUMN IF NOT EXISTS provider_signature_updated_at timestamptz;
