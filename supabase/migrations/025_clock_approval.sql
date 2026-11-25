-- Timesheet approval for clocked hours: an office user approves a person's clocked hours for a week.
-- Approved entries are locked for technicians (they can still clock on/off and fix unapproved entries).
alter table public.clock_entries add column if not exists approved_at timestamptz;
alter table public.clock_entries add column if not exists approved_by text not null default '';

drop policy if exists "clock update" on public.clock_entries;
create policy "clock update" on public.clock_entries for update
  using (
    company_id = (select public.current_company())
    and ((select public.can_write()) or ((select public.current_role_name()) = 'technician' and approved_at is null))
  )
  with check (
    company_id = (select public.current_company())
    and ((select public.can_write()) or approved_at is null)
  );

-- load_all: clock entries get approvedAt and approvedBy
do $$
declare def text;
begin
  select pg_get_functiondef('public.load_all'::regproc) into def;
  if position('approvedAt' in def) = 0 then
    def := replace(def, '''start'', k.started_at, ''end'', k.ended_at)',
      '''start'', k.started_at, ''end'', k.ended_at, ''approvedAt'', k.approved_at, ''approvedBy'', k.approved_by)');
    execute def;
  end if;
end $$;
