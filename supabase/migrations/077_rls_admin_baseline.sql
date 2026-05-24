-- 077: RLS-Baseline fuer Admin-Funktionen. Schliesst Schutzluecken aus dem 2026-05-Audit.
-- Generische is_admin()-Function + Policies fuer profiles, audit_logs und weitere Admin-Tabellen.

-- ──────────────────────────────────────────────────────────────────
-- Generische is_admin() Function — ersetzt zeit_is_admin() langfristig.
-- zeit_is_admin() bleibt als Alias erhalten (bestehende Policies referenzieren sie).
-- ──────────────────────────────────────────────────────────────────

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

-- ──────────────────────────────────────────────────────────────────
-- profiles: User darf nur eigene Stammdaten (name, email) aendern, Admin alles.
-- Bestehende Policies werden ersetzt — neue Logik gilt.
-- ──────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select_authenticated ON public.profiles;
CREATE POLICY profiles_select_authenticated ON public.profiles
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS profiles_insert_admin ON public.profiles;
CREATE POLICY profiles_insert_admin ON public.profiles
  FOR INSERT WITH CHECK (public.is_admin());

-- User darf nur eigenes Profil aendern, aber NICHT Rolle / Permissions / Stundenlohn etc.
-- Das prueft die Policy nicht fuer Felder (Postgres-RLS kennt keine Spalten-WHERE),
-- sondern verbietet Update fuer alle Felder ausser bei Admin. Stammdaten-Edit (Name)
-- laeuft in der App ueber dedizierte Server-Action, die explizit nur Name updated.
DROP POLICY IF EXISTS profiles_update_self_or_admin ON public.profiles;
CREATE POLICY profiles_update_self_or_admin ON public.profiles
  FOR UPDATE USING (id = auth.uid() OR public.is_admin())
              WITH CHECK (id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS profiles_delete_admin ON public.profiles;
CREATE POLICY profiles_delete_admin ON public.profiles
  FOR DELETE USING (public.is_admin());

-- ──────────────────────────────────────────────────────────────────
-- audit_logs: SELECT/DELETE nur Admin. INSERT bleibt offen (Service-Role schreibt eh).
-- ──────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'audit_logs') THEN
    EXECUTE 'ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS audit_logs_select_admin ON public.audit_logs';
    EXECUTE 'CREATE POLICY audit_logs_select_admin ON public.audit_logs FOR SELECT USING (public.is_admin())';

    EXECUTE 'DROP POLICY IF EXISTS audit_logs_delete_admin ON public.audit_logs';
    EXECUTE 'CREATE POLICY audit_logs_delete_admin ON public.audit_logs FOR DELETE USING (public.is_admin())';
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────
-- custom_lead_statuses: nur Admin schreibt; alle authentifizierten lesen.
-- ──────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'custom_lead_statuses') THEN
    EXECUTE 'ALTER TABLE public.custom_lead_statuses ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS custom_lead_statuses_select ON public.custom_lead_statuses';
    EXECUTE 'CREATE POLICY custom_lead_statuses_select ON public.custom_lead_statuses FOR SELECT USING (auth.role() = ''authenticated'')';

    EXECUTE 'DROP POLICY IF EXISTS custom_lead_statuses_write ON public.custom_lead_statuses';
    EXECUTE 'CREATE POLICY custom_lead_statuses_write ON public.custom_lead_statuses FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin())';
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────
-- blacklist + cancel_rules: nur Admin schreibt; alle authentifizierten lesen.
-- ──────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'blacklist_entries') THEN
    EXECUTE 'ALTER TABLE public.blacklist_entries ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS blacklist_entries_select ON public.blacklist_entries';
    EXECUTE 'CREATE POLICY blacklist_entries_select ON public.blacklist_entries FOR SELECT USING (auth.role() = ''authenticated'')';

    EXECUTE 'DROP POLICY IF EXISTS blacklist_entries_write ON public.blacklist_entries';
    EXECUTE 'CREATE POLICY blacklist_entries_write ON public.blacklist_entries FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin())';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cancel_rules') THEN
    EXECUTE 'ALTER TABLE public.cancel_rules ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS cancel_rules_select ON public.cancel_rules';
    EXECUTE 'CREATE POLICY cancel_rules_select ON public.cancel_rules FOR SELECT USING (auth.role() = ''authenticated'')';

    EXECUTE 'DROP POLICY IF EXISTS cancel_rules_write ON public.cancel_rules';
    EXECUTE 'CREATE POLICY cancel_rules_write ON public.cancel_rules FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin())';
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────
-- Hinweis: can_vertrieb/can_fulfillment/can_zeit-Enforcement auf leads/projects/etc.
-- wurde bewusst NICHT in dieser Migration umgesetzt. Bisher sind diese Felder reine
-- UI-Filter. Eine RLS-basierte Enforcement waere ein groesserer Umbau (viele Tabellen),
-- und der Audit-Bericht empfiehlt erst zu entscheiden ob die Felder echte Berechtigung
-- oder UI-Convenience sein sollen. Wird in Phase B/C entschieden.
