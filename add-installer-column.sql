-- Run this in Supabase SQL Editor to add the installer column
-- to the schedule_entries table.

alter table public.schedule_entries
  add column if not exists installer text default '';
