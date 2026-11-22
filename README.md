# Fieldwork

Field service management web app (React + Vite + TypeScript), built from the page-by-page guide.

## Run
    npm install
    npm run dev

## What is built
- App shell: sidebar flyouts, top bar, record tabs, breadcrumbs, global search, notifications, guided tour
- Dashboard: alert counters, reminders, announcements, day schedule, map (Leaflet + OpenStreetMap)
- Customers, sites, parts catalog
- Quotes: cost centers, parts and labor, pre-builds, costing and margins
- Jobs created from approved quotes, then invoices created from completed jobs
- Invoices: unpaid/paid lists with ageing, detail, payments, approve/unlock/void
- Timesheets: week calendar, summary, breakdown, timesheet lock
- Mobile audits: builder (folders, groups, questions) and runner with versioned results
- Inventory, purchase orders with receiving, stock counts
- Reports: the ten standard reports with filters, CSV export and print
- Leads: list, filters, status, convert a lead into a customer, site and draft quote
- Invoices: All/Unpaid/Paid/Payments/Credits tabs, sortable columns, CSV export, row Options menu, credit notes, log and notes tabs
- Schedules: day, week and month views, printable run sheets and work orders
- Vendor quotes (request, enter prices, accept into a draft PO, expiry) and receipts (one recorded per goods-received action on a PO)
- Settings: General, Statuses (rename job statuses), Audits, Invoicing (default tax, payment terms, footer); optional rule that required audits must be done before a job is complete
- Quote tabs: Tasks (due dates, timeline log), Forms (audits required per quote, completed results), Attachments (stored in the browser, 400 KB max each)
- Recurring jobs: schedules that copy a quote into a new pending job when due (run manually)
- Retainages: percentage per invoice, held/released list

## Run against Supabase
The app reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. `.env.local` (not committed) already holds the values
for the connected project; copy `.env.example` to `.env.local` and fill them in for a new machine.

- With the keys set, the app asks you to sign in. "Create a company account" runs the `handle_new_user` trigger,
  which creates the company, an admin profile and an employee record for you.
- A new company is empty. The dashboard offers "Load demo data" (calls `seed_demo_data()`).
- Data is read in one call (`load_all()`), written with table inserts/updates and the database functions
  (`save_quote`, `create_invoice_from_job`, `receive_po`, ...), then re-read. `src/storeRemote.ts` holds those calls.
- Rules live in the database: roles (`admin, accounts, sales, dispatcher` can write; `technician`, `readonly` cannot),
  timesheet lock, and "required audits before a job is complete". Rejections appear as a red banner.
- With no keys set, the app falls back to browser-only demo data (`src/storeLocal.ts`).
- Supabase may require email confirmation on sign-up. For development you can turn it off under
  Authentication, Providers, Email in the Supabase dashboard.
- `supabase/schema.sql` is an outdated first sketch; the real schema is in the project's migrations.

## Not built yet
Accounting integrations, emailing and PDF invoices, contractor and vendor invoices, automatic (background) recurring jobs,
BI reporting, file uploads to Supabase Storage (attachments are still stored inline, 400 KB max), per-role hiding of buttons.
