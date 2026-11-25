-- Actual job costing: supplier bills, materials bought and subcontractors recorded against a job (amounts ex GST).
create table if not exists public.job_costs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.current_company() references public.companies(id) on delete cascade,
  job_id bigint not null references public.jobs(id) on delete cascade,
  cost_date date not null default current_date,
  kind text not null default 'material' check (kind in ('material', 'subcontract', 'other')),
  supplier text not null default '',
  description text not null default '',
  amount numeric not null check (amount >= 0),
  created_at timestamptz not null default now()
);
create index if not exists job_costs_job on public.job_costs(job_id);
alter table public.job_costs enable row level security;
create policy "job_costs read" on public.job_costs for select using (company_id = (select public.current_company()));
create policy "job_costs insert" on public.job_costs for insert with check (company_id = (select public.current_company()) and (select public.can_write()));
create policy "job_costs update" on public.job_costs for update using (company_id = (select public.current_company()) and (select public.can_write()));
create policy "job_costs delete" on public.job_costs for delete using (company_id = (select public.current_company()) and (select public.can_write()));

do $$
declare def text;
begin
  select pg_get_functiondef('public.load_all'::regproc) into def;
  if position('jobCosts' in def) = 0 then
    def := replace(def, '''recurring'', coalesce(', '''jobCosts'', coalesce((select jsonb_agg(jsonb_build_object(''id'', c.id, ''jobId'', c.job_id, ''date'', c.cost_date, ''kind'', c.kind, ''supplier'', c.supplier, ''description'', c.description, ''amount'', c.amount) order by c.cost_date desc, c.created_at desc) from public.job_costs c), ''[]''),
    ''recurring'', coalesce(');
    execute def;
  end if;
end $$;
