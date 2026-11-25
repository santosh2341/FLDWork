# Fieldwork: project plan and status

Last updated 25 Nov 2026. Repository: github.com/santosh2341/FLDWork (branch `main`). Live: fld-work.vercel.app (Vercel auto-deploys `main`). Backend: Supabase project `xmvocohxzitwxtmtbrsd`. Working rules for Claude Code are in `CLAUDE.md`; this document is the plan.

## 1. What Fieldwork is
A web app for Australian trade and field-service businesses (electrical, plumbing, HVAC, fire, security, data cabling) to run the whole job lifecycle: capture a lead, quote with costing and margins, turn the quote into a job, schedule people, let technicians work from their phone, invoice (including in stages), track real job cost and profit, and report. It follows a 15-page "Field Service Management Platform Page-by-Page Development Guide" supplied by the owner, and is benchmarked against Simpro.

- **Owner:** Santosh (Hyderabad, India). End customers are Australian businesses: AUD, GST 10%, ABN, BSB, Australian addresses.
- **Positioning:** a modern, fast, good-looking alternative to Simpro with the same core workflow. The owner wants it to feel professional and distinctive, on both phone and desktop.
- **Users and roles** (`profiles.role`): `admin` (everything, team management), `accounts`, `sales`, `dispatcher` (these four can write), `technician` (phone-first: sees their day, updates jobs, notes, photos, clock, audits, equipment services), `readonly`.
- **Modes:** with no Supabase keys the app runs on browser-only demo data (good for demos and development); with keys it uses Supabase with sign-in, company-scoped data and role rules. A new company starts empty; the dashboard offers "Load demo data".

