-- Purchase orders can be raised for a job. Goods received on a job PO go straight to that job:
-- receiving posts a materials cost to the job (traced to the receipt) and does not add the parts to stock.
-- POs without a job work as before (stock POs: received parts go into stock).
alter table public.purchase_orders add column if not exists job_id bigint references public.jobs(id) on delete set null;
create index if not exists purchase_orders_job on public.purchase_orders(job_id);
alter table public.job_costs add column if not exists receipt_id bigint references public.receipts(id) on delete cascade;
create unique index if not exists job_costs_receipt on public.job_costs(receipt_id) where receipt_id is not null;

-- A PO may only point at a job in the same company (the foreign key alone does not check that).
create or replace function public.check_po_job() returns trigger language plpgsql set search_path to '' as $$
begin
  if new.job_id is not null and not exists (select 1 from public.jobs j where j.id = new.job_id and j.company_id = new.company_id) then
    raise exception 'That job does not exist';
  end if;
  return new;
end $$;
drop trigger if exists purchase_orders_job_check on public.purchase_orders;
create trigger purchase_orders_job_check before insert or update of job_id on public.purchase_orders
  for each row execute function public.check_po_job();

drop function if exists public.create_po(text, jsonb);
create or replace function public.create_po(p_vendor text, p_lines jsonb, p_job_id bigint default null)
returns bigint language plpgsql set search_path to '' as $$
declare po bigint;
begin
  insert into public.purchase_orders(vendor, job_id) values (p_vendor, p_job_id) returning id into po;
  insert into public.po_lines(po_id, part_id, qty, unit_cost)
    select po, (x->>'partId')::uuid, (x->>'qty')::numeric, coalesce((x->>'unitCost')::numeric, 0) from jsonb_array_elements(coalesce(p_lines, '[]')) x;
  return po;
end $$;
revoke execute on function public.create_po(text, jsonb, bigint) from public, anon;
grant execute on function public.create_po(text, jsonb, bigint) to authenticated;

create or replace function public.receive_po(p_po_id bigint, p_received jsonb)
returns bigint language plpgsql set search_path to '' as $$
declare l record; n numeric; rid bigint := 0; v_job bigint; v_vendor text;
begin
  select job_id, vendor into v_job, v_vendor from public.purchase_orders where id = p_po_id;
  for l in select * from public.po_lines where po_id = p_po_id loop
    n := greatest(0, least(coalesce((p_received ->> l.id::text)::numeric, 0), l.qty - l.received));
    if n > 0 then
      if rid = 0 then insert into public.receipts(po_id) values (p_po_id) returning id into rid; end if;
      insert into public.receipt_lines(receipt_id, part_id, qty, unit_cost) values (rid, l.part_id, n, l.unit_cost);
      update public.po_lines set received = received + n where id = l.id;
      if v_job is null then
        update public.catalog_parts set stock = stock + n where id = l.part_id;
      end if;
    end if;
  end loop;
  if rid <> 0 and v_job is not null then
    insert into public.job_costs(job_id, kind, supplier, description, amount, receipt_id)
      select v_job, 'material', v_vendor, 'Received on PO ' || p_po_id || ' (receipt R-' || rid || ')', coalesce(sum(qty * unit_cost), 0), rid
      from public.receipt_lines where receipt_id = rid;
  end if;
  if not exists (select 1 from public.po_lines where po_id = p_po_id and received < qty) then
    update public.purchase_orders set status = 'received' where id = p_po_id;
  end if;
  return rid;
end $$;

-- load_all: purchaseOrders get jobId, jobCosts get receiptId
do $$
declare def text;
begin
  select pg_get_functiondef('public.load_all'::regproc) into def;
  if position('''jobId'', p.job_id' in def) = 0 then
    def := replace(def, '''createdAt'', p.created_at, ''lines''', '''createdAt'', p.created_at, ''jobId'', p.job_id, ''lines''');
  end if;
  if position('receiptId' in def) = 0 then
    def := replace(def, '''supplier'', c.supplier, ''description'', c.description, ''amount'', c.amount)',
      '''supplier'', c.supplier, ''description'', c.description, ''amount'', c.amount, ''receiptId'', c.receipt_id)');
  end if;
  execute def;
end $$;
