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
