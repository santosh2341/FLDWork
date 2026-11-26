-- 034: choose which quote attachments the customer can see, and show those on the customer pages.
-- * quote_attachments.customer_visible: existing files stay hidden (they were uploaded as internal); new uploads
--   are visible unless the office unticks "Customer can see".
-- * save_quote stores the flag and updates it on later saves (attachments were insert-only before).
-- * load_all returns it as customerVisible.
-- * quote_portal (/q/ accept-online page) and customer_portal (/p/ portal, per quote) return the visible files only.
alter table public.quote_attachments add column if not exists customer_visible boolean not null default false;
alter table public.quote_attachments alter column customer_visible set default true;

do $$
declare def text; before text;
begin
  -- save_quote: write the flag, and update it when the attachment already exists
  select pg_get_functiondef('public.save_quote'::regproc) into def;
  if position('customer_visible' in def) = 0 then
    before := def;
    def := replace(def,
      'insert into public.quote_attachments(id, quote_id, name, size, mime_type, storage_path, data_url, created_at)',
      'insert into public.quote_attachments(id, quote_id, name, size, mime_type, storage_path, data_url, created_at, customer_visible)');
    def := replace(def,
      $r$x->>'dataUrl', coalesce((x->>'addedAt')::timestamptz, now())$r$,
      $r$x->>'dataUrl', coalesce((x->>'addedAt')::timestamptz, now()), coalesce((x->>'customerVisible')::boolean, true)$r$);
    def := regexp_replace(def,
      $r$(from jsonb_array_elements\(coalesce\(p->'attachments', '\[\]'\)\) x\s+)on conflict \(id\) do nothing;$r$,
      '\1on conflict (id) do update set customer_visible = excluded.customer_visible;');
    if def = before or position('excluded.customer_visible' in def) = 0 or position($r$(x->>'customerVisible')$r$ in def) = 0 then
      raise exception 'save_quote: anchors not found, nothing changed';
    end if;
    execute def;
  end if;

  -- load_all: return the flag to the office
  select pg_get_functiondef('public.load_all'::regproc) into def;
  if position('customerVisible' in def) = 0 then
    before := def;
    def := replace(def, $r$'dataUrl', coalesce(a.data_url, ''), 'addedAt', a.created_at)$r$,
                        $r$'dataUrl', coalesce(a.data_url, ''), 'addedAt', a.created_at, 'customerVisible', a.customer_visible)$r$);
    if def = before then raise exception 'load_all: anchor not found, nothing changed'; end if;
    execute def;
  end if;

  -- quote_portal: visible attachments of the linked quote
  select pg_get_functiondef('public.quote_portal'::regproc) into def;
  if position('quote_attachments' in def) = 0 then
    before := def;
    def := replace(def, $r$'link', jsonb_build_object('expiresAt'$r$,
      $r$'attachments', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'size', a.size, 'type', a.mime_type, 'dataUrl', coalesce(a.data_url, '')) order by a.created_at)
        from public.quote_attachments a where a.quote_id = q.id and a.customer_visible), '[]'),
    'link', jsonb_build_object('expiresAt'$r$);
    if def = before then raise exception 'quote_portal: anchor not found, nothing changed'; end if;
    execute def;
  end if;

  -- customer_portal: visible attachments on each quote
  select pg_get_functiondef('public.customer_portal'::regproc) into def;
  if position('quote_attachments' in def) = 0 then
    before := def;
    def := replace(def, $r$'acceptToken', (select k.token$r$,
      $r$'attachments', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'size', a.size, 'type', a.mime_type, 'dataUrl', coalesce(a.data_url, '')) order by a.created_at)
          from public.quote_attachments a where a.quote_id = q.id and a.customer_visible), '[]'),
        'acceptToken', (select k.token$r$);
    if def = before then raise exception 'customer_portal: anchor not found, nothing changed'; end if;
    execute def;
  end if;
end $$;
