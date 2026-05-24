-- 075: Sektion-Berechtigungen pro User. Admins haben immer Zugriff (Override im Code).
-- Defaults setzen sich nach bestehender role: admin/sales/viewer → vertrieb+fulfillment, employee → zeit.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS can_vertrieb boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_fulfillment boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_zeit boolean NOT NULL DEFAULT true;

-- Defaults: Mitarbeiter (role='employee') nur Zeit. Bestehende Admins/Sales bleiben auf alles.
UPDATE public.profiles
  SET can_vertrieb = false, can_fulfillment = false
  WHERE role = 'employee'
    AND can_vertrieb = true AND can_fulfillment = true;
