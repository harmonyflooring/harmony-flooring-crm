-- Bookkeeping: the pricing manual and the weekly installer bills.
-- Admins only. No one else, signed in or not, can read or change these.

CREATE TABLE IF NOT EXISTS public.billing_manual (
  id         TEXT PRIMARY KEY DEFAULT 'current',
  rates      JSONB NOT NULL DEFAULT '{}',
  customers  JSONB NOT NULL DEFAULT '[]',
  buildings  JSONB NOT NULL DEFAULT '{}',
  rules      JSONB NOT NULL DEFAULT '[]',
  notes      JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS public.weekly_bills (
  week_start DATE PRIMARY KEY,
  label      TEXT,
  jobs       JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT
);

ALTER TABLE public.billing_manual ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_bills   ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_manual, public.weekly_bills FROM anon;

DROP POLICY IF EXISTS "admins only" ON public.billing_manual;
DROP POLICY IF EXISTS "admins only" ON public.weekly_bills;
CREATE POLICY "admins only" ON public.billing_manual
  FOR ALL TO authenticated USING (public.is_team_admin()) WITH CHECK (public.is_team_admin());
CREATE POLICY "admins only" ON public.weekly_bills
  FOR ALL TO authenticated USING (public.is_team_admin()) WITH CHECK (public.is_team_admin());
