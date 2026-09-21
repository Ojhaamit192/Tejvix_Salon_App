-- MIGRATION 5: Run this AFTER migration_4. Adds one column to 'tokens'
-- to store an optional UPI transaction reference the customer can enter
-- when self-confirming payment — gives staff something to cross-check
-- against their bank statement.
alter table tokens add column if not exists payment_ref text;
