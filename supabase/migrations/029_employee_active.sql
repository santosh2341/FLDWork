-- Employees can be marked inactive (left the business, seasonal staff) instead of deleted: their past schedule, clocked
-- hours and job history keep their name, but they drop out of the pickers for new work. Office staff can also add
-- people who never sign in (for example a subcontractor) and rename employees; both use the existing employees policies.
alter table public.employees add column if not exists active boolean not null default true;

do $$
declare def text;
begin
  select pg_get_functiondef('public.load_all'::regproc) into def;
  if position('''active'', e.active' in def) = 0 then
    def := replace(def, '''name'', e.name, ''costRate''', '''name'', e.name, ''active'', e.active, ''costRate''');
    execute def;
  end if;
end $$;
