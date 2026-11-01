-- Lets the calendar update live for everyone when an entry changes.
ALTER PUBLICATION supabase_realtime ADD TABLE public.schedule_entries;
