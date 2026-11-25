-- Online quote acceptance. Office staff create a private link for a quote (/q/<token>); the customer opens it
-- without signing in, sees the quote at selling prices only (never costs, markups or private notes) and can
-- accept it with their typed name or decline it with a reason. The decision updates the quote and its timeline.
-- The token is 64 random hex characters, so links cannot be guessed. Links expire after 60 days and can be revoked.
create table if not exists public.quote_links (
  token text primary key default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  company_id uuid not null default public.current_company() references public.companies(id) on delete cascade,
  quote_id bigint not null references public.quotes(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by text not null default '',
  expires_at timestamptz not null default now() + interval '60 days',
  revoked_at timestamptz,
  view_count integer not null default 0,
  last_viewed_at timestamptz,
  decision text check (decision in ('accepted', 'declined')),
  decided_at timestamptz,
  signer_name text not null default '',
  signer_note text not null default ''
);
create index if not exists quote_links_quote on public.quote_links(quote_id);
alter table public.quote_links enable row level security;
create policy "quote_links read" on public.quote_links for select
  using (company_id = (select public.current_company()) and (select public.can_write()));
create policy "quote_links insert" on public.quote_links for insert
  with check (company_id = (select public.current_company()) and (select public.can_write()));
create policy "quote_links update" on public.quote_links for update
  using (company_id = (select public.current_company()) and (select public.can_write()))
  with check (company_id = (select public.current_company()));

-- Office: create a link. A quote that is still being written is marked as sent.
create or replace function public.create_quote_link(p_quote_id bigint, p_by text default '')
returns text language plpgsql set search_path to '' as $$
declare t text; st public.quote_status;
begin
  select status into st from public.quotes where id = p_quote_id;
  if not found then raise exception 'Quote not found'; end if;
  insert into public.quote_links(quote_id, created_by) values (p_quote_id, coalesce(p_by, '')) returning token into t;
  if st = 'to_be_completed' then
    update public.quotes set status = 'sent', updated_at = now() where id = p_quote_id;
  end if;
  insert into public.timeline_events(quote_id, type, message) values (p_quote_id, 'System', 'Online acceptance link created' || case when coalesce(p_by, '') <> '' then ' by ' || p_by else '' end);
  return t;
end $$;
revoke execute on function public.create_quote_link(bigint, text) from public, anon;
grant execute on function public.create_quote_link(bigint, text) to authenticated;

-- Customer (no sign-in): the quote as the customer should see it.
create or replace function public.quote_portal(p_token text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare l public.quote_links; q public.quotes; co public.companies; cu public.customers; si public.sites;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return jsonb_build_object('state', 'not_found'); end if;
  select * into l from public.quote_links where token = p_token;
  if not found then return jsonb_build_object('state', 'not_found'); end if;
  if l.revoked_at is not null then return jsonb_build_object('state', 'revoked'); end if;
  if l.expires_at < now() and l.decision is null then return jsonb_build_object('state', 'expired'); end if;
  select * into q from public.quotes where id = l.quote_id and company_id = l.company_id;
  if not found then return jsonb_build_object('state', 'not_found'); end if;
  update public.quote_links set view_count = view_count + 1, last_viewed_at = now() where token = p_token;
  select * into co from public.companies where id = l.company_id;
  select * into cu from public.customers where id = q.customer_id;
  select * into si from public.sites where id = q.site_id;
  return jsonb_build_object(
    'state', 'ok',
    'company', jsonb_build_object(
      'name', coalesce(nullif(co.profile ->> 'tradingName', ''), co.name),
      'abn', coalesce(co.profile ->> 'abn', ''), 'licence', coalesce(co.profile ->> 'licence', ''),
      'phone', coalesce(co.profile ->> 'phone', ''), 'email', coalesce(co.profile ->> 'email', ''),
      'website', coalesce(co.profile ->> 'website', ''), 'address', coalesce(co.profile ->> 'address', '')),
    'customer', jsonb_build_object('name', coalesce(cu.name, ''), 'contactName', coalesce(cu.contact_name, ''), 'address', coalesce(cu.address, '')),
    'site', jsonb_build_object('name', coalesce(si.name, ''), 'address', coalesce(si.address, '')),
    'quote', jsonb_build_object(
      'id', q.id, 'name', q.name, 'status', q.status, 'description', coalesce(q.description, ''),
      'date', q.created_at, 'discount', q.discount, 'taxRate', q.tax_rate,
      'sections', coalesce((select jsonb_agg(jsonb_build_object('name', cc.name, 'items', coalesce((
          select jsonb_agg(jsonb_build_object('description', li.description, 'quantity', li.quantity, 'unitSell', li.unit_sell, 'kind', li.kind) order by li.sort)
          from public.line_items li where li.cost_center_id = cc.id), '[]')) order by cc.sort)
        from public.cost_centers cc where cc.quote_id = q.id), '[]')),
    'link', jsonb_build_object('expiresAt', l.expires_at, 'decision', l.decision, 'decidedAt', l.decided_at, 'signerName', l.signer_name));
end $$;
revoke execute on function public.quote_portal(text) from public;
grant execute on function public.quote_portal(text) to anon, authenticated;

-- Customer (no sign-in): accept with a typed name, or decline with an optional reason. One decision per link.
create or replace function public.quote_portal_decide(p_token text, p_decision text, p_name text, p_note text default '')
returns jsonb language plpgsql security definer set search_path to '' as $$
declare l public.quote_links; st public.quote_status; nm text := btrim(coalesce(p_name, '')); nt text := left(btrim(coalesce(p_note, '')), 1000);
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'This link is not valid.'; end if;
  if p_decision not in ('accepted', 'declined') then raise exception 'Choose accept or decline.'; end if;
  if length(nm) < 2 or length(nm) > 100 then raise exception 'Type your full name.'; end if;
  select * into l from public.quote_links where token = p_token for update;
  if not found or l.revoked_at is not null then raise exception 'This link is no longer active. Please contact us.'; end if;
  if l.expires_at < now() then raise exception 'This link has expired. Please contact us for an updated quote.'; end if;
  if l.decision is not null then raise exception 'A decision has already been recorded for this quote.'; end if;
  select status into st from public.quotes where id = l.quote_id and company_id = l.company_id for update;
  if st in ('approved', 'declined') then raise exception 'This quote has already been %. Please contact us if anything has changed.', st; end if;
  update public.quote_links set decision = p_decision, decided_at = now(), signer_name = nm, signer_note = nt where token = p_token;
  update public.quotes set status = case when p_decision = 'accepted' then 'approved'::public.quote_status else 'declined'::public.quote_status end, updated_at = now()
    where id = l.quote_id;
  insert into public.timeline_events(company_id, quote_id, type, message)
    values (l.company_id, l.quote_id, 'Customer',
      case when p_decision = 'accepted' then 'Accepted online by ' || nm else 'Declined online by ' || nm || case when nt <> '' then ': ' || nt else '' end end);
  return jsonb_build_object('ok', true, 'decision', p_decision);
end $$;
revoke execute on function public.quote_portal_decide(text, text, text, text) from public;
grant execute on function public.quote_portal_decide(text, text, text, text) to anon, authenticated;

-- load_all: quoteLinks for the office (RLS hides them from other roles)
do $$
declare def text;
begin
  select pg_get_functiondef('public.load_all'::regproc) into def;
  if position('quoteLinks' in def) = 0 then
    def := replace(def, '''recurring'', coalesce(', '''quoteLinks'', coalesce((select jsonb_agg(jsonb_build_object(''token'', k.token, ''quoteId'', k.quote_id, ''createdAt'', k.created_at, ''createdBy'', k.created_by, ''expiresAt'', k.expires_at, ''revokedAt'', k.revoked_at, ''viewCount'', k.view_count, ''lastViewedAt'', k.last_viewed_at, ''decision'', k.decision, ''decidedAt'', k.decided_at, ''signerName'', k.signer_name, ''signerNote'', k.signer_note) order by k.created_at desc) from public.quote_links k), ''[]''),
    ''recurring'', coalesce(');
    execute def;
  end if;
end $$;
