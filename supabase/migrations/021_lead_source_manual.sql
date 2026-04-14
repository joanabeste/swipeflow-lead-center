-- Wenn ein CHECK-Constraint auf leads.source_type existiert, um "manual" erweitern.
-- Idempotent: schlägt stillschweigend fehl, wenn keine Constraint vorhanden ist.
do $$
declare
  con_name text;
begin
  select conname into con_name
    from pg_constraint c
    join pg_class t on c.conrelid = t.oid
   where t.relname = 'leads'
     and c.contype = 'c'
     and pg_get_constraintdef(c.oid) ilike '%source_type%'
   limit 1;

  if con_name is not null then
    execute format('alter table leads drop constraint %I', con_name);
  end if;

  -- Neuen Check setzen (idempotent via DROP IF EXISTS + add)
  begin
    alter table leads drop constraint if exists leads_source_type_check;
  exception when others then null;
  end;

  alter table leads
    add constraint leads_source_type_check
    check (source_type in ('csv', 'url', 'directory', 'manual'));
end $$;
