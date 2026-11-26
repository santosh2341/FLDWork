-- 032: the payments trigger log_payment (security invoker) adds a line to invoice_log, so the Stripe webhook
-- (service_role) needs insert there too; without it the payment insert fails with "permission denied for table invoice_log".
grant insert on public.invoice_log to service_role;
