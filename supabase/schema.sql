-- Run this in Supabase: Project → SQL Editor → New query → paste all → Run.

create extension if not exists "pgcrypto";

create table if not exists salons (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  address text,
  phone text,
  admin_pin text not null default '1234',
  created_at timestamptz default now()
);

create table if not exists tokens (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid references salons(id) on delete cascade,
  day date not null default current_date,
  seq int not null,
  name text not null,
  phone text not null,
  service text not null,
  status text not null default 'waiting', -- waiting | serving | done
  created_at timestamptz default now()
);

create index if not exists idx_tokens_salon_day on tokens (salon_id, day);

-- Row Level Security: locked down. Only the server (using the Supabase
-- SERVICE ROLE key, in Netlify env vars) can read/write — that key bypasses
-- RLS entirely. No anon/public policies are added, so the database is not
-- reachable directly from the browser. All access goes through the
-- Netlify functions in netlify/functions/.
alter table salons enable row level security;
alter table tokens enable row level security;

-- Demo seed data — two example salons so you can show the platform
-- working for more than one shop.
insert into salons (slug, name, address, phone, admin_pin) values
  ('tejvix', 'Tejvix Salon', 'Muzaffarpur, Bihar', '+91 90000 00001', '1234'),
  ('prince-salon', 'Prince Salon', 'Muzaffarpur, Bihar', '+91 90000 00002', '5678')
on conflict (slug) do nothing;
