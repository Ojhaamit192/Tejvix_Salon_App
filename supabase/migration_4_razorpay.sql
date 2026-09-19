-- MIGRATION 4: Run this AFTER migration_3. Adds payment tracking columns
-- to the existing 'tokens' table only — no new tables.
-- Supabase → SQL Editor → New query → paste all → Run.

alter table tokens add column if not exists payment_status text not null default 'not_required'; -- not_required | paid
alter table tokens add column if not exists razorpay_order_id text;
alter table tokens add column if not exists razorpay_payment_id text;
