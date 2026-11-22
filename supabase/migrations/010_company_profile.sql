-- Business details (ABN, licence, contact, bank) for quotes and tax invoices; currency defaults to AUD.
-- Already applied to the live project; load_all() returns settings.company.
alter table public.companies add column if not exists profile jsonb not null default '{}'::jsonb;
alter table public.companies alter column currency set default 'AUD';