## 2. Architecture in one page
- **Frontend:** React 19, TypeScript strict, Vite, React Router, hand-written CSS with design tokens (light and dark). Map: Leaflet with OpenStreetMap. No UI framework.
- **State:** a single store (context and `useStore` in `src/store.ts`, provider in `src/StoreProvider.tsx`) exposing `db` (all data) and `Actions`. Two implementations: local (`storeLocal.ts`) and remote (`storeRemote.ts`). Reads: one RPC `load_all()`. Writes: table writes and SQL functions, then reload.
- **Database (Postgres, RLS on every table, company-scoped):** customers, sites, catalog_parts, quotes, cost_centers, line_items, quote_tasks, quote_audits, quote_attachments, timeline_events, jobs, schedule_entries, clock_entries, job_notes, job_photos, job_costs, invoices, invoice_sections, invoice_items, invoice_log, payments, credits, audits (audits, audit_groups, audit_questions, audit_results), purchase_orders, po_lines, receipts, receipt_lines, vendor_quotes, vendor_quote_lines, pre_builds, pre_build_items, inventory_counts, inventory_count_lines, leads, recurring_jobs, reminders, assets, asset_services, employees, profiles, companies, invites, ai_usage, email_log.
- **Database functions:** create_quote, save_quote, create_job_from_quote, create_invoice_from_job, create_progress_claim, log_payment, log_credit, create_po, receive_po, save_vendor_quote, accept_vendor_quote, create_inventory_count, apply_inventory_count, save_audit, save_pre_build, convert_lead, run_recurring, log_asset_service, list_team, set_member_role, invite_info, ai_take_credit, seed_demo_data, load_all, plus triggers (timesheet lock, required audits before job complete, invoice log, updated_at).
- **Storage:** private bucket `job-photos` (signed URLs). Bucket `quote-attachments` exists but is unused.
- **Edge Functions:** `ai-assist` (Claude API: quote drafting and text tidy-up; per-company daily limit), `send-document` (email quote/invoice to the customer's email on file via Resend; 50/day/company).
- **Phone layout:** bottom tab bar, quick-add and search sheets, tables become cards, "My day" run-sheet timetable. **Desktop:** left rail with flyout menus, top bar, record tabs, breadcrumbs.
- **Quality guards:** pre-send checks on quotes and invoices; route-level code splitting; crash guard with safe mode; list paging on Jobs and Quotes.

## 3. Feature status

Legend: ✅ built and working in the app · 🟡 built but needs setup, has a known limit, or is not fully verified live · ⬜ not built.

### Sales and customers
| Feature | Status | Notes |
|---|---|---|
| Customers and sites (AU structured addresses, map pin, PO Box/unit/lot, property type, access notes) | ✅ | delete blocked if there are downstream records |
| Leads: list, filters, status, convert to customer + site + draft quote | ✅ | |
| Quotes: cost centres, parts and labour lines, pre-builds, markup, discount, GST, overheads, margins | ✅ | costing formulas follow the guide §9.5 |
| Quote tabs: tasks and timeline, forms (audits required), attachments, status log | ✅ | attachments are stored inline, 400 KB max each |
| Printable quote and tax invoice (ABN, GST breakdown, bank details) and a real PDF download (A4, multi-page) | ✅ | PDF made in the browser with pdf-lib |
| Pre-send checks (warnings before sending a quote/invoice) | ✅ | advisory only |
| Email a quote or invoice to the customer from inside the app | 🟡 | deployed with PDF attachment and, for quotes, an "accept online" button; needs `RESEND_API_KEY` + `EMAIL_FROM` secrets and a verified domain. "Open in my email app" fallback works |
| Statement of account (printable) | ✅ | |
| Online quote acceptance by link: customer views at selling prices, downloads PDF, accepts with typed name or declines with a reason; quote status and timeline update | ✅ | migration 026; links expire after 60 days and can be withdrawn |
| Customer portal by private link (/p/): balance owing, invoices with PDFs, quotes with "view and accept", statement, bank details; read-only | ✅ | migration 027; links last 180 days and can be withdrawn. Online card payment needs Stripe (D12) |

### Jobs, scheduling and field work
| Feature | Status | Notes |
|---|---|---|
| Jobs created from approved quotes, status flow pending → scheduled → in progress → complete → invoiced; renameable statuses | ✅ | |
| Schedules: timesheets week calendar, day, week and month views, run sheets, work orders | ✅ | timesheet lock supported |
| Drag-and-drop schedule (move visits between people/days, drop waiting jobs, change times, overlap warning) | ✅ | drag with mouse/trackpad; on phones use tap-to-move |
| Tap-to-move scheduling (tap a visit or waiting job: person, day, times, remove; works by keyboard too) | ✅ | removing the last visit puts the job back on the waiting list |
| My day (technician phone screen): timetable, navigate/call, access notes, status, notes, clock on/off, photos | ✅ | |
| Mobile audits/forms: builder and runner with versioned results; optional rule "required audits before complete" | ✅ | |
| Job photos (private storage, shrunk on device) | 🟡 | works in code; live storage not exercised from the build sandbox |
| Equipment register: assets per site/customer, service history, due dates, "services due" list, log service from phone, create service quote | ✅ | |
| Recurring jobs (copy a quote into a new pending job when due) | 🟡 | run manually; no background scheduler yet |
| Clock hours in timesheet approval: clocked vs scheduled per person per week, approve/reopen; approved entries are locked for technicians | ✅ | approval is per person per week on Timesheets → Summary |
| Route optimisation, GPS tracking, offline mode / PWA install, push notifications | ⬜ | |
| Customer sign-off signature on a job | ⬜ | |

### Money
| Feature | Status | Notes |
|---|---|---|
| Invoices from completed jobs; unpaid/paid/all/payments/credits tabs, sortable, ageing, CSV export, log and notes | ✅ | |
| Approve / unlock / void, payments (overpayment asks to confirm), credit notes, retainage (percent per invoice, held/released list) | ✅ | |
| Progress invoicing: bill a job in stages (deposit/progress/completion) as % of the quote, capped at 100%; job becomes invoiced when fully claimed; printed claim shows contract price, claimed to date, remaining | ✅ | claims bill a percentage of quote price, not work-in-progress valuation |
| Actual job costing: costs recorded against a job (materials, subcontractor, other) plus clocked labour, versus quote estimate; live profit and margin | ✅ | labour is each person's clocked hours × their hourly cost (Settings → Employees), falling back to the quote's average; shows cost committed on open job POs |
| Purchase orders (draft/ordered/received/cancelled), receiving, receipts, vendor quotes (request, enter prices, accept into PO, expiry) | ✅ | a PO can be for a job: received goods post to that job's cost (not stock) |
| Inventory, stock counts (apply adjusts stock), catalog of parts | ✅ | |
| Reports: the ten standard reports plus technician hours, job profitability and customer profitability; filters, CSV, print | ✅ | dashboard "Jobs over budget" alert opens Jobs filtered to them |
| CSV exports: Xero sales-invoice import format, customers, parts | ✅ | MYOB layout not done |
| Live accounting sync (Xero, MYOB) | ⬜ | needs the owner's Xero developer account (OAuth app) |
| Online card payments (Stripe) and payment links | ⬜ | needs a Stripe account |
| Contractor / vendor bills (accounts payable), BI-style reporting | ⬜ | |
| SMS reminders and "on my way" texts | ⬜ | needs an SMS provider (for example Twilio) |

### Platform
| Feature | Status | Notes |
|---|---|---|
| Sign-in, create company, forgot/reset password, team page (change roles, invite by link) | ✅ | email confirmation may need turning off in Supabase for development |
| Role-aware buttons; database enforces roles | ✅ | |
| Company profile (ABN, bank, footer), settings tabs (General, Statuses, Audits, Invoicing, mobile settings) | ✅ | |
| Global search, notifications bell, dashboard (alert tiles that filter lists, reminders, announcements, day schedule, map), guided tour, light/dark theme | ✅ | |
| Phone redesign and desktop refresh (this session) | ✅ | verified at 390px and 1366px in Chromium; iPhone Safari verified only by the owner's reports |
| AI: quote drafting from catalog, "Tidy with AI" on scope/notes | 🟡 | built, hidden behind a missing `ANTHROPIC_API_KEY`; the owner postponed paying for AI |
| AI: ask-your-data, equipment photo reading, manuals search | ⬜ | postponed by the owner |
| Multi-branch / multiple companies per user, API/webhooks, audit trail UI | ⬜ | |

## 4. Known issues and risks
1. **iPhone Safari crash on /jobs** (205 jobs, card layout) was reported. Mitigations shipped: paging (40 rows) on Jobs and Quotes, safe mode after a crash, lighter CSS. Root cause never reproduced (the sandbox has no WebKit). Ask the owner to confirm Jobs opens normally on the phone. Page the other long lists (Invoices, Customers, Sites, Materials tables, Leads, Timesheets) the same way.
2. **Live (Supabase) paths are not testable from the sandbox.** Edge Functions, email, AI, storage uploads and the RPCs were checked by reading definitions and local-mode tests only. Treat first real use as a test; look at Supabase logs (`get_logs`) and the advisors.
3. Lint is clean (0 warnings, 0 errors) since 26 Nov 2026.
4. ~~Drag-and-drop does not work on touch screens.~~ Tap-to-move covers phones.
5. `supabase/schema.sql` is outdated; do not rely on it.
6. Demo data sometimes shows a quote title that drops part of the customer name; this is how the seed data is written.
7. Email needs the owner's domain verified at Resend (the PDF is attached once sending is set up).

## 5. Roadmap (build in this order unless the owner says otherwise)

**A. Hardening (do first, about a day)**
1. ~~Page every list that can exceed ~100 rows (`usePaged`); verify at 390px with 300+ rows.~~ Done (reports are not paged so they print in full).
2. ~~Clear the lint warnings without changing behaviour.~~ Done.
3. ~~Phone pass over every page at 390px and in dark mode; fix overflow and spacing. Add tap-to-move (a "Move to…" sheet) for schedule visits on phones.~~ Done (Timesheets calendar scrolls in its card, page headers wrap).
4. ~~Add a small Playwright smoke script to the repo (`scripts/smoke.mjs`) that seeds local mode and walks quote → job → claim → cost → schedule, so regressions are caught before pushing.~~ Done: `npm run smoke`.

**B. Costing and purchasing depth**
5. ~~Per-employee hourly cost rates (an Employees/Team screen with rate), used for actual labour cost instead of the quote average.~~ Done (migration 023).
6. ~~Link purchase orders and receipts to jobs; received PO lines post to job cost automatically.~~ Done (migration 024).
7. ~~Job profitability report (estimate vs actual, per job and per customer) and a "jobs over budget" dashboard alert.~~ Done.
8. ~~Fold clock hours into the timesheet approval flow.~~ Done (migration 025).

**C. Customer-facing**
9. ~~Send documents with a PDF attachment and customer-facing quote acceptance by link (accept/decline, typed signature, logged).~~ Done (migration 026).
10. ~~Customer portal (read-only first: quotes, invoices, statements).~~ Done (migration 027).

**D. Needs the owner's accounts (ask before starting)**
11. Xero sync: OAuth app; push invoices, payments and customers; map GST codes and accounts. MYOB layout for CSV after.
12. Stripe: pay-by-link on invoices, webhook marks the payment, reconciliation.
13. SMS: appointment reminders and "technician on the way" via Twilio or similar.
14. Background jobs: scheduled recurring-job generation and overdue-invoice reminders (Supabase cron / Edge Function).

**E. AI (only when the owner says go; needs `ANTHROPIC_API_KEY` and a budget)**
15. Turn on the existing quote drafting and tidy-ups and test live.
16. Ask-your-data (read-only questions over jobs, invoices, stock), equipment photo reading, manuals search.

**F. Later ideas (not committed)**: offline-first technician app/PWA, route optimisation, e-signature on job completion, multi-branch, public API/webhooks, service contracts/SLAs.

## 6. Setup tasks that only the owner can do
- Supabase dashboard → Edge Functions → Secrets: add `RESEND_API_KEY` and `EMAIL_FROM` (after verifying a sending domain at resend.com). Later `ANTHROPIC_API_KEY`.
- Supabase → Authentication → password settings: turn on leaked-password protection.
- Provide Xero developer app credentials and a Stripe account when items 11/12 start.
- Confirm on a real iPhone that Jobs, My day and Quotes open and scroll smoothly after each mobile change.

## 7. Definition of done for any feature
- Works in local mode and Supabase mode; the type, store (local and remote), `load_all`, migration (in repo and applied live) and RLS are all in place.
- `npx tsc -b`, `npx oxlint src`, `npm run build` clean, and `npm run smoke` passes.
- Checked with Playwright at 390px and 1366px, light and dark; empty, error and long-list states handled; technician and read-only roles respected.
- Plain, specific wording; no `alert()`/`confirm()`; breadcrumbs and `PAGES` updated for new routes.
- Committed with a clear message and pushed to `main`; the final note says what was and was not tested live.
