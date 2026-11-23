import type { Db } from '../types'

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)

export const seed: Db = {
  recurring: [],
  vendorQuotes: [],
  receipts: [],
  settings: {
    companyName: 'Demo Company',
    defaultTaxRate: 10,
    paymentTermsDays: 30,
    requireAuditsToComplete: false,
    invoiceFooter: '',
    jobStatusLabels: { pending: 'Pending', scheduled: 'Scheduled', in_progress: 'In Progress', complete: 'Complete', invoiced: 'Invoiced' },
  },
  leads: [
    { id: 'ld1', name: 'Northgate Dental', contactName: 'Sam Ortiz', phone: '0455 555 310', email: 'sam@northgate.example', address: '5 High St, Northcote', source: 'Website', status: 'new', notes: 'Wants CCTV at two entrances.', createdAt: daysAgo(2) },
    { id: 'ld2', name: 'Kestrel Logistics', contactName: 'Amy Chen', phone: '0466 555 742', email: 'amy@kestrel.example', address: '9 Depot Way, Laverton', source: 'Referral', status: 'contacted', notes: 'Warehouse lighting upgrade, site visit booked.', createdAt: daysAgo(6) },
  ],
  customers: [
    { id: 'c1', name: 'ABC Builders', contactName: 'Dana Whitlock', phone: '0412 555 019', email: 'dana@abcbuilders.example', address: '14 Foundry Rd, Dandenong', onHold: false },
    { id: 'c2', name: 'Harbourview Apartments', contactName: 'Priya Nair', phone: '0433 555 207', email: 'priya@harbourview.example', address: '2 Quay St, Port Melbourne', onHold: false },
    { id: 'c3', name: 'Bixler Multimedia', contactName: 'Tom Bixler', phone: '0400 555 881', email: 'tom@bixler.example', address: '88 Park Ln, Richmond', onHold: true },
  ],
  sites: [
    { id: 's1', customerId: 'c1', name: 'Home Office', address: '14 Foundry Rd, Dandenong', lat: -37.9875, lng: 145.2147 },
    { id: 's2', customerId: 'c1', name: 'Building A', address: '20 Foundry Rd, Dandenong', lat: -37.9881, lng: 145.2169 },
    { id: 's3', customerId: 'c2', name: 'Tower 1', address: '2 Quay St, Port Melbourne', lat: -37.8396, lng: 144.9393 },
    { id: 's4', customerId: 'c3', name: 'Studio', address: '88 Park Ln, Richmond', lat: -37.8183, lng: 144.9985 },
  ],
  catalog: [
    { id: 'p1', partNo: 'BB-3P-100', description: 'Busbar 3-phase 100A', vendor: 'Voltline', category: 'Switchgear', cost: 142, markupPct: 35, stock: 12 },
    { id: 'p2', partNo: 'HU-BTN-01', description: 'Hold-up button', vendor: 'SecureCo', category: 'Security', cost: 38.5, markupPct: 40, stock: 40 },
    { id: 'p3', partNo: 'CN-RJ45-50', description: 'RJ45 connectors (pack of 50)', vendor: 'NetSupply', category: 'Cabling', cost: 21, markupPct: 50, stock: 85 },
    { id: 'p4', partNo: 'CAM-4K-DOME', description: '4K dome camera', vendor: 'SecureCo', category: 'CCTV', cost: 189, markupPct: 38, stock: 9 },
    { id: 'p5', partNo: 'BAT-12V-7', description: 'Battery 12V 7Ah', vendor: 'PowerCell', category: 'Power', cost: 24, markupPct: 45, stock: 3 },
    { id: 'p6', partNo: 'LMP-LED-18', description: 'LED lamp 18W', vendor: 'Lumen', category: 'Lighting', cost: 6.8, markupPct: 60, stock: 200 },
  ],
  quotes: [
    {
      id: 1290,
      customerId: 'c3',
      siteId: 's4',
      name: 'Quote for Multimedia',
      status: 'to_be_completed',
      description: 'CCTV installation and lighting upgrade across the studio.',
      notes: 'Customer prefers works outside business hours.',
      discount: 0,
      overheads: 250,
      taxRate: 10,
      pricesLocked: false,
      updatedAt: new Date().toISOString(),
      timeline: [{ id: 't1', type: 'System', message: 'Quote created', at: new Date().toISOString() }],
      costCenters: [
        {
          id: 'cc1',
          name: 'CCTV Installation',
          items: [
            { id: 'l1', kind: 'part', partId: 'p4', description: '4K dome camera', quantity: 6, unitCost: 189, unitSell: 260.82 },
            { id: 'l2', kind: 'part', partId: 'p3', description: 'RJ45 connectors (pack of 50)', quantity: 2, unitCost: 21, unitSell: 31.5 },
            { id: 'l3', kind: 'labour', description: 'Electrical', quantity: 20, unitCost: 55, unitSell: 90 },
            { id: 'l4', kind: 'labour', description: 'Project Manager', quantity: 20, unitCost: 70, unitSell: 120 },
          ],
        },
      ],
    },
  ],  employees: [
    { id: 'e1', name: 'Jordan McDonald' },
    { id: 'e2', name: 'Luke Zancanaro' },
  ],
  schedule: [],
  timesheetLock: { on: false, until: '' },
  reminders: [{ id: 'r1', text: 'Follow up on Quote #1290 with Bixler Multimedia', done: false }],
  audits: [
    {
      id: 'a1',
      folder: 'Job Safety Analysis',
      name: 'Electrical risks: checklist before work',
      groups: [
        {
          id: 'g1',
          name: 'Part 1: Initial assessment',
          mandatory: true,
          description: 'Confirm the work can start safely.',
          questions: [
            { id: 'q1', text: 'Can the work be done while the equipment is de-energised?', answerType: 'yesno', required: true },
            { id: 'q2', text: 'Site photo of the work area', answerType: 'photo', required: false },
          ],
        },
        {
          id: 'g2',
          name: 'Part 2: Work de-energised',
          mandatory: false,
          description: 'Isolation and testing steps.',
          questions: [
            { id: 'q3', text: 'Isolation point locked and tagged?', answerType: 'yesno', required: true },
            { id: 'q4', text: 'Technician signature', answerType: 'signature', required: true },
          ],
        },
      ],
    },
  ],
  auditResults: [],
  preBuilds: [
    {
      id: 'pb1',
      name: 'CCTV camera install (per camera)',
      items: [
        { kind: 'part', partId: 'p4', description: '4K dome camera', quantity: 1, unitCost: 189, unitSell: 260.82 },
        { kind: 'part', partId: 'p3', description: 'RJ45 connectors (pack of 50)', quantity: 1, unitCost: 21, unitSell: 31.5 },
        { kind: 'labour', description: 'Electrical', quantity: 2, unitCost: 55, unitSell: 90 },
      ],
    },
  ],
  purchaseOrders: [],
  counts: [],
  jobNotes: [],
  clock: [],
  jobPhotos: [],
  jobs: [],
  invoices: [
    {
      id: 1743,
      jobId: 0,
      customerId: 'c1',
      siteId: 's1',
      issuedAt: daysAgo(130),
      dueAt: daysAgo(100),
      stage: 'approved',
      taxRate: 10,
      discount: 0,
      voided: false,
      payments: [],
      sections: [
        {
          id: 'is1',
          name: 'Building A - Lobby 1',
          items: [
            { id: 'il1', kind: 'part', description: 'LED lamp 18W', quantity: 24, unitCost: 6.8, unitSell: 10.88 },
            { id: 'il2', kind: 'labour', description: 'Electrical', quantity: 8, unitCost: 55, unitSell: 90 },
          ],
        },
      ],
    },
  ],
}
