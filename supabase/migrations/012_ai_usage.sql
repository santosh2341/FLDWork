-- Daily AI credit counter per company; ai_take_credit() is called by the ai-assist Edge Function. Already applied to the live project.
create table if not exists public.ai_usage (
  company_id uuid not null references public.companies(id) on delete cascade,
  day date not null default current_date,
  count integer not null default 0,
  primary key (company_id, day)
);
alter table public.ai_usage enable row level security;
create or replace function public.ai_take_credit(p_limit integer default 100) returns integer
language plpgsql security definer set search_path = '' as $$
declare cid uuid := public.current_company(); used integer;
begin
  if cid is null then raise exception 'Not signed in.'; end if;
  if not public.can_write() then raise exception 'Your role cannot use the AI assistant.'; end if;
  insert into public.ai_usage(company_id, day, count) values (cid, current_date, 1)
    on conflict (company_id, day) do update set count = public.ai_usage.count + 1
    returning count into used;
  if used > p_limit then
    update public.ai_usage set count = count - 1 where company_id = cid and day = current_date;
    raise exception 'Daily AI limit reached (% requests). It resets tomorrow.', p_limit;
  end if;
  return p_limit - used;
end $$;
revoke execute on function public.ai_take_credit(integer) from anon;
