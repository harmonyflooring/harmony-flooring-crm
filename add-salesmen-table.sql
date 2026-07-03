-- Run this in your Supabase SQL Editor
-- Go to: https://supabase.com/dashboard → your project → SQL Editor

CREATE TABLE IF NOT EXISTS salesmen (
  name       TEXT PRIMARY KEY,
  color      TEXT NOT NULL DEFAULT '#2c5f2e',
  sort_order INT DEFAULT 99
);

-- Pre-fill with your current team
INSERT INTO salesmen (name, color, sort_order) VALUES
  ('Yisroel', '#2c5f2e', 1),
  ('Shuey',   '#1565c0', 2),
  ('Eli',     '#6a1b9a', 3),
  ('Mendy',   '#c62828', 4)
ON CONFLICT (name) DO NOTHING;

-- Allow the app to read and write this table
ALTER TABLE salesmen ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow all" ON salesmen FOR ALL USING (true) WITH CHECK (true);
