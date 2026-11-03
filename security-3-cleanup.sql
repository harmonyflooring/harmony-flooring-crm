-- Security step 3: run only after the team has logged in fine on the new system.
-- This can't be undone without the backup: the old passwords are kept until now so we can roll back.

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS password_hash,
  DROP COLUMN IF EXISTS reset_token,
  DROP COLUMN IF EXISTS reset_token_expiry;
