-- ============================================================
-- Harmony Flooring CRM — Supabase Database Setup
-- Run this in your Supabase project: SQL Editor → New Query
-- ============================================================

-- ── CUSTOMERS TABLE ──────────────────────────────────────────
create table public.customers (
  id               text primary key,
  name             text not null,
  phone            text,
  email            text,
  company          text,
  address          text,
  lockbox          text,
  lockbox_code     text,
  contractor       text,
  contractor_phone text,
  salesman         text,
  step             integer default 0,
  step_data        jsonb default '{}',
  created_at       text,
  last_step_change text
);

-- ── MESSAGES TABLE ────────────────────────────────────────────
create table public.messages (
  id          text primary key,
  from_name   text,
  to_names    text[],
  subject     text,
  body        text,
  timestamp   bigint,
  read_by     text[],
  is_task     boolean default false,
  task_data   jsonb
);

-- ── ROW LEVEL SECURITY ────────────────────────────────────────
-- Enables RLS but allows all operations (no login required).
-- You can tighten this later with Supabase Auth if needed.
alter table public.customers enable row level security;
alter table public.messages  enable row level security;

create policy "allow_all_customers" on public.customers
  for all using (true) with check (true);

create policy "allow_all_messages" on public.messages
  for all using (true) with check (true);

-- ── REAL-TIME ─────────────────────────────────────────────────
-- Enable real-time so all salesmen see live updates.
alter publication supabase_realtime add table public.customers;
alter publication supabase_realtime add table public.messages;
