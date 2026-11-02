-- Product library: each product is Stock or Special Order.
ALTER TABLE public.stock_products ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'stock';
