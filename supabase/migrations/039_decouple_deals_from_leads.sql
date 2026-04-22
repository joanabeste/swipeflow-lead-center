-- Deals sollen nicht mehr zwingend an einem Lead hängen:
-- 1. "Neuer Deal → Neue Firma" legt keinen Lead-Datensatz mehr an. Der
--    Firmenname wird direkt auf dem Deal gespeichert (Snapshot).
-- 2. Wird ein bestehender Lead gelöscht, bleibt der Deal erhalten (FK auf
--    SET NULL statt CASCADE). Der Deal behält weiterhin den Firmennamen als
--    Snapshot, so dass Listen weiter einen Namen zeigen können.

-- FK neu setzen (CASCADE → SET NULL, NOT NULL → nullable).
alter table deals drop constraint if exists deals_lead_id_fkey;
alter table deals alter column lead_id drop not null;
alter table deals
  add constraint deals_lead_id_fkey
  foreign key (lead_id) references leads(id) on delete set null;

-- Snapshot-Spalte für den Firmennamen. Existing Deals erben den Wert aus
-- dem verknüpften Lead.
alter table deals add column if not exists company_name text;

update deals
set company_name = leads.company_name
from leads
where deals.lead_id = leads.id
  and deals.company_name is null;

-- Deals ohne Lead (dürfte nach Backfill keine geben) bekommen einen Platzhalter,
-- damit wir NOT NULL erzwingen können.
update deals set company_name = '—' where company_name is null;

alter table deals alter column company_name set not null;
