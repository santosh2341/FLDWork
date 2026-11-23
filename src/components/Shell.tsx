import { useEffect, useMemo, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import Tour from './Tour'
import '../sidebar.css'
import Icon, { Logo } from './Icon'
import type { IconName } from './Icon'
import { useAuth } from '../auth'
import { daysOverdue, isUnpaid } from '../lib/invoicing'

interface Flyout {
  label: string
  icon: IconName
  to: string
  columns: { heading?: string; links: { label: string; to: string }[] }[]
}

// Sidebar structure follows guide section 1.4. Entries without a built page
// route to a placeholder.
const NAV: Flyout[] = [
  { label: 'Dashboard', icon: 'home', to: '/', columns: [] },
  { label: 'My Day', icon: 'calendar', to: '/my-day', columns: [] },
  { label: 'Customers', icon: 'users', to: '/customers', columns: [{ links: [{ label: 'All Customers', to: '/customers' }, { label: 'Sites', to: '/sites' }] }] },
  { label: 'Leads', icon: 'sparkles', to: '/leads', columns: [{ links: [{ label: 'All Leads', to: '/leads' }] }] },
  { label: 'Quotes', icon: 'quote', to: '/quotes', columns: [{ links: [{ label: 'All Quotes', to: '/quotes' }] }] },
  {
    label: 'Materials',
    icon: 'box',
    to: '/materials/catalog',
    columns: [
      { heading: 'Materials', links: [{ label: 'Catalog', to: '/materials/catalog' }, { label: 'Pre-Builds', to: '/materials/pre-builds' }, { label: 'Inventory', to: '/materials/inventory' }, { label: 'Inventory Counts', to: '/materials/counts' }] },
      { heading: 'Orders', links: [{ label: 'Purchase Orders', to: '/materials/purchase-orders' }, { label: 'Vendor Quotes', to: '/materials/vendor-quotes' }, { label: 'Receipts', to: '/materials/receipts' }] },
    ],
  },
  { label: 'Jobs', icon: 'wrench', to: '/jobs', columns: [{ links: [{ label: 'All Jobs', to: '/jobs' }] }] },
  {
    label: 'Invoices',
    icon: 'receipt',
    to: '/invoices',
    columns: [
      { heading: 'Customer', links: [{ label: 'Unpaid Invoices', to: '/invoices' }, { label: 'Paid Invoices', to: '/invoices/paid' }, { label: 'All Invoices', to: '/invoices/all' }, { label: 'Payments', to: '/invoices/payments' }, { label: 'Credits', to: '/invoices/credits' }, { label: 'Retainages', to: '/invoices/retainages' }] },
    ],
  },
  { label: 'Recurring', icon: 'refresh', to: '/recurring', columns: [{ links: [{ label: 'Recurring Jobs', to: '/recurring' }] }] },
  { label: 'Schedules', icon: 'calendar', to: '/schedules/timesheets', columns: [{ heading: 'View', links: [{ label: 'Day View', to: '/schedules/day' }, { label: 'Week View', to: '/schedules/week' }, { label: 'Month View', to: '/schedules/month' }] }, { heading: 'Timesheets', links: [{ label: 'Timesheets', to: '/schedules/timesheets' }, { label: 'Work Orders', to: '/schedules/work-orders' }, { label: 'Run Sheets', to: '/schedules/run-sheets' }] }] },
  { label: 'Settings', icon: 'sliders', to: '/settings/general', columns: [{ heading: 'Mobile Settings', links: [{ label: 'General', to: '/settings/general' }, { label: 'Statuses', to: '/settings/statuses' }, { label: 'Audits', to: '/settings/audits' }, { label: 'Invoicing', to: '/settings/invoicing' }] }] },
  { label: 'Reports', icon: 'chart', to: '/reports', columns: [{ links: [{ label: 'View Reports', to: '/reports' }] }] },
]

function crumbs(pathname: string): { label: string; to: string }[] {
  const parts = pathname.split('/').filter(Boolean)
  const out: { label: string; to: string }[] = [{ label: 'Home', to: '/' }]
  let acc = ''
  for (const p of parts) {
    acc += '/' + p
    out.push({ label: p.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase()), to: acc })
  }
  return out
}

