-- 078: customer_contacts → first_name + last_name + salutation
-- Splittet bestehende name-Werte am ersten Leerzeichen.
-- name wird zur Generated Column für Lese-Kompatibilität.

ALTER TABLE customer_contacts
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS salutation text NOT NULL DEFAULT 'sie'
    CHECK (salutation IN ('du', 'sie'));

UPDATE customer_contacts
SET
  first_name = split_part(trim(name), ' ', 1),
  last_name  = NULLIF(regexp_replace(trim(name), '^\S+\s*', ''), '')
WHERE first_name IS NULL;

ALTER TABLE customer_contacts DROP COLUMN name;

ALTER TABLE customer_contacts
  ADD COLUMN name text GENERATED ALWAYS AS (
    trim(coalesce(first_name, '') || ' ' || coalesce(last_name, ''))
  ) STORED;
