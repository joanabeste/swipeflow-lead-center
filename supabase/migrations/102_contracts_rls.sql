-- 102: Contracts-RLS verschärfen — nur Admins statt jeder authenticated-Rolle.
--
-- Bisher (099): contracts/contract_events sowie der private Storage-Bucket
-- erlaubten SELECT/ALL für JEDE authenticated-Rolle. Damit hätte jeder
-- eingeloggte User (employee etc.) per RLS-Client alle Verträge inkl.
-- signierter PDFs lesen können. Schutz war nur die App-Ebene (requireAdmin).
--
-- Jetzt: Zugriff per RLS nur für Admins. Der öffentliche Signier-Flow
-- (/vertrag) und die Admin-Actions nutzen die Service-Role und umgehen RLS,
-- bleiben also unverändert funktionsfähig. Der einzige RLS-gebundene Lesepfad
-- (lib/contracts/data.ts via createClient) ist nun korrekt admin-only.

-- Admin-Check, RLS-tauglich. SECURITY DEFINER, damit das Lesen aus profiles
-- nicht selbst an profiles-RLS scheitert.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- ─── contracts ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS contracts_select ON public.contracts;
CREATE POLICY contracts_select ON public.contracts
  FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS contracts_write ON public.contracts;
CREATE POLICY contracts_write ON public.contracts
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ─── contract_events ───────────────────────────────────────────────
DROP POLICY IF EXISTS contract_events_select ON public.contract_events;
CREATE POLICY contract_events_select ON public.contract_events
  FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS contract_events_write ON public.contract_events;
CREATE POLICY contract_events_write ON public.contract_events
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ─── Storage-Bucket contracts ──────────────────────────────────────
DROP POLICY IF EXISTS contracts_authenticated_read ON storage.objects;
CREATE POLICY contracts_authenticated_read
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'contracts' AND public.is_admin());

DROP POLICY IF EXISTS contracts_authenticated_write ON storage.objects;
CREATE POLICY contracts_authenticated_write
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'contracts' AND public.is_admin());
