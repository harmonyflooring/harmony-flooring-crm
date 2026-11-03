-- Security step 1: team logins. Adds new objects only, so the current app keeps working.

CREATE TABLE IF NOT EXISTS public.team_members (
  user_id  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name     TEXT NOT NULL UNIQUE REFERENCES public.salesmen(name) ON UPDATE CASCADE ON DELETE CASCADE,
  is_admin BOOLEAN NOT NULL DEFAULT false
);

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.team_members FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.team_members FROM authenticated;

DROP POLICY IF EXISTS "read own membership" ON public.team_members;
CREATE POLICY "read own membership" ON public.team_members
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

-- Used by the table policies
CREATE OR REPLACE FUNCTION public.is_team_member() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.team_members WHERE user_id = (SELECT auth.uid()));
$$;

CREATE OR REPLACE FUNCTION public.is_team_admin() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.team_members WHERE user_id = (SELECT auth.uid()) AND is_admin);
$$;

-- The profile picker signs in by name, so the login screen needs this before anyone is signed in
CREATE OR REPLACE FUNCTION public.login_email(p_name TEXT) RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT u.email::text FROM public.team_members t
  JOIN auth.users u ON u.id = t.user_id
  WHERE t.name = p_name;
$$;

-- Settings: admins see who has a login. Returns nothing for anyone else.
CREATE OR REPLACE FUNCTION public.team_accounts() RETURNS TABLE (name TEXT, email TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT s.name, u.email::text FROM public.salesmen s
  LEFT JOIN public.team_members t ON t.name = s.name
  LEFT JOIN auth.users u ON u.id = t.user_id
  WHERE public.is_team_admin()
  ORDER BY s.sort_order;
$$;

REVOKE ALL ON FUNCTION public.is_team_member(), public.is_team_admin(), public.login_email(TEXT), public.team_accounts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_team_member(), public.is_team_admin(), public.team_accounts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.login_email(TEXT) TO anon, authenticated;
