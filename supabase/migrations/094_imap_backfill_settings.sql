-- 092: Konfigurierbarer Backfill für den IMAP-Sync.
-- backfill_days = wie viele Tage Historie beim Initial-Sync geladen werden (0 = unbegrenzt).
-- deep_sync_requested_at = One-Shot-Marker: nächster Sync ignoriert UID-Cursor und macht
-- einen tiefen Backfill, danach wird das Feld geleert.

alter table public.user_smtp_credentials
  add column if not exists imap_backfill_days integer not null default 30,
  add column if not exists imap_deep_sync_requested_at timestamptz;
