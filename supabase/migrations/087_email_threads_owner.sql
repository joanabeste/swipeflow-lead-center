-- 087: Visibility-Modell fuer Mail-Threads.
-- owner_user_id = User, dessen IMAP-Sync den Thread erstmals angelegt hat.
-- Lesen: nur eigener Thread ODER bereits einem Projekt zugeordnet.

ALTER TABLE public.email_threads
  ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS email_threads_owner_idx
  ON public.email_threads(owner_user_id) WHERE owner_user_id IS NOT NULL;

-- Backfill: aelteste Message-user_id pro Thread als Owner setzen.
UPDATE public.email_threads t
SET owner_user_id = m.user_id
FROM (
  SELECT DISTINCT ON (thread_id) thread_id, user_id
  FROM public.email_thread_messages
  ORDER BY thread_id, created_at ASC
) m
WHERE t.id = m.thread_id AND t.owner_user_id IS NULL;

-- RLS: Thread lesen, wenn Projekt-Zuordnung existiert oder man Owner ist.
DROP POLICY IF EXISTS email_threads_select ON public.email_threads;
CREATE POLICY email_threads_select ON public.email_threads
  FOR SELECT TO authenticated
  USING (project_id IS NOT NULL OR owner_user_id = auth.uid());

-- Messages: eigene Nachrichten sehen, oder solche aus Threads mit Projekt-Zuordnung.
DROP POLICY IF EXISTS email_thread_messages_select ON public.email_thread_messages;
CREATE POLICY email_thread_messages_select ON public.email_thread_messages
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.email_threads t
      WHERE t.id = thread_id AND t.project_id IS NOT NULL
    )
  );
