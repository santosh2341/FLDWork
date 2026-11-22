-- Structured Australian addresses + map coordinates for customers; structured address for sites.
-- Already applied to the live project. load_all() was patched to return addressParts (and lat/lng for customers).
alter table public.customers add column if not exists address_parts jsonb, add column if not exists lat double precision, add column if not exists lng double precision;
alter table public.sites add column if not exists address_parts jsonb;
