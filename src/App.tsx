import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth'
import { AuthProvider } from './AuthProvider'
import { StoreProvider } from './StoreProvider'
import Login from './pages/Login'
import Shell from './components/Shell'
import { useStore } from './store'

// Pages load on demand so the first screen is quick.
const Catalog = lazy(() => import('./pages/Catalog'))
const Quotes = lazy(() => import('./pages/Quotes'))
const QuoteDetail = lazy(() => import('./pages/QuoteDetail'))
const Jobs = lazy(() => import('./pages/Jobs'))
const JobCosting = lazy(() => import('./pages/JobCosting'))
const Invoices = lazy(() => import('./pages/Invoices'))
const InvoiceDetail = lazy(() => import('./pages/InvoiceDetail'))
const Timesheets = lazy(() => import('./pages/Timesheets'))
const Assets = lazy(() => import('./pages/Assets'))
const MyDay = lazy(() => import('./pages/MyDay'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const MobileSettings = lazy(() => import('./pages/MobileSettings'))
const Inventory = lazy(() => import('./pages/Materials').then((m) => ({ default: m.Inventory })))
const InventoryCounts = lazy(() => import('./pages/Materials').then((m) => ({ default: m.InventoryCounts })))
const PreBuilds = lazy(() => import('./pages/Materials').then((m) => ({ default: m.PreBuilds })))
const PurchaseOrders = lazy(() => import('./pages/Materials').then((m) => ({ default: m.PurchaseOrders })))
const Receipts = lazy(() => import('./pages/Materials').then((m) => ({ default: m.Receipts })))
const VendorQuotes = lazy(() => import('./pages/Materials').then((m) => ({ default: m.VendorQuotes })))
const ReportPage = lazy(() => import('./pages/Reports').then((m) => ({ default: m.ReportPage })))
const ReportsHub = lazy(() => import('./pages/Reports').then((m) => ({ default: m.ReportsHub })))
const Leads = lazy(() => import('./pages/Leads'))
const Recurring = lazy(() => import('./pages/Recurring'))
const WorkOrderDetail = lazy(() => import('./pages/WorkOrders').then((m) => ({ default: m.WorkOrderDetail })))
const WorkOrders = lazy(() => import('./pages/WorkOrders').then((m) => ({ default: m.WorkOrders })))
const DayView = lazy(() => import('./pages/ScheduleViews').then((m) => ({ default: m.DayView })))
const MonthView = lazy(() => import('./pages/ScheduleViews').then((m) => ({ default: m.MonthView })))
const RunSheets = lazy(() => import('./pages/ScheduleViews').then((m) => ({ default: m.RunSheets })))
const WeekView = lazy(() => import('./pages/ScheduleViews').then((m) => ({ default: m.WeekView })))
const InvoicePrint = lazy(() => import('./pages/Print').then((m) => ({ default: m.InvoicePrint })))
const StatementPrint = lazy(() => import('./pages/Print').then((m) => ({ default: m.StatementPrint })))
const PoPrint = lazy(() => import('./pages/Print').then((m) => ({ default: m.PoPrint })))
const QuotePrint = lazy(() => import('./pages/Print').then((m) => ({ default: m.QuotePrint })))
const CustomerDetail = lazy(() => import('./pages/Simple').then((m) => ({ default: m.CustomerDetail })))
const Customers = lazy(() => import('./pages/Simple').then((m) => ({ default: m.Customers })))
const Sites = lazy(() => import('./pages/Simple').then((m) => ({ default: m.Sites })))
const Soon = lazy(() => import('./pages/Simple').then((m) => ({ default: m.Soon })))
const QuotePortal = lazy(() => import('./pages/QuotePortal'))
const CustomerPortal = lazy(() => import('./pages/CustomerPortal'))

export default function App() {
  // Customer links (/q/<token>) open on their own: no sign-in, no menus.
  const portal = /^\/q\/([^/]*)\/?$/.exec(window.location.pathname)
  if (portal) return <Suspense fallback={<div className="center muted">Loading…</div>}><QuotePortal token={portal[1]} /></Suspense>
  const account = /^\/p\/([^/]*)\/?$/.exec(window.location.pathname)
  if (account) return <Suspense fallback={<div className="center muted">Loading…</div>}><CustomerPortal token={account[1]} /></Suspense>
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}

// With Supabase configured, nothing is shown until the user signs in.
function Gate() {
  const { remote, ready, session, recovery } = useAuth()
  if (!ready) return <div className="center muted">Loading…</div>
  if (remote && (!session || recovery)) return <Login />
  return <AppRoutes />
}

// Technicians land on their day; everyone else gets the dashboard.
function Home() {
  const { profile } = useStore()
  return profile?.role === 'technician' ? <Navigate to="/my-day" replace /> : <Dashboard />
}

function AppRoutes() {
  return (
    <StoreProvider>
      <BrowserRouter>
        <Suspense fallback={<div className="center muted">Loading…</div>}>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<Home />} />
            <Route path="my-day" element={<MyDay />} />
            <Route path="customers" element={<Customers />} />
            <Route path="assets" element={<Assets />} />
            <Route path="customers/:id" element={<CustomerDetail />} />
            <Route path="customers/:id/statement" element={<StatementPrint />} />
            <Route path="sites" element={<Sites />} />
            <Route path="quotes" element={<Quotes />} />
            <Route path="quotes/:id" element={<QuoteDetail />} />
            <Route path="quotes/:id/print" element={<QuotePrint />} />
            <Route path="jobs" element={<Jobs />} />
            <Route path="jobs/:id/costing" element={<JobCosting />} />
            <Route path="invoices" element={<Invoices key="unpaid" initial="unpaid" />} />
            <Route path="invoices/paid" element={<Invoices key="paid" initial="paid" />} />
            <Route path="invoices/all" element={<Invoices key="all" initial="all" />} />
            <Route path="invoices/payments" element={<Invoices key="payments" initial="payments" />} />
            <Route path="invoices/retainages" element={<Invoices key="retainages" initial="retainages" />} />
            <Route path="invoices/credits" element={<Invoices key="credits" initial="credits" />} />
            <Route path="invoices/:id" element={<InvoiceDetail />} />
            <Route path="invoices/:id/print" element={<InvoicePrint />} />
            <Route path="schedules/timesheets" element={<Timesheets />} />
            <Route path="schedules/day" element={<DayView />} />
            <Route path="schedules/week" element={<WeekView />} />
            <Route path="schedules/month" element={<MonthView />} />
            <Route path="schedules/run-sheets" element={<RunSheets />} />
            <Route path="leads" element={<Leads />} />
            <Route path="recurring" element={<Recurring />} />
            <Route path="schedules/work-orders" element={<WorkOrders />} />
            <Route path="schedules/work-orders/:id" element={<WorkOrderDetail />} />
            <Route path="settings" element={<Navigate to="/settings/general" replace />} />
            <Route path="settings/:tab" element={<MobileSettings />} />
            <Route path="materials/inventory" element={<Inventory />} />
            <Route path="materials/counts" element={<InventoryCounts />} />
            <Route path="materials/pre-builds" element={<PreBuilds />} />
            <Route path="materials/purchase-orders" element={<PurchaseOrders />} />
            <Route path="materials/purchase-orders/:id/print" element={<PoPrint />} />
            <Route path="materials/vendor-quotes" element={<VendorQuotes />} />
            <Route path="materials/receipts" element={<Receipts />} />
            <Route path="reports" element={<ReportsHub />} />
            <Route path="reports/:id" element={<ReportPage />} />
            <Route path="materials/catalog" element={<Catalog />} />
            <Route path="soon/:slug" element={<Soon />} />
            <Route path="*" element={<Soon />} />
          </Route>
        </Routes>
        </Suspense>
      </BrowserRouter>
    </StoreProvider>
  )
}
