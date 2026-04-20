-- Dashboard-Layout: von text[] (nur Reihenfolge) zu jsonb mit Breite pro Widget.
-- Altes Format:
--   ["my-day", "pipeline", "stats"]
-- Neues Format:
--   [{"k":"my-day","w":"half"}, {"k":"pipeline","w":"full"}, {"k":"stats","w":"full"}]
--
-- Breitenstufen: 'third' (1/3), 'half' (1/2), 'two-thirds' (2/3), 'full' (1/1)
-- Migration mapped Altdaten so, dass die bisherige View-Mode-Logik der Page
-- reproduziert wird (siehe fullWidthKeys in der alten page.tsx).

alter table profiles
  add column if not exists dashboard_widgets_v2 jsonb;

-- Bestehende text[]-Layouts in das neue Format konvertieren.
-- Widgets, die früher immer full-width waren, bekommen 'full'; der Rest
-- startet auf 'half' (entspricht der bisherigen Paar-Grid-Logik).
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
  from unnest(dashboard_widgets) with ordinality as t(key, ord)
)
where dashboard_widgets is not null
  and dashboard_widgets_v2 is null;

-- Alte Spalte entfernen, neue umbenennen.
alter table profiles drop column if exists dashboard_widgets;
alter table profiles rename column dashboard_widgets_v2 to dashboard_widgets;
