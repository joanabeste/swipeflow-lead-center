-- Dashboard-Layout: von text[] (nur Reihenfolge) zu jsonb mit Breite pro Widget.
-- Altes Format:
--   ["my-day", "pipeline", "stats"]
-- Neues Format:
--   [{"k":"my-day","w":"half"}, {"k":"pipeline","w":"full"}, {"k":"stats","w":"full"}]
--
-- Breitenstufen: 'third' (1/3), 'half' (1/2), 'two-thirds' (2/3), 'full' (1/1)
-- Migration mapped Altdaten so, dass die bisherige View-Mode-Logik der Page
-- reproduziert wird (siehe fullWidthKeys in der alten page.tsx).
--
-- Idempotent: prüft erst den Spaltentyp, bevor konvertiert wird.

do $$
declare
  current_type text;
begin
  -- Aktuellen Datentyp der Spalte prüfen.
  select data_type into current_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'profiles'
    and column_name = 'dashboard_widgets';

  if current_type is null then
    -- Spalte existiert nicht (frisches Setup): als jsonb anlegen, fertig.
    alter table profiles add column dashboard_widgets jsonb;
    return;
  end if;

  if current_type = 'jsonb' then
    -- Schon konvertiert. Nichts zu tun.
    return;
  end if;

  if current_type = 'ARRAY' then
    -- text[]-Format in jsonb-Format überführen.
    alter table profiles add column if not exists dashboard_widgets_v2 jsonb;

    update profiles
    set dashboard_widgets_v2 = (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'k', key,
            'w', case
              when key in (
                'pipeline', 'stats', 'quick-actions',
                'call-stats-7d', 'enrichment-trend-7d', 'crm-status-distribution'
              ) then 'full'
              else 'half'
            end
          )
          order by ord
        ),
        '[]'::jsonb
      )
      from unnest(profiles.dashboard_widgets) with ordinality as t(key, ord)
    )
    where dashboard_widgets is not null
      and dashboard_widgets_v2 is null;

    alter table profiles drop column dashboard_widgets;
    alter table profiles rename column dashboard_widgets_v2 to dashboard_widgets;
    return;
  end if;

  -- Unbekannter Typ — laut sichtbar machen, aber nicht crashen.
  raise notice 'profiles.dashboard_widgets hat unerwarteten Typ %, Migration übersprungen.', current_type;
end $$;