export default function Shell() {
  const { tabs, closeTab, db, remote, profile, notice, dismissNotice } = useStore()
  const { signOut } = useAuth()
  const loc = useLocation()
  const nav = useNavigate()
  const [expanded, setExpanded] = useState(false)
  const [openKey, setOpenKey] = useState<string | null>(null) // which sidebar section is dropped down
  const [q, setQ] = useState('')
  const [bell, setBell] = useState(false)
  const [tour, setTour] = useState(false)
  const [drawer, setDrawer] = useState(false) // mobile menu
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'))
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.dataset.theme = next
    try { localStorage.setItem('fld-theme', next) } catch { /* private mode */ }
  }
  const initials = (profile?.fullName || 'U').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()

  // Close the mobile menu whenever the page changes.
  useEffect(() => setDrawer(false), [loc.pathname])

  // Which sidebar link matches the current page: the longest matching path wins.
  const { activeSection, activeTo } = useMemo(() => {
    const links = NAV.flatMap((n) => (n.columns.length ? n.columns.flatMap((c) => c.links.map((l) => ({ sec: n.label, to: l.to }))) : [{ sec: n.label, to: n.to }]))
    const p = loc.pathname
    const hit = links
      .filter((l) => (l.to === '/' ? p === '/' : p === l.to || p.startsWith(l.to + '/')))
      .sort((a, b) => b.to.length - a.to.length)[0]
    return { activeSection: hit?.sec, activeTo: hit?.to }
  }, [loc.pathname])
  // Keep the section you are in open.
  useEffect(() => {
    if (activeSection) setOpenKey(activeSection)
  }, [activeSection])

  const notices = useMemo(() => {
    const out: { text: string; to: string }[] = []
    const od = db.invoices.filter((i) => isUnpaid(i) && daysOverdue(i) > 0).length
    const low = db.catalog.filter((p) => p.stock < 5).length
    const pend = db.jobs.filter((j) => j.status === 'pending').length
    if (od) out.push({ text: `${od} overdue invoice${od > 1 ? 's' : ''}`, to: '/invoices' })
    if (low) out.push({ text: `${low} part${low > 1 ? 's' : ''} low on stock`, to: '/materials/inventory' })
    if (pend) out.push({ text: `${pend} job${pend > 1 ? 's' : ''} waiting to be scheduled`, to: '/schedules/timesheets' })
    return out
  }, [db])

  const results = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return []
    return [
      ...db.customers.filter((c) => c.name.toLowerCase().includes(s)).map((c) => ({ group: 'Customers', label: c.name, to: `/customers/${c.id}` })),
      ...db.quotes.filter((x) => `${x.id} ${x.name}`.toLowerCase().includes(s)).map((x) => ({ group: 'Quotes', label: `#${x.id} ${x.name}`, to: `/quotes/${x.id}` })),
      ...db.invoices.filter((i) => String(i.id).includes(s)).map((i) => ({ group: 'Invoices', label: `Invoice #${i.id}`, to: `/invoices/${i.id}` })),
      ...db.catalog.filter((p) => `${p.partNo} ${p.description}`.toLowerCase().includes(s)).map((p) => ({ group: 'Parts', label: `${p.partNo} ${p.description}`, to: '/materials/catalog' })),
    ].slice(0, 12)
  }, [q, db])

  return (
    <div className={`shell ${expanded ? 'expanded' : ''} ${drawer ? 'drawer-open' : ''}`}>
      {drawer && <div className="scrim" onClick={() => setDrawer(false)} />}
      <aside className="rail">
        <button className="drawer-close" onClick={() => setDrawer(false)} aria-label="Close menu">×</button>
        <Link to="/" className="logo" title="Fieldwork"><Logo size={34} /><span className="logo-text">Fieldwork</span></Link>
        {NAV.map((n) => {
          const linkCount = n.columns.reduce((a, c) => a + c.links.length, 0)
          const drop = linkCount > 1 // single-link sections are plain links
          const open = drop && openKey === n.label
          const active = activeSection === n.label
          return (
            <div key={n.label} className="rail-item-wrap">
              {drop ? (
                <button
                  className={`rail-item ${active ? 'active' : ''} ${open ? 'open' : ''}`}
                  aria-expanded={open}
                  title={n.label}
                  onClick={() => {
                    if (!expanded && !drawer) {
                      setExpanded(true) // icons only: widen the sidebar so the links are readable
                      setOpenKey(n.label)
                    } else setOpenKey(open ? null : n.label)
                  }}
                >
                  <span className="icon"><Icon name={n.icon} /></span>
                  <span className="label">{n.label}</span>
                  <span className="chev"><Icon name="down" size={16} /></span>
                </button>
              ) : (
                <Link to={n.to} className={`rail-item ${active ? 'active' : ''}`} title={n.label}>
                  <span className="icon"><Icon name={n.icon} /></span>
                  <span className="label">{n.label}</span>
                </Link>
              )}
              {drop && (
                <div className={`sub ${open ? 'open' : ''}`}>
                  <div className="sub-inner">
                    {n.columns.map((c, i) => (
                      <div key={i} className="sub-group">
                        {c.heading && c.heading !== n.label && <div className="flyout-sub">{c.heading}</div>}
                        {c.links.map((l) => (
                          <Link key={l.to + l.label} to={l.to} className={`sub-link ${activeTo === l.to ? 'active' : ''}`} tabIndex={open ? 0 : -1}>{l.label}</Link>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
        <button className="rail-toggle" onClick={() => setExpanded((e) => !e)} aria-label="Expand or collapse sidebar">
          <Icon name={expanded ? 'left' : 'right'} size={18} />
        </button>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="menu-btn icon-btn" onClick={() => setDrawer(true)} aria-label="Open menu"><Icon name="menu" /></button>
          <button className="tenant"><span className="tenant-mark">{(db.settings.companyName || 'F').slice(0, 1).toUpperCase()}</span>{db.settings.companyName} <Icon name="down" size={14} /></button>
          <div className="tabs">
            {tabs.map((t) => (
              <span key={t.path} className={`tab ${loc.pathname === t.path ? 'active' : ''}`}>
                <Link to={t.path} title={t.title}>{t.title}</Link>
                <button onClick={() => { closeTab(t.path); if (loc.pathname === t.path) nav('/quotes') }} aria-label={`Close ${t.title}`}>×</button>
              </span>
            ))}
          </div>
          <div className="search">
            <span className="search-ico"><Icon name="search" size={16} /></span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customers, quotes, parts…" />
            {results.length > 0 && (
              <div className="search-results">
                {results.map((r) => (
                  <Link key={r.group + r.label} to={r.to} onClick={() => setQ('')}>
                    <small>{r.group}</small> {r.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
          <div className="bell-wrap">
            <button className="icon-btn" onClick={() => setBell(!bell)} aria-label="Notifications"><Icon name="bell" />{notices.length > 0 && <span className="badge">{notices.length}</span>}</button>
            {bell && (
              <div className="search-results bell-list">
                {notices.length === 0 && <span className="muted pad">You're all caught up.</span>}
                {notices.map((n) => <Link key={n.text} to={n.to} onClick={() => setBell(false)}>{n.text}</Link>)}
              </div>
            )}
          </div>
          <button className="icon-btn" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} title={theme === 'dark' ? 'Light mode' : 'Dark mode'}><Icon name={theme === 'dark' ? 'sun' : 'moon'} /></button>
          <button className="icon-btn" onClick={() => setTour(true)} aria-label="Help and tour" title="Product tour"><Icon name="help" /></button>
          {remote && (
            <div className="who">
              <span className="avatar" aria-hidden="true">{initials}</span>
              <span className="who-name">{profile?.fullName || 'Signed in'}{profile && <small>{profile.role}</small>}</span>
              <button className="icon-btn" onClick={() => void signOut()} aria-label="Sign out" title="Sign out"><Icon name="logout" /></button>
            </div>
          )}
        </header>
        {notice && (
          <div className="notice" role="alert">
            <span>{notice}</span>
            <button onClick={dismissNotice} aria-label="Dismiss">×</button>
          </div>
        )}
        {tour && <Tour onClose={() => setTour(false)} />}
        <nav className="crumbs">
          {crumbs(loc.pathname).map((c, i, a) => (
            <span key={c.to}>
              {i < a.length - 1 ? <Link to={c.to}>{c.label}</Link> : <span>{c.label}</span>}
              {i < a.length - 1 && ' / '}
            </span>
          ))}
        </nav>
        <main className="page"><div key={loc.pathname} className="page-anim"><Outlet /></div></main>
      </div>
    </div>
  )
}
