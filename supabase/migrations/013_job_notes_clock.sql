-- Job notes (written from the phone) and clock on/off entries per job.
create table if not exists public.job_notes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.current_company() references public.companies(id) on delete cascade,
  job_id bigint not null references public.jobs(id) on delete cascade,
  author text not null default '',
  text text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.clock_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.current_company() references public.companies(id) on delete cascade,
  job_id bigint not null references public.jobs(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
create index if not exists job_notes_job on public.job_notes(job_id);
create index if not exists clock_entries_job on public.clock_entries(job_id);
alter table public.job_notes enable row level security;
alter table public.clock_entries enable row level security;

create policy "job_notes read" on public.job_notes for select using (company_id = (select public.current_company()));
create policy "job_notes insert" on public.job_notes for insert with check (company_id = (select public.current_company()) and ((select public.can_write()) or (select public.current_role_name()) = 'technician'));
create policy "job_notes delete" on public.job_notes for delete using (company_id = (select public.current_company()) and (select public.can_write()));
create policy "clock read" on public.clock_entries for select using (company_id = (select public.current_company()));
create policy "clock insert" on public.clock_entries for insert with check (company_id = (select public.current_company()) and ((select public.can_write()) or (select public.current_role_name()) = 'technician'));
create policy "clock update" on public.clock_entries for update using (company_id = (select public.current_company()) and ((select public.can_write()) or (select public.current_role_name()) = 'technician')) with check (company_id = (select public.current_company()));
create policy "clock delete" on public.clock_entries for delete using (company_id = (select public.current_company()) and (select public.can_write()));
