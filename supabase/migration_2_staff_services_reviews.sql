-- MIGRATION 2: Run this AFTER schema.sql (it only adds to what's already there —
-- your existing salons/tokens data is untouched).
-- Supabase → SQL Editor → New query → paste all → Run.

-- Services each salon offers, with a duration used for wait-time estimates.
create table if not exists services (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid references salons(id) on delete cascade,
  name text not null,
  price numeric,
  duration_minutes int not null default 20,
  created_at timestamptz default now()
);

-- Barbers/staff at each salon — each gets their own parallel queue.
create table if not exists staff (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid references salons(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz default now()
);

-- Post-visit ratings.
create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid references salons(id) on delete cascade,
  token_id uuid references tokens(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz default now()
);

-- Extend tokens: which staff member, which service (by id now, not just free
-- text), whether it's a walk-in or a pre-booked appointment, and timestamps
-- used for wait-time and no-show logic.
alter table tokens add column if not exists staff_id uuid references staff(id);
alter table tokens add column if not exists service_id uuid references services(id);
alter table tokens add column if not exists booking_type text not null default 'walkin'; -- walkin | appointment
alter table tokens add column if not exists scheduled_at timestamptz;
alter table tokens add column if not exists called_at timestamptz;
-- status now also supports: 'scheduled' (booked for later, not yet checked in)
-- and 'no_show' (called but never arrived), in addition to the original
-- waiting | serving | done.

create index if not exists idx_tokens_staff_day on tokens (staff_id, day);

alter table services enable row level security;
alter table staff enable row level security;
alter table reviews enable row level security;
-- (No public policies added, same reasoning as schema.sql — only the
-- service_role key, used inside Netlify functions, can read/write these.)

-- Seed services + 2 staff members for each of the demo salons.
insert into services (salon_id, name, price, duration_minutes)
select s.id, v.name, v.price, v.duration
from salons s
cross join (values
  ('Hair Cut', 150, 20),
  ('Hair Cut + Beard Styling', 250, 30),
  ('Hair Spa', 499, 45),
  ('Facial (Basic)', 599, 40),
  ('Hair Colour', 899, 60),
  ('Bridal / Party Makeup', 2999, 90)
) as v(name, price, duration)
where s.slug in ('tejvix', 'prince-salon')
  and not exists (
    select 1 from services sv where sv.salon_id = s.id and sv.name = v.name
  );

insert into staff (salon_id, name)
select s.id, v.name
from salons s
cross join (values ('Barber 1'), ('Barber 2')) as v(name)
where s.slug in ('tejvix', 'prince-salon')
  and not exists (
    select 1 from staff st where st.salon_id = s.id and st.name = v.name
  );
