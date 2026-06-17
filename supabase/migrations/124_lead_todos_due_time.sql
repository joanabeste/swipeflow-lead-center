-- 124: Optionale Uhrzeit (Tageszeit) am Faelligkeitsdatum von Lead-ToDos.
--
-- Bisher konnten ToDos nur tagesgenau terminiert werden (due_date date). Diese
-- Migration ergaenzt eine NULLABLE Spalte due_time, damit z.B. „Anrufen morgen
-- 14:30" moeglich ist. NULL = ganztaegig / keine feste Uhrzeit.
--
-- Bewusst KEINE Migration von due_date -> timestamptz: alle bestehenden Datums-,
-- Bucket- und KPI-Logiken arbeiten unveraendert weiter auf due_date; die Uhrzeit
-- ist reine optionale Zusatzinfo. Innerhalb eines Tages wird nach due_time
-- sortiert (NULL ans Ende).
--
-- Idempotent (IF NOT EXISTS) -> Zero-Downtime, gefahrlos mehrfach ausfuehrbar.

alter table lead_todos add column if not exists due_time time;

-- Sortierung „offen, nach Tag dann Uhrzeit" — ersetzt den reinen due_date-Scan
-- fuer die Listen-Reihenfolge. Der alte lead_todos_open_due_idx bleibt bestehen.
create index if not exists lead_todos_open_due_dt_idx
  on lead_todos (due_date, due_time)
  where done_at is null;
