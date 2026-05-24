-- 065: profiles um Stundenlohn-Felder fuer das Provisions-/Auszahlungs-Modul erweitern.
-- Nicht-destruktiv, additive Felder.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS hourly_wage_cents integer
    CHECK (hourly_wage_cents IS NULL OR hourly_wage_cents >= 0);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS wage_currency text DEFAULT 'EUR'
    CHECK (wage_currency IS NULL OR char_length(wage_currency) = 3);
