-- Saved stock products: picking one fills in manufacturer, style and color,
-- and it needs no order. Stock is added or removed in Settings.

CREATE TABLE IF NOT EXISTS stock_products (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  type         TEXT NOT NULL,
  manufacturer TEXT NOT NULL,
  style        TEXT NOT NULL,
  color        TEXT NOT NULL
);

INSERT INTO stock_products (id, name, type, manufacturer, style, color) VALUES
  ('carpet-t2', 'Carpet T2', 'Carpet', 'Shaw', 'Take Away S', 'T2')
ON CONFLICT (id) DO NOTHING;

-- Allow the app to read and write this table
ALTER TABLE stock_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow all" ON stock_products FOR ALL USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE stock_products;
