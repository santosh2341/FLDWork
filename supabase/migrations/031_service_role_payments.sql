-- 031: let the Stripe Edge Functions (which run as service_role) read and record what they need.
-- The project had service_role stripped down to REFERENCES/TRIGGER/TRUNCATE on public tables, so the
-- webhook's invoice lookup returned nothing and card payments were never recorded ("invoice not found"),
-- and the portal "Pay by card" path could not read customer_links. Grants are the minimum those functions use.
grant select on public.invoices, public.invoice_sections, public.invoice_items, public.payments, public.credits,
  public.customer_links, public.companies to service_role;
grant insert on public.payments to service_role;