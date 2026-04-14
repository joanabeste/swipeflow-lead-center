-- Pro-User-Dashboard-Konfiguration: geordnete Liste aktiver Widget-Keys.
-- Bei null greift der Default aus dem Code.
alter table profiles
  add column if not exists dashboard_widgets text[];
