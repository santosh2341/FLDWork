import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './desktop.css'
import App from './App.tsx'

// Crash guard: if the page died during the last few seconds (the browser reloads it), start in safe mode,
// which skips the phone-layout stylesheet and the table-to-card helper so the app still opens.
let safe = false
try {
  safe = sessionStorage.getItem('fw-boot') === '1'
  sessionStorage.setItem('fw-boot', '1')
  setTimeout(() => { try { sessionStorage.removeItem('fw-boot') } catch { /* ignore */ } }, 5000)
} catch { /* storage unavailable */ }
if (safe) document.documentElement.classList.add('safe-mode')
else void import('./mobile.css')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
