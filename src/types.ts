import type { AddressParts } from './lib/address'
export type QuoteStatus = 'to_be_completed' | 'sent' | 'approved' | 'declined'

export interface Customer {
  id: string
  name: string
  contactName: string
  phone: string
  email: string
  address: string // one-line version, e.g. "3/12 Smith Street, Parramatta NSW 2150"
  addressParts?: AddressParts
  lat?: number
  lng?: number
  onHold: boolean
}

export interface Site {
  id: string
  customerId: string
  name: string
  address: string
  addressParts?: AddressParts
  lat?: number
  lng?: number
  propertyType?: string // Residential, Commercial, Industrial, ...
  accessNotes?: string // gate codes, parking, induction, site contact, hours
}

export interface CatalogPart {
  id: string
  partNo: string
  description: string
  vendor: string
  category: string
  cost: number
  markupPct: number
  stock: number
}

export interface LineItem {
  id: string
  kind: 'part' | 'labour'
  partId?: string
  description: string
  quantity: number // hours for labour
  unitCost: number
  unitSell: number
}

export interface CostCenter {
  id: string
  name: string
  items: LineItem[]
}

export interface TimelineEvent {
  id: string
  type: 'System' | 'Task'
  message: string
  at: string
}

export interface QuoteTask {
  id: string
  title: string
  due: string // YYYY-MM-DD or empty
  done: boolean
}

export interface QuoteAttachment {
  id: string
  name: string
  size: number // bytes
  type: string
  dataUrl: string // kept in the browser for now; move to Supabase Storage later
  addedAt: string
}

export interface Quote {
  id: number
  customerId: string
  siteId: string
  name: string
  status: QuoteStatus
  description: string
  notes: string
  discount: number
  overheads: number
  taxRate: number
  pricesLocked: boolean
  costCenters: CostCenter[]
  timeline: TimelineEvent[]
  updatedAt: string
  tasks?: QuoteTask[]
  attachments?: QuoteAttachment[]
  forms?: string[] // ids of audits that must be completed on jobs from this quote
}

export type JobStatus = 'pending' | 'scheduled' | 'in_progress' | 'complete' | 'invoiced'

export interface Job {
  id: number
  quoteId: number
  customerId: string
  siteId: string
  name: string
  status: JobStatus
  createdAt: string
}

export interface Payment {
  id: string
  amount: number
  date: string
  method: string
}

export interface RecurringJob {
  id: string
  name: string
  quoteId: number // the quote used as the template for each generated job
  frequency: 'weekly' | 'fortnightly' | 'monthly' | 'quarterly'
  nextDue: string // YYYY-MM-DD
  lastCreated?: string
  active: boolean
}

export interface Credit {
  id: string
  amount: number
  reason: string
  date: string // YYYY-MM-DD
}

export interface LogEntry {
  id: string
  at: string // ISO timestamp
  message: string
}

export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'lost' | 'converted'

export interface Lead {
  id: string
  name: string
  contactName: string
  phone: string
  email: string
  address: string
  source: string
  status: LeadStatus
  notes: string
  createdAt: string // YYYY-MM-DD
  quoteId?: number // set once converted
}

export interface Invoice {
  id: number
  jobId: number
  customerId: string
  siteId: string
  issuedAt: string
  dueAt: string
  stage: 'draft' | 'approved' | 'sent'
  sections: CostCenter[]
  taxRate: number
  discount: number
  payments: Payment[]
  voided: boolean
  credits?: Credit[]
  notes?: string
  log?: LogEntry[]
  retainagePct?: number // percent of the total held back until released
  retainageReleased?: boolean
  claimLabel?: string // set when this invoice is one progress claim on the job
  claimPct?: number // percent of the quote this claim bills
}

export interface JobNote {
  id: string
  jobId: number
  author: string
  text: string
  at: string // ISO timestamp
}

export interface JobCost {
  id: string
  jobId: number
  date: string // YYYY-MM-DD
  kind: 'material' | 'subcontract' | 'other'
  supplier: string
  description: string
  amount: number // ex GST
  receiptId?: number | null // posted automatically when goods on a job PO were received
}

export interface AssetService {
  id: string
  jobId?: number
  date: string // yyyy-mm-dd
  notes: string
  by: string
}

export interface Asset {
  id: string
  customerId: string
  siteId?: string
  name: string // e.g. "Rooftop split system"
  category: string // HVAC, fire panel, switchboard, ...
  make: string
  model: string
  serial: string
  location: string // where on site
  installDate?: string
  warrantyUntil?: string
  intervalMonths?: number // service every N months
  lastServiced?: string
  nextDue?: string
  notes: string
  active: boolean
  services: AssetService[]
}

