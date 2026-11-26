-- Card payments through Stripe Checkout. The stripe-webhook Edge Function records a payment when Stripe confirms one;
-- external_ref holds the Stripe Checkout Session id so the same payment can never be recorded twice (Stripe may send
-- the same event more than once). Manual payments leave it empty.
alter table public.payments add column if not exists external_ref text;
create unique index if not exists payments_external_ref on public.payments(external_ref) where external_ref is not null;
