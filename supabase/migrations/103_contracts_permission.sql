-- 103: Verträge als grant-bare Sektion — eigene Permission can_vertraege.
--
-- Bisher (102) waren contracts/contract_events sowie der Storage-Bucket per RLS
-- nur für Admins lesbar, und die App-Ebene (requireAdmin / Sidebar requires:"admin")
-- ließ ebenfalls nur Admins in den Bereich. Jetzt soll Verträge — wie Vertrieb /
-- Fulfillment / Learning — pro Nutzer freigeschaltet werden können.
--
-- Default ist bewusst restriktiv (false): Verträge enthalten IBANs und signierte
-- PDFs, niemand außer Admins bekommt implizit Zugriff.

-- ─── Permission-Spalte ─────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS can_vertraege boolean NOT NULL DEFAULT false;

-- Admins kosmetisch auf true (haben ohnehin Code-/RLS-Override).
UPDATE public.profiles SET can_vertraege = true WHERE role = 'admin';

-- ─── RLS-Check: Admin ODER explizite Verträge-Freigabe ─────────────
-- SECURITY DEFINER, damit das Lesen aus profiles nicht an profiles-RLS scheitert.
CREATE OR REPLACE FUNCTION public.can_access_contracts()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin() OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND can_vertraege
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_access_contracts() TO authenticated;

-- ─── contracts ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS contracts_select ON public.contracts;
CREATE POLICY contracts_select ON public.contracts
  FOR SELECT USING (public.can_access_contracts());

DROP POLICY IF EXISTS contracts_write ON public.contracts;
CREATE POLICY contracts_write ON public.contracts
  FOR ALL USING (public.can_access_contracts()) WITH CHECK (public.can_access_contracts());

-- ─── contract_events ───────────────────────────────────────────────
DROP POLICY IF EXISTS contract_events_select ON public.contract_events;
CREATE POLICY contract_events_select ON public.contract_events
  FOR SELECT USING (public.can_access_contracts());

DROP POLICY IF EXISTS contract_events_write ON public.contract_events;
CREATE POLICY contract_events_write ON public.contract_events
  FOR ALL USING (public.can_access_contracts()) WITH CHECK (public.can_access_contracts());

-- ─── Storage-Bucket contracts ──────────────────────────────────────
DROP POLICY IF EXISTS contracts_authenticated_read ON storage.objects;
CREATE POLICY contracts_authenticated_read
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'contracts' AND public.can_access_contracts());

DROP POLICY IF EXISTS contracts_authenticated_write ON storage.objects;
CREATE POLICY contracts_authenticated_write
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'contracts' AND public.can_access_contracts());
