-- Progress invoicing: bill a job in stages (deposit, mid-job, completion) as a percentage of the quote.
alter table public.invoices add column if not exists claim_label text;
alter table public.invoices add column if not exists claim_pct numeric;

-- load_all: return the claim fields with each invoice
do $$
declare def text;
begin
  select pg_get_functiondef('public.load_all'::regproc) into def;
  if position('claimLabel' in def) = 0 then
    def := replace(def, '''retainagePct'', i.retainage_pct,', '''claimLabel'', i.claim_label, ''claimPct'', i.claim_pct, ''retainagePct'', i.retainage_pct,');
    execute def;
  end if;
end $$;

-- A full invoice only counts if it is not a progress claim
create or replace function public.create_invoice_from_job(p_job_id bigint) returns bigint
language plpgsql set search_path to '' as $function$
declare inv bigint; jb public.jobs; q public.quotes; terms int; cc record; sid uuid;
begin
  select id into inv from public.invoices where job_id = p_job_id and not voided and claim_pct is null limit 1;
  if found then return inv; end if;
  if exists (select 1 from public.invoices where job_id = p_job_id and not voided and claim_pct is not null) then
    raise exception 'This job is being billed in progress claims. Add the remaining claim instead.';
  end if;
  select * into jb from public.jobs where id = p_job_id;
  if not found then raise exception 'Job % not found', p_job_id; end if;
  select * into q from public.quotes where id = jb.quote_id;
  select payment_terms_days into terms from public.companies where id = jb.company_id;
  insert into public.invoices(job_id, customer_id, site_id, issued_at, due_at, tax_rate, discount)
  values (jb.id, jb.customer_id, jb.site_id, current_date, current_date + coalesce(terms, 30), q.tax_rate, q.discount)
  returning id into inv;
  for cc in select * from public.cost_centers where quote_id = q.id order by sort, name loop
    insert into public.invoice_sections(invoice_id, name, sort) values (inv, cc.name, cc.sort) returning id into sid;
    insert into public.invoice_items(section_id, kind, part_id, description, quantity, unit_cost, unit_sell, sort)
      select sid, kind, part_id, description, quantity, unit_cost, unit_sell, sort from public.line_items where cost_center_id = cc.id;
  end loop;
  update public.jobs set status = 'invoiced' where id = p_job_id;
  insert into public.invoice_log(invoice_id, message) values (inv, 'Invoice created from job ' || p_job_id);
  return inv;
end $function$;

-- One claim: p_pct percent of the quote's price (after discount, before GST). Claims on a job cannot pass 100%.
create or replace function public.create_progress_claim(p_job_id bigint, p_label text, p_pct numeric) returns bigint
language plpgsql set search_path to '' as $function$
declare inv bigint; jb public.jobs; q public.quotes; terms int; sid uuid; net numeric; claimed numeric; amt numeric;
begin
  if p_pct is null or p_pct <= 0 or p_pct > 100 then raise exception 'Claim percentage must be between 1 and 100.'; end if;
  select * into jb from public.jobs where id = p_job_id;
  if not found then raise exception 'Job % not found', p_job_id; end if;
  if exists (select 1 from public.invoices where job_id = p_job_id and not voided and claim_pct is null) then
    raise exception 'This job already has a full invoice.';
  end if;
  select * into q from public.quotes where id = jb.quote_id;
  select coalesce(sum(claim_pct), 0) into claimed from public.invoices where job_id = p_job_id and not voided and claim_pct is not null;
  if claimed + p_pct > 100.0001 then raise exception 'Only % percent is left to claim on this job.', round(100 - claimed, 2); end if;
  select coalesce(sum(li.quantity * li.unit_sell), 0) - q.discount into net
    from public.line_items li join public.cost_centers cc on cc.id = li.cost_center_id where cc.quote_id = q.id;
  amt := round(net * p_pct / 100, 2);
  select payment_terms_days into terms from public.companies where id = jb.company_id;
  insert into public.invoices(job_id, customer_id, site_id, issued_at, due_at, tax_rate, discount, claim_label, claim_pct)
  values (jb.id, jb.customer_id, jb.site_id, current_date, current_date + coalesce(terms, 30), q.tax_rate, 0, coalesce(nullif(trim(p_label), ''), 'Progress claim'), p_pct)
  returning id into inv;
  insert into public.invoice_sections(invoice_id, name, sort) values (inv, 'Progress claim', 0) returning id into sid;
  insert into public.invoice_items(section_id, kind, description, quantity, unit_cost, unit_sell, sort)
  values (sid, 'part', coalesce(nullif(trim(p_label), ''), 'Progress claim') || ' – ' || p_pct || '% of quote ' || q.id, 1, 0, amt, 0);
  if claimed + p_pct >= 99.9999 then update public.jobs set status = 'invoiced' where id = p_job_id; end if;
  insert into public.invoice_log(invoice_id, message) values (inv, 'Progress claim ' || p_pct || '% created for job ' || p_job_id);
  return inv;
end $function$;

revoke execute on function public.create_progress_claim(bigint, text, numeric) from public, anon;
grant execute on function public.create_progress_claim(bigint, text, numeric) to authenticated;