export interface JobPhoto {
  id: string
  jobId: number
  name: string
  author: string
  at: string
  path?: string // storage path (database mode)
  dataUrl?: string // inline image (local mode)
}

export interface ClockEntry {
  id: string
  jobId: number
  employeeId?: string
  start: string // ISO timestamp
  end?: string // set when clocked off
  approvedAt?: string | null // set when an office user approves the week's clocked hours
  approvedBy?: string
}

export interface Employee {
  id: string
  name: string
  costRate?: number | null // $/hour this person costs the business, ex GST. Only office roles receive it.
}

export interface ScheduleEntry {
  id: string
  jobId: number
  employeeId: string
  date: string // YYYY-MM-DD
  start: string // HH:MM
  end: string // HH:MM
}

export interface TimesheetLock {
  on: boolean
  until: string // YYYY-MM-DD, entries on or before are frozen
}

export interface Reminder {
  id: string
  text: string
  done: boolean
  snoozedUntil?: string // YYYY-MM-DD
}

export type AnswerType = 'yesno' | 'text' | 'number' | 'photo' | 'signature'

export interface AuditQuestion {
  id: string
  text: string
  answerType: AnswerType
  required: boolean
}

export interface AuditGroup {
  id: string
  name: string
  mandatory: boolean
  description: string
  questions: AuditQuestion[]
}

export interface Audit {
  id: string
  folder: string
  name: string
  groups: AuditGroup[]
}

export interface AuditResult {
  id: string
  auditId: string
  auditName: string
  jobId: number
  completedAt: string
  snapshot: AuditGroup[] // copy of the audit as it was when completed
  answers: Record<string, string>
}

export interface PreBuild {
  id: string
  name: string
  items: Omit<LineItem, 'id'>[]
}

export interface PoLine {
  id: string
  partId: string
  qty: number
  unitCost: number
  received: number
}

export interface PurchaseOrder {
  id: number
  vendor: string
  status: 'draft' | 'ordered' | 'received' | 'cancelled'
  createdAt: string
  jobId?: number | null // a job PO: received goods go to the job's cost instead of stock
  lines: PoLine[]
}

export interface VendorQuoteLine {
  id: string
  partId: string
  qty: number
  unitCost: number
}

export interface VendorQuote {
  id: number
  vendor: string
  status: 'requested' | 'received' | 'accepted' | 'rejected'
  createdAt: string // YYYY-MM-DD
  validUntil: string // YYYY-MM-DD or empty
  lines: VendorQuoteLine[]
  poId?: number // set when accepted
}

export interface Receipt {
  id: number
  poId: number
  date: string // YYYY-MM-DD
  lines: { partId: string; qty: number; unitCost: number }[]
}

export interface InventoryCount {
  id: string
  date: string
  applied: boolean
  lines: { partId: string; expected: number; counted: number }[]
}

export interface CompanyProfile {
  tradingName: string
  abn: string
  phone: string
  email: string
  website: string
  licence: string // trade licence number shown on documents
  address: string // one-line address in the app's standard format
  addressParts?: AddressParts
  bankName: string
  accountName: string
  bsb: string
  accountNumber: string
}

export interface AppSettings {
  companyName: string
  company?: CompanyProfile
  defaultTaxRate: number // percent, used on new quotes
  paymentTermsDays: number // used to set the due date on new invoices
  requireAuditsToComplete: boolean
  invoiceFooter: string
  jobStatusLabels: Record<JobStatus, string>
}

export interface Db {
  settings: AppSettings
  customers: Customer[]
  leads: Lead[]
  recurring: RecurringJob[]
  vendorQuotes: VendorQuote[]
  receipts: Receipt[]
  sites: Site[]
  catalog: CatalogPart[]
  quotes: Quote[]
  jobs: Job[]
  invoices: Invoice[]
  employees: Employee[]
  schedule: ScheduleEntry[]
  timesheetLock: TimesheetLock
  reminders: Reminder[]
  audits: Audit[]
  auditResults: AuditResult[]
  preBuilds: PreBuild[]
  purchaseOrders: PurchaseOrder[]
  counts: InventoryCount[]
  jobNotes: JobNote[]
  jobCosts: JobCost[]
  clock: ClockEntry[]
  jobPhotos: JobPhoto[]
  assets: Asset[]
}
