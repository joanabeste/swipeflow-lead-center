-- 122: Telefon-Suche format-unabhängig machen.
--
-- Problem: leads.phone liegt gemischt vor — "0571 9724927", "+4954226221",
-- "0049 571 …", "(0571) …". Eine reine Teilstring-Suche (ILIKE %x%) findet je
-- nach getippter Schreibweise NICHT alle Treffer (z. B. "0571 …" vs. "+49571 …").
--
-- Lösung: generierte Spalte phone_norm = KANONISCHE Ziffernfolge (Ländercode +
-- national, OHNE "+", OHNE Trenner). Die App wendet dieselbe Kanonisierung auf die
-- Sucheingabe an (lib/leads/phone-search.ts → canonicalPhoneDigits). Dadurch matcht
-- jede Schreibweise derselben Nummer denselben Wert:
--
--   "0571 9724927"    -> "495719724927"
--   "+49 571 9724927" -> "495719724927"
--   "0049571 9724927" -> "495719724927"
--   "+4954226221"     -> "4954226221"
--
-- Regel (deckungsgleich mit canonicalPhoneDigits in JS): nur Ziffern; "00…" → ohne
-- "00"; "0…" → "49" + Rest; sonst unverändert. Für leere/zifferlose Eingaben liefert
-- SQL NULL und JS "" — beides „keine suchbare Nummer" (NULL matcht kein ILIKE; JS
-- überspringt via `if (canon)`), also für die Suche äquivalent.
--
-- Reiner Add-Column (idempotent), kein Index — die Suche läuft als OR mit weiteren
-- ILIKE-Spalten ohnehin als Seq-Scan (wie die Firmenname/Ort-Suche). Das mehrfache
-- regexp_replace ist bewusst inline (Generated Column kennt keine Variablen); bei
-- diesem Schreibvolumen vernachlässigbar.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS phone_norm text
  GENERATED ALWAYS AS (
    CASE
      WHEN regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') = '' THEN NULL
      WHEN regexp_replace(phone, '[^0-9]', '', 'g') LIKE '00%'
        THEN substr(regexp_replace(phone, '[^0-9]', '', 'g'), 3)
      WHEN regexp_replace(phone, '[^0-9]', '', 'g') LIKE '0%'
        THEN '49' || substr(regexp_replace(phone, '[^0-9]', '', 'g'), 2)
      ELSE regexp_replace(phone, '[^0-9]', '', 'g')
    END
  ) STORED;
