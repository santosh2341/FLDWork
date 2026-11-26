-- 036: an invoice made from a job no longer copies the quote's empty cost centres (sections with no lines),
-- which showed on the invoice, PDF and email as a heading with a $0.00 sub-total.
do $$
declare def text; before text;
begin
  select pg_get_functiondef('public.create_invoice_from_job'::regproc) into def;
  if position('exists (select 1 from public.line_items' in def) = 0 then
    before := def;
    def := replace(def,
      'for cc in select * from public.cost_centers where quote_id = q.id order by sort, name loop',
      'for cc in select * from public.cost_centers c where c.quote_id = q.id and exists (select 1 from public.line_items li where li.cost_center_id = c.id) order by sort, name loop');
    if def = before then raise exception 'create_invoice_from_job: anchor not found, nothing changed'; end if;
    execute def;
  end if;
end $$;
