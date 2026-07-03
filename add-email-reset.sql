-- Run this in your Supabase SQL Editor
-- Go to: https://supabase.com/dashboard → your project → SQL Editor

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS reset_token TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS reset_token_expiry BIGINT;
