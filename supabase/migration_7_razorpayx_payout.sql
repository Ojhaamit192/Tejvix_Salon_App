-- MIGRATION 7: Run this AFTER migration_6.
-- Tracks whether the automatic RazorpayX payout to the salon succeeded,
-- for each Razorpay-paid appointment. No new tables — just 2 columns.
alter table tokens add column if not exists payout_status text not null default 'not_attempted';
-- payout_status values: not_attempted | success | failed | no_upi_on_file
alter table tokens add column if not exists payout_id text;
