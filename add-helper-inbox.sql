-- The email helper's inbox: job notes and estimates it found in sales@ email, waiting for an admin to add or ignore.
-- Only admins can read or change it. The helper runs on the office computer; its script (not the helper) adds the rows.

CREATE TABLE IF NOT EXISTS public.helper_inbox (
  id          BIGSERIAL PRIMARY KEY,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_id   TEXT NOT NULL UNIQUE,
  kind        TEXT NOT NULL CHECK (kind IN ('notes', 'estimate')),
  week_start  DATE,
  address     TEXT,
  data        JSONB NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'added', 'ignored')),
  handled_by  TEXT,
  handled_at  TIMESTAMPTZ
);

ALTER TABLE public.helper_inbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.helper_inbox FROM anon;
DROP POLICY IF EXISTS "admins only" ON public.helper_inbox;
CREATE POLICY "admins only" ON public.helper_inbox
  FOR ALL TO authenticated USING (public.is_team_admin()) WITH CHECK (public.is_team_admin());

-- "Check Email Now" button: each click leaves a request; the office computer picks it up at its next check
-- (8 AM or 2 PM, Monday to Thursday).
-- The weekly run is written here too, so the page can show when email was last checked.
CREATE TABLE IF NOT EXISTS public.helper_requests (
  id           BIGSERIAL PRIMARY KEY,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  requested_by TEXT,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'done', 'failed')),
  started_at   TIMESTAMPTZ,
  finished_at  TIMESTAMPTZ,
  message      TEXT
);
ALTER TABLE public.helper_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.helper_requests FROM anon;
DROP POLICY IF EXISTS "admins only" ON public.helper_requests;
CREATE POLICY "admins only" ON public.helper_requests
  FOR ALL TO authenticated USING (public.is_team_admin()) WITH CHECK (public.is_team_admin());
