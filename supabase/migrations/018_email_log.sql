-- Record of emails sent from the app (also used for the daily send limit). Applied live.
create table if not exists public.email_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.current_company() references public.companies(id) on delete cascade,
  kind text not null check (kind in ('quote','invoice')),
  doc_id bigint not null,
  to_email text not null,
  subject text not null default '',
  sent_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists email_log_doc on public.email_log(kind, doc_id);
alter table public.email_log enable row level security;
create policy "email_log read" on public.email_log for select using (company_id = (select public.current_company()));
create policy "email_log insert" on public.email_log for insert with check (company_id = (select public.current_company()) and (select public.can_write()));
