-- Notizen & Aktivitäten pro Deal.
--
-- Hintergrund: Der User will sichtbar haben, wer welche Phase eines Deals
-- übernommen hat — Person A hat angelegt, Person B hat das Erstgespräch
-- geführt, Person C das Closing. Eine generische Notiz-Tabelle mit
-- optionalem activity_type (call, meeting, email, note) reicht dafür und
-- ist erweiterbar ohne weitere Migrationen.

create table if not exists deal_notes (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id) on delete cascade,
  content text not null,
  activity_type text not null default 'note'
    check (activity_type in ('note', 'call', 'meeting', 'email', 'closing')),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists deal_notes_deal_idx on deal_notes(deal_id, created_at desc);
create index if not exists deal_notes_author_idx on deal_notes(created_by, created_at desc);

alter table deal_notes enable row level security;

drop policy if exists "deal_notes_read_authenticated" on deal_notes;
create policy "deal_notes_read_authenticated" on deal_notes
  for select to authenticated using (true);

-- Schreibzugriff nur über Service-Client (Server-Actions schreiben created_by
-- aus dem Auth-Context — damit bleibt das Autor-Feld vertrauenswürdig).
