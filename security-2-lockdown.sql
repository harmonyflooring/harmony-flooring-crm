-- Security step 2: lock the data. Run right after the new index.html goes live,
-- because the old app stops working as soon as this runs.

BEGIN;

-- The Admin profile is merged into Yisroel
UPDATE public.messages SET from_name = 'Yisroel' WHERE from_name = 'Admin';
UPDATE public.messages SET to_names = (
  SELECT array_agg(DISTINCT CASE WHEN n = 'Admin' THEN 'Yisroel' ELSE n END) FROM unnest(to_names) n
) WHERE 'Admin' = ANY(to_names);
UPDATE public.messages SET read_by = (
  SELECT array_agg(DISTINCT CASE WHEN n = 'Admin' THEN 'Yisroel' ELSE n END) FROM unnest(read_by) n
) WHERE 'Admin' = ANY(read_by);

DROP POLICY IF EXISTS "allow_all_customers" ON public.customers;
DROP POLICY IF EXISTS "allow_all_messages"  ON public.messages;
DROP POLICY IF EXISTS "allow all" ON public.salesmen;
DROP POLICY IF EXISTS "allow all" ON public.stock_products;

ALTER TABLE public.schedule_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles         ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team access" ON public.customers
  FOR ALL TO authenticated USING (public.is_team_member()) WITH CHECK (public.is_team_member());
CREATE POLICY "team access" ON public.messages
  FOR ALL TO authenticated USING (public.is_team_member()) WITH CHECK (public.is_team_member());
CREATE POLICY "team access" ON public.schedule_entries
  FOR ALL TO authenticated USING (public.is_team_member()) WITH CHECK (public.is_team_member());
CREATE POLICY "team access" ON public.stock_products
  FOR ALL TO authenticated USING (public.is_team_member()) WITH CHECK (public.is_team_member());

-- Names and colors stay public for the profile picker; only admins change them
CREATE POLICY "public read" ON public.salesmen
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admin insert" ON public.salesmen
  FOR INSERT TO authenticated WITH CHECK (public.is_team_admin());
CREATE POLICY "admin update" ON public.salesmen
  FOR UPDATE TO authenticated USING (public.is_team_admin()) WITH CHECK (public.is_team_admin());
CREATE POLICY "admin delete" ON public.salesmen
  FOR DELETE TO authenticated USING (public.is_team_admin());

REVOKE ALL ON public.customers, public.messages, public.schedule_entries, public.stock_products, public.profiles FROM anon;
REVOKE ALL ON public.salesmen FROM anon;
GRANT SELECT ON public.salesmen TO anon;
REVOKE ALL ON public.profiles FROM authenticated;

-- New tables start closed to the public
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;

COMMIT;
