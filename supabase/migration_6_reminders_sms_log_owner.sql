-- MIGRATION 6: Run this AFTER migration_5.
-- Adds: a reminder-sent flag (for the 30-min-before SMS), and an sms_logs
-- table (so total SMS sent can be tracked for the owner dashboard).
-- Supabase → SQL Editor → New query → paste all → Run.

alter table tokens add column if not exists reminder_sent boolean not null default false;

create table if not exists sms_logs (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid references salons(id) on delete set null,
  phone text,
  message text,
  status text not null default 'sent', -- sent | dev_mode | failed
  created_at timestamptz default now()
);
alter table sms_logs enable row level security;
-- No public policies — only the service_role key (used server-side) can read/write.
