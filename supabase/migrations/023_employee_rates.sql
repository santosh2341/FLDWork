-- Per-employee hourly cost: what an hour of this person costs the business (wages + on-costs), ex GST.
-- Job costing uses it for actual labour (clocked hours x the person's rate) instead of the quote's average.
-- Kept out of `employees` so technicians and read-only users never see colleagues' pay:
-- office roles (can_write) can read it, only admin and accounts can set it.
create table if not exists public.employee_rates (
  employee_id uuid primary key references public.employees(id) on delete cascade,
  company_id uuid not null default public.current_company() references public.companies(id) on delete cascade,
  cost_rate numeric not null default 0 check (cost_rate >= 0),
  updated_at timestamptz not null default now()
);
alter table public.employee_rates enable row level security;

create policy "employee_rates read" on public.employee_rates for select
  using (company_id = (select public.current_company()) and (select public.can_write()));
create policy "employee_rates insert" on public.employee_rates for insert
  with check (
    company_id = (select public.current_company())
    and (select public.current_role_name()) in ('admin', 'accounts')
    and exists (select 1 from public.employees e where e.id = employee_id and e.company_id = (select public.current_company()))
  );
create policy "employee_rates update" on public.employee_rates for update
  using (company_id = (select public.current_company()) and (select public.current_role_name()) in ('admin', 'accounts'))
  with check (company_id = (select public.current_company()));
create policy "employee_rates delete" on public.employee_rates for delete
  using (company_id = (select public.current_company()) and (select public.current_role_name()) in ('admin', 'accounts'));

-- load_all: each employee gets costRate (null when not set, and always null for roles that cannot read rates)
do $$
declare def text;
begin
  select pg_get_functiondef('public.load_all'::regproc) into def;
  if position('costRate' in def) = 0 then
    def := replace(def, 'jsonb_build_object(''id'', e.id, ''name'', e.name)',
      'jsonb_build_object(''id'', e.id, ''name'', e.name, ''costRate'', (select r.cost_rate from public.employee_rates r where r.employee_id = e.id))');
    execute def;
  end if;
end $$;
