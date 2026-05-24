-- 062: Zeit-Modul — profiles um vertragsrelevante Felder erweitern.
-- Keine destruktive Operation. Bestehende Spalten unangetastet.

-- Rolle 'employee' fuer reine Zeiterfasser ohne CRM-Zugriff.
-- profiles.role ist in LC text mit CHECK-Constraint (kein Enum) — wir ersetzen den Check.
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'public.profiles'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%role%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'sales', 'viewer', 'employee'));

-- Tageszeitplan (Sa/So defaulten auf 0 — kein Soll am Wochenende).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS hours_mon numeric(4,2) DEFAULT 8 CHECK (hours_mon BETWEEN 0 AND 24),
  ADD COLUMN IF NOT EXISTS hours_tue numeric(4,2) DEFAULT 8 CHECK (hours_tue BETWEEN 0 AND 24),
  ADD COLUMN IF NOT EXISTS hours_wed numeric(4,2) DEFAULT 8 CHECK (hours_wed BETWEEN 0 AND 24),
  ADD COLUMN IF NOT EXISTS hours_thu numeric(4,2) DEFAULT 8 CHECK (hours_thu BETWEEN 0 AND 24),
  ADD COLUMN IF NOT EXISTS hours_fri numeric(4,2) DEFAULT 8 CHECK (hours_fri BETWEEN 0 AND 24),
  ADD COLUMN IF NOT EXISTS hours_sat numeric(4,2) DEFAULT 0 CHECK (hours_sat BETWEEN 0 AND 24),
  ADD COLUMN IF NOT EXISTS hours_sun numeric(4,2) DEFAULT 0 CHECK (hours_sun BETWEEN 0 AND 24);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS vacation_days_per_year numeric(5,2) DEFAULT 30
    CHECK (vacation_days_per_year BETWEEN 0 AND 365);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS break_mode text DEFAULT 'manual'
    CHECK (break_mode IN ('manual', 'auto_deduct'));

-- Helper, der von RLS-Policies in 063/064 verwendet wird.
CREATE OR REPLACE FUNCTION public.zeit_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;
