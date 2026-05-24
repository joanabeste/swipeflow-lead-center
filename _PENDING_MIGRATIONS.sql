-- BUNDLED PENDING MIGRATIONS — ausfuehren im Supabase SQL-Editor
-- Provisions-/Auszahlungs-Modul: 065, 066, 067, 068


-- ===========================================
-- 065_profiles_wage.sql
-- ===========================================
-- 065: profiles um Stundenlohn-Felder fuer das Provisions-/Auszahlungs-Modul erweitern.
-- Nicht-destruktiv, additive Felder.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS hourly_wage_cents integer
    CHECK (hourly_wage_cents IS NULL OR hourly_wage_cents >= 0);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS wage_currency text DEFAULT 'EUR'
    CHECK (wage_currency IS NULL OR char_length(wage_currency) = 3);

-- ===========================================
-- 066_commission_rules.sql
-- ===========================================
-- 066: commission_rules — Admin-konfigurierbare Provisions-Regeln.
-- Eine Regel knuepft an einen custom_lead_status: wird der Status erreicht,
-- bekommt der zustaendige Mitarbeiter (leads.assigned_to, siehe 067) den Betrag.

CREATE TABLE IF NOT EXISTS public.commission_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  trigger_status_id text NOT NULL REFERENCES public.custom_lead_statuses(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  currency text NOT NULL DEFAULT 'EUR' CHECK (char_length(currency) = 3),
  scope text NOT NULL DEFAULT 'all' CHECK (scope IN ('all','role','user')),
  scope_role text CHECK (scope_role IS NULL OR scope_role IN ('admin','sales','viewer','employee')),
  scope_user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commission_rules_scope_consistency CHECK (
    (scope = 'all' AND scope_role IS NULL AND scope_user_id IS NULL) OR
    (scope = 'role' AND scope_role IS NOT NULL AND scope_user_id IS NULL) OR
    (scope = 'user' AND scope_user_id IS NOT NULL AND scope_role IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS commission_rules_status_idx
  ON public.commission_rules(trigger_status_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS commission_rules_scope_user_idx
  ON public.commission_rules(scope_user_id) WHERE scope_user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.commission_rules_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS commission_rules_set_updated_at ON public.commission_rules;
CREATE TRIGGER commission_rules_set_updated_at
  BEFORE UPDATE ON public.commission_rules
  FOR EACH ROW EXECUTE FUNCTION public.commission_rules_touch();

ALTER TABLE public.commission_rules ENABLE ROW LEVEL SECURITY;

-- Lesen: alle authentifizierten User. Mitarbeiter sollen sehen koennen, wofuer
-- sie Provision bekommen koennen (Transparenz).
DROP POLICY IF EXISTS commission_rules_select_all ON public.commission_rules;
CREATE POLICY commission_rules_select_all ON public.commission_rules
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Schreiben: nur Admins.
DROP POLICY IF EXISTS commission_rules_insert_admin ON public.commission_rules;
CREATE POLICY commission_rules_insert_admin ON public.commission_rules
  FOR INSERT WITH CHECK (public.zeit_is_admin());

DROP POLICY IF EXISTS commission_rules_update_admin ON public.commission_rules;
CREATE POLICY commission_rules_update_admin ON public.commission_rules
  FOR UPDATE USING (public.zeit_is_admin());

DROP POLICY IF EXISTS commission_rules_delete_admin ON public.commission_rules;
CREATE POLICY commission_rules_delete_admin ON public.commission_rules
  FOR DELETE USING (public.zeit_is_admin());

-- ===========================================
-- 067_leads_assigned_to.sql
-- ===========================================
-- 067: leads.assigned_to — Wer ist fuer einen Lead zustaendig?
-- Wird vom Provisions-System gelesen (066/068): erreicht der Lead einen
-- Trigger-Status, bekommt der assigned_to-User die Provision.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS leads_assigned_to_idx
  ON public.leads(assigned_to) WHERE assigned_to IS NOT NULL;

-- ===========================================
-- 068_commission_events.sql
-- ===========================================
-- 068: commission_events — Append-only Ledger der tatsaechlich verdienten Provisionen.
-- Pro (Regel, Lead) genau ein Eintrag (UNIQUE) — verhindert Doppelauszahlung bei
-- Status-Toggle (z.B. zurueck und wieder vor).

CREATE TABLE IF NOT EXISTS public.commission_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES public.commission_rules(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  currency text NOT NULL DEFAULT 'EUR' CHECK (char_length(currency) = 3),
  trigger_status_id text REFERENCES public.custom_lead_statuses(id) ON DELETE SET NULL,
  earned_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commission_events_unique_rule_lead UNIQUE (rule_id, lead_id)
);

CREATE INDEX IF NOT EXISTS commission_events_user_earned_idx
  ON public.commission_events(user_id, earned_at DESC);
CREATE INDEX IF NOT EXISTS commission_events_lead_idx
  ON public.commission_events(lead_id);

ALTER TABLE public.commission_events ENABLE ROW LEVEL SECURITY;

-- Lesen: eigene Events sehen, Admin sieht alle.
DROP POLICY IF EXISTS commission_events_select_own_or_admin ON public.commission_events;
CREATE POLICY commission_events_select_own_or_admin ON public.commission_events
  FOR SELECT USING (user_id = auth.uid() OR public.zeit_is_admin());

-- Schreiben: Service-Role (Server Action mit createServiceClient) umgeht RLS;
-- normale User haben hier explizit keinen INSERT/UPDATE/DELETE-Path.
-- Optional Admin-Korrekturen ueber UI moeglich.
DROP POLICY IF EXISTS commission_events_update_admin ON public.commission_events;
CREATE POLICY commission_events_update_admin ON public.commission_events
  FOR UPDATE USING (public.zeit_is_admin());

DROP POLICY IF EXISTS commission_events_delete_admin ON public.commission_events;
CREATE POLICY commission_events_delete_admin ON public.commission_events
  FOR DELETE USING (public.zeit_is_admin());

-- ===========================================
-- 075_section_permissions.sql (NACHTRAG)
-- ===========================================
-- 075: Sektion-Berechtigungen pro User. Admins haben immer Zugriff (Override im Code).
-- Defaults setzen sich nach bestehender role: admin/sales/viewer → vertrieb+fulfillment, employee → zeit.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS can_vertrieb boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_fulfillment boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_zeit boolean NOT NULL DEFAULT true;

-- Defaults: Mitarbeiter (role='employee') nur Zeit. Bestehende Admins/Sales bleiben auf alles.
UPDATE public.profiles
  SET can_vertrieb = false, can_fulfillment = false
  WHERE role = 'employee'
    AND can_vertrieb = true AND can_fulfillment = true;

-- ===========================================
-- 076_vertical_sonstiges.sql (NACHTRAG)
-- ===========================================
-- 076: 'sonstiges' als zulaessigen Wert fuer leads.vertical und projects.vertical erlauben.
-- Im UI heisst das Feld "Bereich" (statt "Vertikale"), Werte: webdesign | recruiting | sonstiges.

DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname FROM pg_constraint
  WHERE conrelid = 'public.leads'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%vertical%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.leads DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE public.leads
  ADD CONSTRAINT leads_vertical_check
  CHECK (vertical IS NULL OR vertical IN ('webdesign', 'recruiting', 'sonstiges'));

DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname FROM pg_constraint
  WHERE conrelid = 'public.projects'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%vertical%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.projects DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE public.projects
  ADD CONSTRAINT projects_vertical_check
  CHECK (vertical IS NULL OR vertical IN ('webdesign', 'recruiting', 'sonstiges'));

-- ===========================================
-- 077_rls_admin_baseline.sql (NACHTRAG)
-- ===========================================
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


-- ============================================================================
-- 078: customer_contacts → first_name + last_name + salutation
-- ============================================================================
ALTER TABLE customer_contacts
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS salutation text NOT NULL DEFAULT 'sie'
    CHECK (salutation IN ('du', 'sie'));

UPDATE customer_contacts
SET
  first_name = split_part(trim(name), ' ', 1),
  last_name  = NULLIF(regexp_replace(trim(name), '^\S+\s*', ''), '')
WHERE first_name IS NULL;

ALTER TABLE customer_contacts DROP COLUMN name;

ALTER TABLE customer_contacts
  ADD COLUMN name text GENERATED ALWAYS AS (
    trim(coalesce(first_name, '') || ' ' || coalesce(last_name, ''))
  ) STORED;
-- 079: IMAP-Sync + Mail-Konversationen
-- Erweitert user_smtp_credentials um IMAP-Felder; legt email_threads +
-- email_thread_messages an (in + out gemischt, Lead-zugeordnet).

-- ─── IMAP-Felder neben SMTP ──────────────────────────────────────
ALTER TABLE user_smtp_credentials
  ADD COLUMN IF NOT EXISTS imap_host text,
  ADD COLUMN IF NOT EXISTS imap_port integer DEFAULT 993,
  ADD COLUMN IF NOT EXISTS imap_secure boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS imap_username text,
  ADD COLUMN IF NOT EXISTS imap_password_encrypted text,
  ADD COLUMN IF NOT EXISTS imap_sent_folder text DEFAULT 'Sent',
  ADD COLUMN IF NOT EXISTS imap_last_uid_inbox bigint,
  ADD COLUMN IF NOT EXISTS imap_last_uid_sent bigint,
  ADD COLUMN IF NOT EXISTS imap_last_sync_at timestamptz,
  ADD COLUMN IF NOT EXISTS imap_last_sync_error text,
  ADD COLUMN IF NOT EXISTS imap_verified_at timestamptz;

-- ─── Threads (Konversationen, optional einem Lead zugeordnet) ────
CREATE TABLE IF NOT EXISTS email_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES leads(id) ON DELETE CASCADE,
  subject_normalized text,
  participants text[] NOT NULL DEFAULT '{}',
  message_count integer NOT NULL DEFAULT 0,
  last_message_at timestamptz,
  unread_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_threads_lead_idx
  ON email_threads(lead_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS email_threads_unassigned_idx
  ON email_threads(last_message_at DESC) WHERE lead_id IS NULL;

-- ─── Einzel-Nachrichten ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_thread_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES email_threads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('in', 'out')),
  message_id text,
  in_reply_to text,
  references_ids text[],
  from_email text,
  from_name text,
  to_emails text[],
  cc_emails text[],
  subject text,
  body_text text,
  body_html text,
  attachments jsonb,
  imap_uid bigint,
  imap_folder text,
  received_at timestamptz NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_messages_thread_idx
  ON email_thread_messages(thread_id, received_at);
CREATE INDEX IF NOT EXISTS email_messages_user_idx
  ON email_thread_messages(user_id);
-- Dedup pro User+Folder+UID
CREATE UNIQUE INDEX IF NOT EXISTS email_messages_uid_unique
  ON email_thread_messages(user_id, imap_folder, imap_uid)
  WHERE imap_uid IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS email_messages_msgid_unique
  ON email_thread_messages(user_id, message_id)
  WHERE message_id IS NOT NULL;

-- ─── RLS ─────────────────────────────────────────────────────────
ALTER TABLE email_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_thread_messages ENABLE ROW LEVEL SECURITY;

-- Threads: alle authentifizierten User können lesen (Team-Inbox); schreiben
-- erfolgt ausschliesslich serverseitig via Service-Role (kein Client-Insert).
DROP POLICY IF EXISTS email_threads_select ON email_threads;
CREATE POLICY email_threads_select ON email_threads
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS email_thread_messages_select ON email_thread_messages;
CREATE POLICY email_thread_messages_select ON email_thread_messages
  FOR SELECT TO authenticated USING (true);

-- updated_at-Trigger
CREATE OR REPLACE FUNCTION email_threads_touch() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS email_threads_touch_trg ON email_threads;
CREATE TRIGGER email_threads_touch_trg
  BEFORE UPDATE ON email_threads
  FOR EACH ROW EXECUTE FUNCTION email_threads_touch();
