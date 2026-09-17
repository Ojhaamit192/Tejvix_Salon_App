-- MIGRATION 3: Run this AFTER migration_2. Adds 4 optional columns to the
-- existing 'salons' table only — no new tables, no schema restructuring.
-- Supabase → SQL Editor → New query → paste all → Run.

alter table salons add column if not exists brand_color text;       -- e.g. '#FF6A00' — leave blank to use the default orange theme
alter table salons add column if not exists photos text[];           -- array of image URLs, e.g. '{"https://.../pic1.jpg","https://.../pic2.jpg"}'
alter table salons add column if not exists upi_id text;             -- e.g. 'salonname@upi' — enables a dynamic payment QR with the amount pre-filled
alter table salons add column if not exists payment_qr_url text;     -- OR paste a link to a photo of the shop's own printed QR code instead

-- Example: set a salon's own UPI ID so a payment QR appears after booking
-- update salons set upi_id = 'princesalon@okhdfcbank' where slug = 'prince-salon';

-- Example: add a couple of photos to a salon's gallery
-- update salons set photos = array['https://example.com/salon1.jpg','https://example.com/salon2.jpg'] where slug = 'tejvix';

-- Example: give a salon its own brand color instead of the default orange
-- update salons set brand_color = '#2E86DE' where slug = 'prince-salon';
