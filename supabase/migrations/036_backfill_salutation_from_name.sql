-- Alt-Daten-Backfill: Anrede aus dem name-Feld in die salutation-Spalte
-- überführen. Hintergrund: Vor dem BA-CSV-Fix wurden "Herr" / "Frau" mit
-- dem Namen zusammengeschrieben (z. B. name = "Herr Max Müller"). Das
-- vergiftete {{contact_first_name}} in E-Mail-Vorlagen und ließ die
-- Anrede fehlen.
--
-- Diese Migration:
--   1) findet Kontakte mit name-Präfix "Herr"/"Hr." / "Frau"/"Fr."
--   2) setzt salutation (nur falls noch NULL)
--   3) entfernt den Präfix aus name
--
-- Namens-basierte Heuristik für den Rest (Thomas → herr, Petra → frau)
-- läuft separat über den Button "Anrede aus Vornamen nachtragen" unter
-- Mein Konto → Wartung, weil das eine ~800er-Namensliste aus TS braucht,
-- die hier in SQL nicht sinnvoll gepflegt werden kann.

update lead_contacts
set
  salutation = 'herr',
  name = trim(regexp_replace(name, '^(Herr|Hr)\.?\s+', '', 'i'))
where salutation is null
  and name ~* '^(Herr|Hr)\.?\s+';

update lead_contacts
set
  salutation = 'frau',
  name = trim(regexp_replace(name, '^(Frau|Fr)\.?\s+', '', 'i'))
where salutation is null
  and name ~* '^(Frau|Fr)\.?\s+';
