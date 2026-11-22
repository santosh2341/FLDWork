import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth'
import { StoreProvider } from './store'
import Login from './pages/Login'
import Shell from './components/Shell'
import Catalog from './pages/Catalog'
import Quotes from './pages/Quotes'
import QuoteDetail from './pages/QuoteDetail'
import Jobs from './pages/Jobs'
import Invoices from './pages/Invoices'
import InvoiceDetail from './pages/InvoiceDetail'
import Timesheets from './pages/Timesheets'
import Dashboard from './pages/Dashboard'
import MobileSettings from './pages/MobileSettings'
import { Inventory, InventoryCounts, PreBuilds, PurchaseOrders, Receipts, VendorQuotes } from './pages/Materials'
import { ReportPage, ReportsHub } from './pages/Reports'
import Leads from './pages/Leads'
import Recurring from './pages/Recurring'
import { WorkOrderDetail, WorkOrders } from './pages/WorkOrders'
import { DayView, MonthView, RunSheets, WeekView } from './pages/ScheduleViews'
import { CustomerDetail, Customers, Sites, Soon } from './pages/Simple'

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}

// With Supabase configured, nothing is shown until the user signs in.
function Gate() {
  const { remote, ready, session } = useAuth()
  if (!ready) return <div className="center muted">Loading…</div>
  if (remote && !session) return <Login />
  return <AppRoutes />
}

function AppRoutes() {
  return (
    <StoreProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<Dashboard />} />
            <Route path="customers" element={<Customers />} />
            <Route path="customers/:id" element={<CustomerDetail />} />
            <Route path="sites" element={<Sites />} />
            <Route path="quotes" element={<Quotes />} />
            <Route path="quotes/:id" element={<QuoteDetail />} />
            <Route path="jobs" element={<Jobs />} />
            <Route path="invoices" element={<Invoices key="unpaid" initial="unpaid" />} />
            <Route path="invoices/paid" element={<Invoices key="paid" initial="paid" />} />
            <Route path="invoices/all" element={<Invoices key="all" initial="all" />} />
            <Route path="invoices/payments" element={<Invoices key="payments" initial="payments" />} />
            <Route path="invoices/retainages" element={<Invoices key="retainages" initial="retainages" />} />
            <Route path="invoices/credits" element={<Invoices key="credits" initial="credits" />} />
            <Route path="invoices/:id" element={<InvoiceDetail />} />
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
            <Route path="materials/vendor-quotes" element={<VendorQuotes />} />
            <Route path="materials/receipts" element={<Receipts />} />
            <Route path="reports" element={<ReportsHub />} />
            <Route path="reports/:id" element={<ReportPage />} />
            <Route path="materials/catalog" element={<Catalog />} />
            <Route path="soon/:slug" element={<Soon />} />
            <Route path="*" element={<Soon />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </StoreProvider>
  )
}
