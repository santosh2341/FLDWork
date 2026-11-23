-- Equipment register (assets) with service history. Applied live; load_all() also returns 'assets' (each with its 'services').
create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.current_company() references public.companies(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  site_id uuid references public.sites(id) on delete set null,
  name text not null, category text not null default '', make text not null default '', model text not null default '', serial text not null default '',
  location text not null default '', install_date date, warranty_until date,
  interval_months integer check (interval_months is null or interval_months > 0),
  last_serviced date, next_due date, notes text not null default '', active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.asset_services (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.current_company() references public.companies(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  job_id bigint references public.jobs(id) on delete set null,
  date date not null default current_date, notes text not null default '', by_name text not null default '',
  created_at timestamptz not null default now()
);
alter table public.assets enable row level security;
alter table public.asset_services enable row level security;
-- Policies: read for the company; assets insert/update/delete for can_write(); asset_services read/delete (writes go through log_asset_service()).
-- log_asset_service(p_asset, p_date, p_notes, p_job, p_by): security definer; admins/office roles and technicians; sets last_serviced and next_due (= last + interval_months).
