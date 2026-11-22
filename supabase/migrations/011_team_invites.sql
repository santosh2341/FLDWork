-- Team: invites, invite-aware sign-up trigger, list_team and set_member_role. Already applied to the live project.
create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.current_company() references public.companies(id) on delete cascade,
  email text not null,
  role public.user_role not null default 'technician',
  code text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  used_at timestamptz
);
alter table public.invites enable row level security;
create policy "invites admin read" on public.invites for select using (company_id = (select public.current_company()) and (select public.is_admin()));
create policy "invites admin insert" on public.invites for insert with check (company_id = (select public.current_company()) and (select public.is_admin()));
create policy "invites admin delete" on public.invites for delete using (company_id = (select public.current_company()) and (select public.is_admin()));

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare cid uuid; nm text; inv public.invites%rowtype; v_code text;
begin
  nm := coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email,'user'),'@',1));
  v_code := new.raw_user_meta_data->>'invite_code';
  if v_code is not null and v_code <> '' then
    select i.* into inv from public.invites i
      where i.code = v_code and i.used_at is null and i.expires_at > now() and lower(i.email) = lower(new.email);
    if not found then raise exception 'This invitation is invalid, expired, or was sent to a different email address.'; end if;
    insert into public.profiles(id, company_id, full_name, role) values (new.id, inv.company_id, nm, inv.role);
    insert into public.employees(company_id, profile_id, name) values (inv.company_id, new.id, nm);
    update public.invites set used_at = now() where id = inv.id;
    return new;
  end if;
  insert into public.companies(name) values (coalesce(new.raw_user_meta_data->>'company_name','My Company')) returning id into cid;
  insert into public.profiles(id, company_id, full_name, role) values (new.id, cid, nm, 'admin');
  insert into public.employees(company_id, profile_id, name) values (cid, new.id, nm);
  return new;
end $$;

create or replace function public.invite_info(p_code text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('company', c.name, 'email', i.email, 'role', i.role)
  from public.invites i join public.companies c on c.id = i.company_id
  where i.code = p_code and i.used_at is null and i.expires_at > now();
$$;
grant execute on function public.invite_info(text) to anon, authenticated;

create or replace function public.list_team() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Only admins can view the team.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name, 'email', u.email, 'role', p.role) order by p.created_at)
    from public.profiles p join auth.users u on u.id = p.id where p.company_id = public.current_company()), '[]'::jsonb);
end $$;

create or replace function public.set_member_role(p_id uuid, p_role public.user_role) returns void
language plpgsql security definer set search_path = '' as $$
declare admins int; cur public.user_role;
begin
  if not public.is_admin() then raise exception 'Only admins can change roles.'; end if;
  select role into cur from public.profiles where id = p_id and company_id = public.current_company();
  if cur is null then raise exception 'That person is not in your company.'; end if;
  if cur = 'admin' and p_role <> 'admin' then
    select count(*) into admins from public.profiles where company_id = public.current_company() and role = 'admin';
    if admins <= 1 then raise exception 'There must be at least one admin.'; end if;
  end if;
  update public.profiles set role = p_role where id = p_id;
end $$;
revoke execute on function public.list_team() from anon;
revoke execute on function public.set_member_role(uuid, public.user_role) from anon;
