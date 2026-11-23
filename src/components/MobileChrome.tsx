import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import Icon, { Logo } from './Icon'
import type { IconName } from './Icon'

export interface NavSection { label: string; icon: IconName; to: string; columns: { heading?: string; links: { label: string; to: string }[] }[] }
export interface SearchHit { group: string; label: string; to: string }

interface Props {
  backLabel: string
  backTo: string | null
  nav: NavSection[]
  company: string
  who: { name: string; role: string } | null
  notices: { text: string; to: string }[]
  q: string
  setQ: (v: string) => void
  results: SearchHit[]
  theme: 'light' | 'dark'
  toggleTheme: () => void
  openTour: () => void
  signOut?: () => void
  canWrite: boolean
}

const QUICK: { label: string; hint: string; to: string; icon: IconName }[] = [
  { label: 'New quote', hint: 'Price a job for a customer', to: '/quotes?new=1', icon: 'quote' },
  { label: 'New customer', hint: 'Add a customer and site address', to: '/customers?new=1', icon: 'users' },
  { label: 'New lead', hint: 'Capture an enquiry', to: '/leads?new=1', icon: 'sparkles' },
  { label: 'New equipment', hint: 'Add a unit to the register', to: '/assets?new=1', icon: 'wrench' },
]

// Phone layout: slim title bar, bottom tab bar with a quick-create button, and full-screen sheets for search, alerts and the menu.
export default function MobileChrome(p: Props) {
  const loc = useLocation()
  const nav = useNavigate()
  const [sheet, setSheet] = useState<'' | 'create' | 'more' | 'search' | 'alerts'>('')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => setSheet(''), [loc.pathname, loc.search])
  useEffect(() => { if (sheet === 'search') setTimeout(() => input.current?.focus(), 50) }, [sheet])
  useEffect(() => {
    document.body.style.overflow = sheet ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [sheet])

  const at = (prefix: string) => (prefix === '/' ? loc.pathname === '/' : loc.pathname === prefix || loc.pathname.startsWith(prefix + '/'))
  const tabs: { label: string; to: string; icon: IconName; on: boolean }[] = [
    { label: 'Home', to: '/', icon: 'home', on: at('/') },
    { label: 'Today', to: '/my-day', icon: 'calendar', on: at('/my-day') },
    { label: 'Jobs', to: '/jobs', icon: 'wrench', on: at('/jobs') },
  ]

  return (
    <div className="m-chrome">
      <header className="m-bar">
        {p.backTo ? (
          <button className="m-back" onClick={() => (window.history.length > 1 ? nav(-1) : nav(p.backTo as string))}><Icon name="back" size={22} />{p.backLabel}</button>
        ) : (
          <Link to="/" className="m-brand"><Logo size={30} id="fldlogo-m" /><span>{p.company || 'Fieldwork'}</span></Link>
        )}

        <button className="m-iconbtn" onClick={() => setSheet('search')} aria-label="Search"><Icon name="search" /></button>
        <button className="m-iconbtn" onClick={() => setSheet('alerts')} aria-label={`Alerts${p.notices.length ? `, ${p.notices.length} new` : ''}`}>
          <Icon name="bell" />{p.notices.length > 0 && <span className="m-dot">{p.notices.length}</span>}
        </button>
      </header>

      <nav className="m-tabs" aria-label="Main">
        {tabs.slice(0, 2).map((t) => (
          <Link key={t.to} to={t.to} className={`m-tab ${t.on ? 'on' : ''}`} aria-current={t.on ? 'page' : undefined}><Icon name={t.icon} size={22} /><span>{t.label}</span></Link>
        ))}
        <button className="m-fab" onClick={() => setSheet('create')} aria-label="Create new" disabled={!p.canWrite}><Icon name="plus" size={26} /></button>
        <Link to={tabs[2].to} className={`m-tab ${tabs[2].on ? 'on' : ''}`} aria-current={tabs[2].on ? 'page' : undefined}><Icon name={tabs[2].icon} size={22} /><span>{tabs[2].label}</span></Link>
        <button className={`m-tab ${sheet === 'more' ? 'on' : ''}`} onClick={() => setSheet('more')}><Icon name="grid" size={22} /><span>More</span></button>
      </nav>

      {sheet && <div className="m-scrim" onClick={() => setSheet('')} />}

      {sheet === 'create' && (
        <div className="m-sheet" role="dialog" aria-label="Create new">
          <div className="m-grab" />
          <h2>Create</h2>
          {QUICK.map((a) => (
            <Link key={a.label} to={a.to} className="m-action">
              <span className="m-action-ico"><Icon name={a.icon} size={20} /></span>
              <span><b>{a.label}</b><small>{a.hint}</small></span>
              <Icon name="chevron" size={18} />
            </Link>
          ))}
        </div>
      )}

      {sheet === 'alerts' && (
        <div className="m-sheet" role="dialog" aria-label="Alerts">
          <div className="m-grab" />
          <h2>Needs attention</h2>
          {p.notices.length === 0 && <p className="m-empty">Nothing needs attention right now.</p>}
          {p.notices.map((n) => (
            <Link key={n.text} to={n.to} className="m-action"><span><b>{n.text}</b></span><Icon name="chevron" size={18} /></Link>
          ))}
        </div>
      )}

      {sheet === 'search' && (
        <div className="m-full" role="dialog" aria-label="Search">
          <div className="m-searchbar">
            <Icon name="search" size={18} />
            <input ref={input} value={p.q} onChange={(e) => p.setQ(e.target.value)} placeholder="Customers, sites, quotes, jobs, parts" inputMode="search" enterKeyHint="search"
              onKeyDown={(e) => { if (e.key === 'Enter' && p.results[0]) { nav(p.results[0].to); p.setQ('') } }} />
            <button className="m-text-btn" onClick={() => { p.setQ(''); setSheet('') }}>Cancel</button>
          </div>
          <div className="m-results">
            {!p.q.trim() && <p className="m-empty">Search by customer name, contact, phone, address, quote or job number, or part number.</p>}
            {p.q.trim() && p.results.length === 0 && <p className="m-empty">No matches for “{p.q.trim()}”.</p>}
            {p.results.map((r) => (
              <Link key={r.group + r.to + r.label} to={r.to} className="m-hit" onClick={() => p.setQ('')}><small>{r.group}</small><span>{r.label}</span></Link>
            ))}
          </div>
        </div>
      )}

      {sheet === 'more' && (
        <div className="m-full m-more" role="dialog" aria-label="Menu">
          <div className="m-more-head">
            <div className="m-who">
              <span className="m-avatar">{(p.who?.name || p.company || 'F').slice(0, 1).toUpperCase()}</span>
              <div><b>{p.who?.name || p.company}</b><small>{p.who ? `${p.who.role} · ${p.company}` : 'Demo mode'}</small></div>
            </div>
            <button className="m-iconbtn" onClick={() => setSheet('')} aria-label="Close menu"><Icon name="close" /></button>
          </div>
          <div className="m-more-body">
            {p.nav.filter((n) => !['Dashboard', 'My Day'].includes(n.label)).map((n) => {
              const links = n.columns.flatMap((c) => c.links)
              return (
                <section key={n.label}>
                  <h3><Icon name={n.icon} size={16} />{n.label}</h3>
                  <div className="m-links">
                    {(links.length ? links : [{ label: n.label, to: n.to }]).map((l) => (
                      <Link key={l.to + l.label} to={l.to} className={`m-link ${at(l.to.split('?')[0]) && l.to.split('?')[0] !== '/' ? 'on' : ''}`}>{l.label}</Link>
                    ))}
                  </div>
                </section>
              )
            })}
            <section>
              <h3><Icon name="sliders" size={16} />This device</h3>
              <div className="m-links">
                <button className="m-link" onClick={p.toggleTheme}>{p.theme === 'dark' ? 'Light mode' : 'Dark mode'}</button>
                <button className="m-link" onClick={() => { setSheet(''); p.openTour() }}>Product tour</button>
                {p.signOut && <button className="m-link danger" onClick={p.signOut}>Sign out</button>}
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  )
}
