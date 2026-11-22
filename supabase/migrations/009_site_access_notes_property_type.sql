-- Sites get a property type and access notes; load_all() returns them. Already applied to the live project.
alter table public.sites add column if not exists access_notes text not null default '', add column if not exists property_type text not null default '';
