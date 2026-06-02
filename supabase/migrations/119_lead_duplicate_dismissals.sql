-- 119: Verworfene Duplikat-Paare ("Kein Duplikat"-Entscheidung).
--
-- Hintergrund: Im CRM-Lead-Detail warnt ein Banner vor mutmaßlichen Duplikaten
-- (findLeadDuplicates). Bisher gab es nur „Zusammenführen". Jetzt soll man ein Paar
-- aktiv als „Kein Duplikat" bestätigen können — dann verschwindet die Warnung
-- dauerhaft (für beide Leads) und die Entscheidung steht in der Historie.
--
-- Diese Tabelle hält die bestätigten Nicht-Duplikat-Paare. Das Paar wird kanonisch
-- sortiert gespeichert (lead_id_a < lead_id_b), damit es richtungsunabhängig genau
-- EINMAL existiert. findLeadDuplicates schließt Kandidaten aus, deren Paar hier steht.

CREATE TABLE IF NOT EXISTS public.lead_duplicate_dismissals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id_a     uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  lead_id_b     uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  dismissed_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  dismissed_at  timestamptz NOT NULL DEFAULT now(),
  -- Kanonische Reihenfolge: für lowercase-UUIDs stimmt JS-".sort()" mit der
  -- Postgres-uuid-Ordnung überein (Bindestriche an gleicher Position), daher
  -- erfüllt die in der Action sortierte Einfügung diese Bedingung.
  CONSTRAINT lead_duplicate_dismissals_ordered CHECK (lead_id_a < lead_id_b),
  UNIQUE (lead_id_a, lead_id_b)
);

CREATE INDEX IF NOT EXISTS lead_duplicate_dismissals_a_idx ON public.lead_duplicate_dismissals(lead_id_a);
CREATE INDEX IF NOT EXISTS lead_duplicate_dismissals_b_idx ON public.lead_duplicate_dismissals(lead_id_b);

ALTER TABLE public.lead_duplicate_dismissals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ldd_read_all" ON public.lead_duplicate_dismissals;
CREATE POLICY "ldd_read_all" ON public.lead_duplicate_dismissals
  FOR SELECT TO authenticated USING (true);
