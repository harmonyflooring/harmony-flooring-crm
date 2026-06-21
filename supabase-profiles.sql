-- Run this in your Supabase SQL Editor to enable passwords
-- Go to: https://supabase.com/dashboard → your project → SQL Editor

CREATE TABLE IF NOT EXISTS profiles (
  name         TEXT PRIMARY KEY,
  password_hash TEXT
);
