# Fieldwork build plan

Status key: [x] done, [~] in progress, [ ] to do. Each phase is built, tested and pushed on its own.

## Done
- [x] App shell, customers, sites, parts catalog, quotes with costing, jobs, invoices, timesheets, schedules, dashboard and map
- [x] Audits, inventory, purchase orders, counts, pre-builds, vendor quotes, reports, leads, recurring jobs, work orders
- [x] Supabase backend (auth, RLS, load_all and save RPCs) wired to the app; local demo mode without keys
- [x] Australian addresses (structured fields, map pin, PO Box, building/unit/lot), site property type and access notes
- [x] Role-aware buttons, delete customer/site, Vercel SPA rewrite

## Phase 1: Company details and printable documents
- [x] Company profile in Settings: ABN, phone, email, address, bank details, invoice footer
- [x] Print-ready Quote and Tax Invoice (ABN, GST breakdown, bank details), save as PDF via the browser
- [x] "Email" button that opens a ready-written email to the customer

## Phase 2: Accounts and team
- [x] Forgot / reset password (added by you)
- [x] Team page: admins see members, change roles, invite by link

## Phase 3: Data housekeeping and accounting
- [x] Delete quotes and jobs (blocked when they have downstream records)
- [x] CSV exports: Xero sales-invoice import, customers, parts (MYOB layout later)

## Phase 4: AI assistant (Claude API through a Supabase Edge Function)
- [x] Edge Function ai-assist with auth, per-company daily limit, key kept server-side
- [x] Quote builder (Quotes > Draft with AI): catalog-priced draft, user reviews then creates
- [x] Tidy with AI on quote scope, quote notes and invoice notes
- [ ] Needs `ANTHROPIC_API_KEY` set as a Supabase secret; the app works without it and says so

## Phase 5: Technician mobile
- [x] "My day" view and phone-friendly job screen (status, notes, audits)

## Phase 6: Quality and AI extras
- [ ] Ask-your-data (read-only questions about jobs, invoices, stock)
- [x] Pre-send checks on quotes and invoices
- [ ] QA sweep of work orders, purchase orders, counts, leads; lint and bundle-size clean-up

## Later / needs outside accounts
- Xero or MYOB live sync (OAuth app registration), SMS reminders, equipment photo reading, manuals search
