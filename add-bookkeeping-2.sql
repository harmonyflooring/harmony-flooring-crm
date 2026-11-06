-- Bookkeeping, part 2: change history for the pricing manual, and Draft / Final for weekly bills.
-- The "admins only" rules from add-bookkeeping.sql already cover these new columns.

ALTER TABLE public.billing_manual ADD COLUMN IF NOT EXISTS history JSONB NOT NULL DEFAULT '[]';
ALTER TABLE public.weekly_bills ADD COLUMN IF NOT EXISTS final_at TIMESTAMPTZ;
ALTER TABLE public.weekly_bills ADD COLUMN IF NOT EXISTS final_by TEXT;
