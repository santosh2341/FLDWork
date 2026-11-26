-- Background jobs: recurring job schedules now run by themselves every morning, instead of waiting for someone to press
-- "Run due now" (that button still works). Uses Supabase's built-in scheduler (pg_cron).
-- Each run creates a pending job for every active schedule that is due (catching up missed periods, at most 12 per
-- schedule per run), moves the schedule's next date on, and writes one line per company to automation_log so the
-- Recurring page can show "last automatic run".
create extension if not exists pg_cron;

create table if not exists public.automation_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  kind text not null,
  ran_at timestamptz not null default now(),
  created_count integer not null default 0,
  detail text not null default ''
);
create index if not exists automation_log_company on public.automation_log(company_id, ran_at desc);
alter table public.automation_log enable row level security;
-- read-only for the company; rows are written only by the scheduled function below
create policy "automation_log read" on public.automation_log for select using (company_id = (select public.current_company()));

create or replace function public.run_due_recurring_all()
returns integer language plpgsql security definer set search_path to '' as $$
declare
  r record; q public.quotes; n int := 0; made int; per jsonb := '{}'::jsonb;
  -- "today" in eastern Australia, so a schedule due today runs this morning
  d_today date := (now() at time zone 'Australia/Sydney')::date;
  nxt date; last_made date;
begin
  for r in select * from public.recurring_jobs where active and next_due <= d_today order by company_id, next_due loop
    select * into q from public.quotes where id = r.quote_id and company_id = r.company_id;
    if not found then continue; end if;
    made := 0; nxt := r.next_due; last_made := r.last_created;
    while nxt <= d_today and made < 12 loop
      insert into public.jobs(company_id, quote_id, customer_id, site_id, name)
        values (r.company_id, q.id, q.customer_id, q.site_id, r.name || ' (' || nxt || ')');
      last_made := nxt;
      nxt := public.advance_date(nxt, r.frequency);
      made := made + 1;
    end loop;
    update public.recurring_jobs set last_created = last_made, next_due = nxt where id = r.id;
    n := n + made;
    per := jsonb_set(per, array[r.company_id::text], to_jsonb(coalesce((per ->> r.company_id::text)::int, 0) + made));
  end loop;
  -- one log line per company that has active schedules, even when nothing was due (so "last run" stays fresh)
  insert into public.automation_log(company_id, kind, created_count)
    select distinct j.company_id, 'recurring', coalesce((per ->> j.company_id::text)::int, 0)
    from public.recurring_jobs j where j.active;
  delete from public.automation_log where ran_at < now() - interval '90 days';
  return n;
end $$;
revoke execute on function public.run_due_recurring_all() from public, anon, authenticated;

-- Every day at 19:00 UTC = 6am in Sydney/Melbourne during daylight saving, 5am otherwise.
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'fieldwork-recurring-daily';
  perform cron.schedule('fieldwork-recurring-daily', '0 19 * * *', 'select public.run_due_recurring_all()');
end $$;

-- load_all: the company's last 10 automatic runs
do $$
declare def text;
begin
  select pg_get_functiondef('public.load_all'::regproc) into def;
  if position('automationLog' in def) = 0 then
    def := replace(def, '''recurring'', coalesce(', '''automationLog'', coalesce((select jsonb_agg(jsonb_build_object(''kind'', a.kind, ''ranAt'', a.ran_at, ''createdCount'', a.created_count) order by a.ran_at desc) from (select * from public.automation_log order by ran_at desc limit 10) a), ''[]''),
    ''recurring'', coalesce(');
    execute def;
  end if;
end $$;
