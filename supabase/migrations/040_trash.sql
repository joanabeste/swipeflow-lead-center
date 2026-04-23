-- Soft-Delete + Papierkorb:
-- Gelöschte Leads und Deals werden 30 Tage lang aufbewahrt, damit der User
-- sie versehentlich nicht endgültig verliert. Nach 30 Tagen löscht ein
-- pg_cron-Job sie endgültig; zugehörige Kinder (lead_contacts, lead_calls,
-- lead_notes, deals → CASCADE; deal_notes, deal_changes → CASCADE) gehen
-- dabei automatisch mit.

alter table leads add column if not exists deleted_at timestamptz;
alter table deals add column if not exists deleted_at timestamptz;

-- Partial Indexes: nur die wenigen Trash-Rows werden indiziert, Listen-
-- Queries profitieren implizit (Postgres kennt den `where`-Filter nicht,
-- aber Trash-Seiten werden damit O(log n)).
create index if not exists leads_deleted_at_idx on leads(deleted_at) where deleted_at is not null;
create index if not exists deals_deleted_at_idx on deals(deleted_at) where deleted_at is not null;

-- Auto-Purge: täglich um 03:00 UTC werden alle >30 Tage alten Trash-Rows
-- endgültig gelöscht. Kinder (lead_contacts, lead_calls, ...) löschen sich
-- per FK ON DELETE CASCADE automatisch mit.
create extension if not exists pg_cron;

-- Idempotent: bestehenden Job entfernen, dann neu anlegen.
-- `cron.unschedule` wirft, wenn der Job nicht existiert → in do-Block
-- abfangen.
do $$
begin
  perform cron.unschedule('purge_trash');
exception when others then null;
end $$;

select cron.schedule(
  'purge_trash',
  '0 3 * * *',
  $$
    delete from leads where deleted_at is not null and deleted_at < now() - interval '30 days';
    delete from deals where deleted_at is not null and deleted_at < now() - interval '30 days';
  $$
);
