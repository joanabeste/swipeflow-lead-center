-- Anrede pro Kontakt — für personalisierte E-Mails ({{anrede}}-Variable).
-- Nur 'herr' / 'frau' — divers/unbekannt bleibt NULL und fällt im Template
-- auf "Sehr geehrte Damen und Herren" zurück.
--
-- Befüllt wird aus drei Quellen (in Reihenfolge der Qualität):
--   1) BA-CSV-Import (Spalte "Anrede")
--   2) KI-Enrichment (wenn aus Text ersichtlich)
--   3) Namens-basierte Heuristik (lib/contacts/salutation-from-name.ts)

alter table lead_contacts
  add column if not exists salutation text
    check (salutation in ('herr', 'frau'));

create index if not exists lead_contacts_salutation_idx
  on lead_contacts(salutation) where salutation is not null;
