-- OUTDATED: this was the first sketch (milestone 1 tables only).
-- The live database in the Supabase project has the full schema (migrations 001_core to 007_app_rpcs),
-- including row level security, triggers and the load_all / save_* functions the app calls.
-- Do not run this file against that project.

-- Fieldwork: core schema (milestone 1). Run in the Supabase SQL editor.
-- Multi-tenant: every row carries company_id; RLS limits access to the user's company.

create extension if not exists "pgcrypto";

create type user_role as enum ('admin','accounts','sales','dispatcher','technician','readonly');
create type quote_status as enum ('to_be_completed','sent','approved','declined');
create type line_kind as enum ('part','labour');

create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  currency text not null default 'USD',
  tax_rate numeric(5,2) not null default 10,
  created_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid not null references companies(id),
  full_name text,
  role user_role not null default 'readonly'
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  name text not null,
  contact_name text,
  phone text,
  email text,
  address text,
  on_hold boolean not null default false,
  created_at timestamptz not null default now()
);

create table sites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  customer_id uuid not null references customers(id) on delete cascade,
  name text not null,
  address text,
  lat double precision,
  lng double precision
);

create table catalog_parts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  part_no text not null,
  description text not null,
  vendor text,
  category text,
  cost numeric(12,2) not null default 0,
  markup_pct numeric(6,2) not null default 0,
  stock integer not null default 0,
  unique (company_id, part_no)
);

create table quotes (
  id bigint generated always as identity primary key,
  company_id uuid not null references companies(id),
  customer_id uuid not null references customers(id),
  site_id uuid references sites(id),
  name text not null,
  status quote_status not null default 'to_be_completed',
  description text,
  notes text,
  discount numeric(12,2) not null default 0,
  overheads numeric(12,2) not null default 0,
  prices_locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table cost_centers (
  id bigint generated always as identity primary key,
  company_id uuid not null references companies(id),
  quote_id bigint not null references quotes(id) on delete cascade,
  name text not null,
  sort integer not null default 0
);

create table line_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  cost_center_id bigint not null references cost_centers(id) on delete cascade,
  kind line_kind not null,
  part_id uuid references catalog_parts(id),
  description text not null,
  quantity numeric(12,2) not null default 1,   -- hours for labour
  unit_cost numeric(12,2) not null default 0,
  unit_sell numeric(12,2) not null default 0,
  sort integer not null default 0
);

create table timeline_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  quote_id bigint not null references quotes(id) on delete cascade,
  user_id uuid references auth.users(id),
  type text not null default 'System',
  message text not null,
  created_at timestamptz not null default now()
);

-- Row level security -------------------------------------------------------
create or replace function current_company() returns uuid
language sql stable security definer set search_path = public as
$$ select company_id from profiles where id = auth.uid() $$;

create or replace function current_role_name() returns user_role
language sql stable security definer set search_path = public as
$$ select role from profiles where id = auth.uid() $$;

do $$
declare t text;
begin
  foreach t in array array['customers','sites','catalog_parts','quotes','cost_centers','line_items','timeline_events']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "%1$s read" on %1$I for select using (company_id = current_company())', t);
    execute format('create policy "%1$s write" on %1$I for all
      using (company_id = current_company() and current_role_name() in (''admin'',''accounts'',''sales'',''dispatcher''))
      with check (company_id = current_company())', t);
  end loop;
end $$;

alter table companies enable row level security;
create policy "company read" on companies for select using (id = current_company());
alter table profiles enable row level security;
create policy "profile read" on profiles for select using (company_id = current_company());
