import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const STEPS = [
  { to: '/', title: 'Dashboard', text: 'Start the day here: alerts, reminders, the schedule and a map of today\'s jobs.' },
  { to: '/quotes', title: 'Quotes', text: 'Build quotes from cost centers, parts and labor, and check margins before sending.' },
  { to: '/jobs', title: 'Jobs', text: 'Approved quotes become jobs. Complete a job to create its invoice.' },
  { to: '/schedules/timesheets', title: 'Timesheets', text: 'Schedule people on jobs and lock past timesheets for payroll.' },
  { to: '/invoices', title: 'Invoices', text: 'Track unpaid invoices by age and record payments.' },
  { to: '/materials/inventory', title: 'Materials', text: 'Catalog, pre-builds, stock, purchase orders and counts.' },
  { to: '/settings/audits', title: 'Audits', text: 'Design safety and quality checklists for technicians.' },
  { to: '/reports', title: 'Reports', text: 'Ten ready-made reports with CSV export and printing.' },
]

export default function Tour({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0)
  const nav = useNavigate()
  const go = (n: number) => {
    setI(n)
    nav(STEPS[n].to)
  }
  const s = STEPS[i]
  return (
    <div className="tour">
      <div className="tour-step">{i + 1}/{STEPS.length}</div>
      <h3>{s.title}</h3>
      <p>{s.text}</p>
      <div className="row between">
        <button disabled={i === 0} onClick={() => go(i - 1)}>Back</button>
        {i < STEPS.length - 1 ? <button className="primary" onClick={() => go(i + 1)}>Next</button> : <button className="primary" onClick={onClose}>Done</button>}
        <button onClick={onClose}>Close</button>
      </div>
    </div>
  )
}
