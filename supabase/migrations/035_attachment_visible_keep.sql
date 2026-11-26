-- 035: an attachment's "Customer can see" setting only changes when the app actually sends it.
-- 034 made save_quote overwrite customer_visible on every save, treating a missing value as "visible". A save
-- from an older copy of the app (open in a browser tab, not yet reloaded) sends no customerVisible, so it
-- flipped internal files to visible. Now: new attachments still default to visible, but an existing one is
-- only updated when the payload includes customerVisible.
do $$
declare def text; before text;
begin
  select pg_get_functiondef('public.save_quote'::regproc) into def;
  if position('excluded.customer_visible' in def) > 0 then
    before := def;
    def := replace(def,
      'on conflict (id) do update set customer_visible = excluded.customer_visible;',
      $r$on conflict (id) do nothing;
  update public.quote_attachments a set customer_visible = (x->>'customerVisible')::boolean
    from jsonb_array_elements(coalesce(p->'attachments', '[]')) x
    where a.id = (x->>'id')::uuid and a.quote_id = qid and x ? 'customerVisible';$r$);
    if def = before then raise exception 'save_quote: anchor not found, nothing changed'; end if;
    execute def;
  end if;
end $$;
