-- Customer portal: a private, read-only link per customer (/p/<token>) showing their invoices (with balances),
-- their quotes and a statement, plus the bank details to pay by. No sign-in. Selling prices only: never costs,
-- markups or private notes. Same token rules as quote links (64 random hex characters); links last 180 days and can
-- be withdrawn. Quotes that have an active "accept online" link carry its token so the portal can open it.
create table if not exists public.customer_links (
  token text primary key default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  company_id uuid not null default public.current_company() references public.companies(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by text not null default '',
  expires_at timestamptz not null default now() + interval '180 days',
  revoked_at timestamptz,
  view_count integer not null default 0,
  last_viewed_at timestamptz
);
create index if not exists customer_links_customer on public.customer_links(customer_id);
alter table public.customer_links enable row level security;
create policy "customer_links read" on public.customer_links for select
  using (company_id = (select public.current_company()) and (select public.can_write()));
create policy "customer_links insert" on public.customer_links for insert
  with check (company_id = (select public.current_company()) and (select public.can_write())
    and exists (select 1 from public.customers c where c.id = customer_id and c.company_id = (select public.current_company())));
create policy "customer_links update" on public.customer_links for update
  using (company_id = (select public.current_company()) and (select public.can_write()))
  with check (company_id = (select public.current_company()));

-- Customer (no sign-in): everything the portal shows.
create or replace function public.customer_portal(p_token text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare l public.customer_links; co public.companies; cu public.customers;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return jsonb_build_object('state', 'not_found'); end if;
  select * into l from public.customer_links where token = p_token;
  if not found then return jsonb_build_object('state', 'not_found'); end if;
  if l.revoked_at is not null then return jsonb_build_object('state', 'revoked'); end if;
  if l.expires_at < now() then return jsonb_build_object('state', 'expired'); end if;
  select * into cu from public.customers where id = l.customer_id and company_id = l.company_id;
  if not found then return jsonb_build_object('state', 'not_found'); end if;
  update public.customer_links set view_count = view_count + 1, last_viewed_at = now() where token = p_token;
  select * into co from public.companies where id = l.company_id;
  return jsonb_build_object(
    'state', 'ok',
    'company', jsonb_build_object(
      'name', coalesce(nullif(co.profile ->> 'tradingName', ''), co.name),
      'abn', coalesce(co.profile ->> 'abn', ''), 'licence', coalesce(co.profile ->> 'licence', ''),
      'phone', coalesce(co.profile ->> 'phone', ''), 'email', coalesce(co.profile ->> 'email', ''),
      'website', coalesce(co.profile ->> 'website', ''), 'address', coalesce(co.profile ->> 'address', ''),
      'bankName', coalesce(co.profile ->> 'bankName', ''), 'accountName', coalesce(co.profile ->> 'accountName', ''),
      'bsb', coalesce(co.profile ->> 'bsb', ''), 'accountNumber', coalesce(co.profile ->> 'accountNumber', ''),
      'invoiceFooter', coalesce(co.invoice_footer, '')),
    'customer', jsonb_build_object('name', cu.name, 'contactName', coalesce(cu.contact_name, ''), 'address', coalesce(cu.address, '')),
    'expiresAt', l.expires_at,
    'invoices', coalesce((select jsonb_agg(jsonb_build_object(
        'id', i.id, 'issuedAt', i.issued_at, 'dueAt', i.due_at, 'taxRate', i.tax_rate, 'discount', i.discount,
        'claimLabel', i.claim_label, 'claimPct', i.claim_pct,
        'job', coalesce((select j.name from public.jobs j where j.id = i.job_id), ''),
        'site', coalesce((select jsonb_build_object('name', s.name, 'address', s.address) from public.sites s where s.id = i.site_id), '{}'::jsonb),
        'sections', coalesce((select jsonb_agg(jsonb_build_object('name', sc.name, 'items', coalesce((
            select jsonb_agg(jsonb_build_object('description', it.description, 'quantity', it.quantity, 'unitSell', it.unit_sell, 'kind', it.kind) order by it.sort)
            from public.invoice_items it where it.section_id = sc.id), '[]')) order by sc.sort)
          from public.invoice_sections sc where sc.invoice_id = i.id), '[]'),
        'payments', coalesce((select jsonb_agg(jsonb_build_object('amount', p.amount, 'date', p.date) order by p.date) from public.payments p where p.invoice_id = i.id), '[]'),
        'credits', coalesce((select jsonb_agg(jsonb_build_object('amount', c.amount, 'date', c.date) order by c.date) from public.credits c where c.invoice_id = i.id), '[]')
      ) order by i.issued_at desc, i.id desc)
      from public.invoices i where i.customer_id = cu.id and i.company_id = l.company_id and i.stage <> 'draft' and not i.voided), '[]'),
    'quotes', coalesce((select jsonb_agg(jsonb_build_object(
        'id', q.id, 'name', q.name, 'status', q.status, 'description', coalesce(q.description, ''), 'date', q.created_at,
        'discount', q.discount, 'taxRate', q.tax_rate,
        'site', coalesce((select jsonb_build_object('name', s.name, 'address', s.address) from public.sites s where s.id = q.site_id), '{}'::jsonb),
        'acceptToken', (select k.token from public.quote_links k where k.quote_id = q.id and k.revoked_at is null and k.decision is null and k.expires_at > now() order by k.created_at desc limit 1),
        'sections', coalesce((select jsonb_agg(jsonb_build_object('name', cc.name, 'items', coalesce((
            select jsonb_agg(jsonb_build_object('description', li.description, 'quantity', li.quantity, 'unitSell', li.unit_sell, 'kind', li.kind) order by li.sort)
            from public.line_items li where li.cost_center_id = cc.id), '[]')) order by cc.sort)
          from public.cost_centers cc where cc.quote_id = q.id), '[]')
      ) order by q.created_at desc, q.id desc)
      from public.quotes q where q.customer_id = cu.id and q.company_id = l.company_id and q.status <> 'to_be_completed'), '[]'));
end $$;
revoke execute on function public.customer_portal(text) from public;
grant execute on function public.customer_portal(text) to anon, authenticated;

-- load_all: customerLinks for the office (RLS hides them from other roles)
do $$
declare def text;
begin
  select pg_get_functiondef('public.load_all'::regproc) into def;
  if position('customerLinks' in def) = 0 then
    def := replace(def, '''recurring'', coalesce(', '''customerLinks'', coalesce((select jsonb_agg(jsonb_build_object(''token'', k.token, ''customerId'', k.customer_id, ''createdAt'', k.created_at, ''createdBy'', k.created_by, ''expiresAt'', k.expires_at, ''revokedAt'', k.revoked_at, ''viewCount'', k.view_count, ''lastViewedAt'', k.last_viewed_at) order by k.created_at desc) from public.customer_links k), ''[]''),
    ''recurring'', coalesce(');
    execute def;
  end if;
end $$;
