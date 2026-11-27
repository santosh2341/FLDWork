-- 037: quote attachments' file data is no longer part of load_all.
-- Attachments are stored inline (up to 400 KB each) and load_all used to send every file with every reload, which
-- reloads after each save; the app now fetches a file's data only when someone opens or downloads it (quote
-- Attachments tab). load_all still returns the name, size, type, date and "customer can see" flag.
-- Unchanged: save_quote (new uploads still carry their data; existing rows are never overwritten) and the customer
-- pages (quote_portal / customer_portal return the shared files' data themselves).
do $$
declare def text; before text;
begin
  select pg_get_functiondef('public.load_all'::regproc) into def;
  if position($r$'dataUrl', coalesce(a.data_url, ''), 'addedAt'$r$ in def) > 0 then
    before := def;
    def := replace(def, $r$'dataUrl', coalesce(a.data_url, ''), 'addedAt'$r$, $r$'addedAt'$r$);
    if def = before then raise exception 'load_all: anchor not found, nothing changed'; end if;
    execute def;
  end if;
end $$;
