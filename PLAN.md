# Fieldwork build plan

Status key: [x] done, [~] in progress, [ ] to do. Each phase is built, tested and pushed on its own.

## Done
- [x] App shell, customers, sites, parts catalog, quotes with costing, jobs, invoices, timesheets, schedules, dashboard and map
- [x] Audits, inventory, purchase orders, counts, pre-builds, vendor quotes, reports, leads, recurring jobs, work orders
- [x] Supabase backend (auth, RLS, load_all and save RPCs) wired to the app; local demo mode without keys
- [x] Australian addresses (structured fields, map pin, PO Box, building/unit/lot), site property type and access notes
- [x] Role-aware buttons, delete customer/site, Vercel SPA rewrite

## Phase 1: Company details and printable documents
- [ ] Company profile in Settings: ABN, phone, email, address, bank details, invoice footer
- [ ] Print-ready Quote and Tax Invoice (ABN, GST breakdown, bank details), save as PDF via the browser
- [ ] "Email" button that opens a ready-written email to the customer

## Phase 2: Accounts and team
- [ ] Forgot / reset password
- [ ] Team page: admins see members and change roles

## Phase 3: Data housekeeping and accounting
- [ ] Archive / delete quotes and jobs (blocked when they have downstream records)
- [ ] CSV exports: invoices (Xero / MYOB import layout), customers, parts

## Phase 4: AI assistant (Claude API through a Supabase Edge Function)
- [ ] Edge Function with auth, per-company usage limit, API key kept server-side
- [ ] Quote builder: paste an email / text, AI drafts line items from the catalog, user approves
- [ ] Job notes: rough notes become clean notes and a customer summary
- [ ] Needs `ANTHROPIC_API_KEY` set as a Supabase secret; the app works without it and says so

## Phase 5: Technician mobile
- [ ] "My day" view and phone-friendly job screen (status, notes, audits)

## Phase 6: Quality and AI extras
- [ ] Ask-your-data (read-only questions about jobs, invoices, stock)
- [ ] Pre-send checks on quotes and invoices
- [ ] QA sweep of work orders, purchase orders, counts, leads; lint and bundle-size clean-up

## Later / needs outside accounts
- Xero or MYOB live sync (OAuth app registration), SMS reminders, equipment photo reading, manuals search
