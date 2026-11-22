import type {
  AppSettings, Audit, AuditResult, CatalogPart, Customer, Invoice, JobStatus, Lead, Payment, PreBuild,
  Quote, RecurringJob, ScheduleEntry, Site, VendorQuote, VendorQuoteLine,
} from './types'

// Everything the pages can do to the data. The local (browser) and remote (Supabase) stores both implement this.
// Actions that create something return a Promise, because the remote store has to wait for the database.
export interface Actions {
  addCustomer: (c: Omit<Customer, 'id'>) => Promise<string | null> // resolves to the new customer's id (null if it failed)
  updateCustomer: (c: Customer) => void
  addSite: (s: Omit<Site, 'id'>) => void
  updateSite: (s: Site) => void
  upsertPart: (p: Omit<CatalogPart, 'id'> & { id?: string }) => void
  deletePart: (id: string) => void
  createQuote: (customerId: string, siteId: string, name: string) => Promise<number>
  saveQuote: (q: Quote) => void
  createJobFromQuote: (quoteId: number) => Promise<number>
  setJobStatus: (jobId: number, status: JobStatus) => void
  createInvoiceFromJob: (jobId: number) => Promise<number>
  saveInvoice: (inv: Invoice) => void
  recordPayment: (invoiceId: number, p: Omit<Payment, 'id'>) => void
  addScheduleEntry: (e: Omit<ScheduleEntry, 'id'>) => Promise<string | null> // resolves to an error message
  deleteScheduleEntry: (id: string) => Promise<string | null>
  setTimesheetLock: (on: boolean, until: string) => void
  addReminder: (text: string) => void
  toggleReminder: (id: string) => void
  snoozeReminder: (id: string, until: string) => void
  upsertAudit: (a: Audit) => void
  deleteAudit: (id: string) => void
  saveAuditResult: (r: Omit<AuditResult, 'id' | 'completedAt'>) => void
  upsertPreBuild: (p: PreBuild) => void
  createPO: (vendor: string, lines: { partId: string; qty: number; unitCost: number }[]) => Promise<number>
  setPOStatus: (id: number, status: 'ordered') => void
  receivePO: (id: number, received: Record<string, number>) => void
  createCount: () => Promise<string>
  setCountLine: (countId: string, partId: string, counted: number) => void
  applyCount: (countId: string) => void
  addCredit: (invoiceId: number, amount: number, reason: string) => void
  addLead: (l: Omit<Lead, 'id' | 'createdAt' | 'status'>) => void
  updateLead: (l: Lead) => void
  updateSettings: (s: AppSettings) => void
  createVendorQuote: (vendor: string, validUntil: string, lines: Omit<VendorQuoteLine, 'id'>[]) => Promise<number>
  saveVendorQuote: (q: VendorQuote) => void
  acceptVendorQuote: (id: number) => Promise<number> // creates a draft purchase order, resolves to its id (0 on failure)
  addRecurring: (r: Omit<RecurringJob, 'id' | 'lastCreated'>) => void
  updateRecurring: (r: RecurringJob) => void
  runRecurring: (ids: string[]) => Promise<number> // creates one pending job per active schedule; resolves to how many
  convertLead: (leadId: string) => Promise<number> // resolves to the new quote id (0 if the lead is missing)
}
