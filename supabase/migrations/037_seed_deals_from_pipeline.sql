-- Initial-Import der Sales-Pipeline aus dem April-Sheet (Google Docs).
--
-- 1) deals um drei Felder erweitern, die im Sheet gepflegt sind:
--    - probability   (Closing-% in Prozent, 0–100)
--    - next_step     (Freitext: nächster geplanter Schritt)
--    - last_followup_at (letzter FollowUp-Termin)
--
-- 2) Für jedes Unternehmen aus dem Sheet:
--    - Lead anlegen (status=qualified, source_type=manual), falls keiner
--      mit diesem company_name existiert (case-insensitive)
--    - Deal anlegen, falls noch keiner mit (lead_id, title) existiert
--
-- Idempotent: mehrfaches Ausführen erzeugt keine Duplikate.

-- 1) Spalten auf deals ergänzen
alter table deals
  add column if not exists probability int
    check (probability is null or (probability >= 0 and probability <= 100)),
  add column if not exists next_step text,
  add column if not exists last_followup_at date;

-- 2) Stammdaten + Deals einpflegen
do $$
declare
  admin_user_id uuid;
  row_data record;
  lead_record_id uuid;
begin
  -- Created_by auf den ersten Admin (für Audit-Sichtbarkeit)
  select id into admin_user_id
  from profiles
  where role = 'admin'
  order by created_at asc
  limit 1;

  for row_data in
    select * from (values
      -- company_name, deal_title, amount_eur, stage_id, probability, next_step, last_followup
      ('Clemens',                        'Clemens',                        2500,  'won',       100, 'Tom hakt am 04.03. nach',    date '2026-02-26'),
      ('Premium Equines (Fabian Meyer)', 'Premium Equines (Fabian Meyer)', 2500,  'won',       100, 'Tom hakt am 03.03. nach',    date '2026-03-23'),
      ('Premium Soziales',               'Premium Soziales',               500,   'won',       100, null::text,                   null::date),
      ('BMI Group / Braas',              'BMI Group / Braas',              2500,  'proposal',  50,  'Urlaub: 16.03. hakt Tom nach', date '2026-03-23'),
      ('Naue',                           'Naue',                           11000, 'qualified', 65,  'Ersttermin am 12.03.',       date '2026-02-26'),
      ('Becken Group',                   'Becken Group',                   7000,  'proposal',  50,  'Urlaub: 16.03. hakt Tom nach', date '2026-02-26'),
      ('CAB',                            'CAB',                            3000,  'new',       null, 'Next Step: Ersttermin',     null::date),
      ('Espelkamper Sommer',             'Espelkamper Sommer',             2500,  'proposal',  50,  null::text,                   null::date),
      ('GAZ: Social Schulung',           'GAZ: Social Schulung',           1500,  'proposal',  50,  null::text,                   null::date),
      ('Westag: Azubi (2-3 Stellen)',    'Westag: Azubi (2-3 Stellen)',    5000,  'qualified', 65,  null::text,                   null::date)
    ) as t(
      company_name, deal_title, amount_eur, stage_id,
      probability, next_step, last_followup
    )
  loop
    -- Lead finden (case-insensitive) oder anlegen
    select id into lead_record_id
    from leads
    where lower(company_name) = lower(row_data.company_name)
    limit 1;

    if lead_record_id is null then
      insert into leads (company_name, status, source_type, created_by)
      values (row_data.company_name, 'qualified', 'manual', admin_user_id)
      returning id into lead_record_id;
    end if;

    -- Deal nur anlegen, wenn noch keiner mit gleichem title für diesen Lead
    if not exists (
      select 1 from deals
      where lead_id = lead_record_id
        and title = row_data.deal_title
    ) then
      insert into deals (
        lead_id, title, amount_cents, currency, stage_id,
        probability, next_step, last_followup_at,
        created_by, assigned_to
      ) values (
        lead_record_id,
        row_data.deal_title,
        row_data.amount_eur * 100,  -- EUR → Cent
        'EUR',
        row_data.stage_id,
        row_data.probability,
        row_data.next_step,
        row_data.last_followup,
        admin_user_id,
        admin_user_id
      );
    end if;
  end loop;
end $$;
