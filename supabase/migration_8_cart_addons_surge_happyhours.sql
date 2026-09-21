-- MIGRATION 8: Run this AFTER migration_7.
-- Adds: retail products table, multi-item cart support on tokens,
-- happy-hours/surge/mock-mode settings on salons, cancellation reasons.
-- All additive — existing single-service bookings keep working exactly
-- as before (cart_items is optional; when absent, old logic applies).

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid references salons(id) on delete cascade,
  name text not null,
  price numeric not null,
  created_at timestamptz default now()
);
alter table products enable row level security;

alter table tokens add column if not exists cart_items jsonb;         -- [{type:'service'|'product', id, name, price, duration_minutes}]
alter table tokens add column if not exists total_amount numeric;      -- services + products + surge - discount
alter table tokens add column if not exists surge_fee numeric default 0;
alter table tokens add column if not exists discount_amount numeric default 0;
alter table tokens add column if not exists channel_preference text default 'sms'; -- 'sms' | 'whatsapp'
alter table tokens add column if not exists cancellation_reason text;
alter table tokens add column if not exists is_walkin_guest boolean default false; -- true for phone-less quick-add walk-ins

alter table salons add column if not exists happy_hours_enabled boolean default false;
alter table salons add column if not exists happy_hours_discount_percent numeric default 20;
alter table salons add column if not exists sms_mode text not null default 'real'; -- 'real' | 'mock' (demo/pitch mode)

-- Seed a couple of demo retail products for the two demo salons.
insert into products (salon_id, name, price)
select s.id, v.name, v.price
from salons s
cross join (values ('Hair Gel', 120), ('Beard Oil', 250), ('Face Wash', 180)) as v(name, price)
where s.slug in ('tejvix', 'prince-salon')
  and not exists (select 1 from products p where p.salon_id = s.id and p.name = v.name);
