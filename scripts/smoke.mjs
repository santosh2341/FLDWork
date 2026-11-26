// Smoke test: builds nothing itself; run `npm run smoke` (build + this script).
// Starts `vite preview`, opens the app in local demo mode (a fresh browser = the seed data) and walks the main workflow:
// quote → approve → job → progress claim → job cost → book on the schedule, then checks every page loads without
// errors and that no page scrolls sideways at phone width. Exits 1 on the first failure, with a screenshot in scripts/smoke-output/.
//
// Browser: Playwright's own Chromium when installed (`npx playwright install chromium`), otherwise Edge or Chrome on this machine.
// Override with SMOKE_BROWSER=chromium|msedge|chrome. SMOKE_URL=http://… tests an already-running server instead.
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { chromium } from 'playwright'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'scripts', 'smoke-output')
const PORT = 4176
const BASE = process.env.SMOKE_URL ?? `http://localhost:${PORT}`

const ROUTES = [
  '/', '/my-day', '/customers', '/customers/c1', '/customers/c1/statement', '/assets', '/sites', '/quotes', '/quotes/1290',
  '/quotes/1290/print', '/jobs', '/invoices', '/invoices/paid', '/invoices/all', '/invoices/payments', '/invoices/retainages',
  '/invoices/credits', '/schedules/timesheets', '/schedules/day', '/schedules/week', '/schedules/month', '/schedules/run-sheets',
  '/schedules/work-orders', '/leads', '/recurring', '/settings/general', '/settings/statuses', '/settings/audits',
  '/settings/invoicing', '/settings/team', '/materials/inventory', '/materials/counts', '/materials/pre-builds',
  '/materials/purchase-orders', '/materials/vendor-quotes', '/materials/receipts', '/materials/catalog', '/reports',
  '/reports/aged-receivables', '/reports/profit-loss-job', '/reports/job-profitability', '/reports/customer-profitability',
  '/settings/employees',
]

let step = 'start'
const log = (msg) => console.log(`  ✓ ${msg}`)
const fail = (msg) => { throw new Error(msg) }

async function startServer() {
  if (process.env.SMOKE_URL) return null
  const vite = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js')
  const proc = spawn(process.execPath, [vite, 'preview', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  proc.stdout.on('data', (d) => { output += d })
  proc.stderr.on('data', (d) => { output += d })
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(BASE)).ok) return proc } catch { /* not up yet */ }
    if (proc.exitCode != null) break
    await new Promise((r) => setTimeout(r, 250))
  }
  proc.kill()
  fail(`vite preview did not start on ${BASE}. Did you run "npm run build" first?\n${output}`)
}

async function launch() {
  const wanted = process.env.SMOKE_BROWSER
  const tries = wanted ? [wanted] : ['chromium', 'msedge', 'chrome']
  const errors = []
  for (const name of tries) {
    try {
      return await chromium.launch(name === 'chromium' ? {} : { channel: name })
    } catch (e) {
      errors.push(`${name}: ${String(e.message).split('\n')[0]}`)
    }
  }
  fail(`No browser could start. Install one with "npx playwright install chromium".\n${errors.join('\n')}`)
}

// Collect page crashes and console errors; a smoke run should have none.
function watch(page) {
  const problems = []
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console error: ${m.text()}`) })
  return problems
}

async function go(page, route) {
  await page.goto(BASE + route)
  await page.locator('main').first().waitFor()
  await page.waitForTimeout(250) // let the page-in animation settle
}

async function workflow(page) {
  step = 'customer accepts quote 1290 online'
  await go(page, '/quotes/1290')
  await page.getByRole('button', { name: 'Create link' }).click()
  const url = await page.locator('.qlink-url').inputValue()
  if (!/\/q\/[0-9a-f]{64}$/.test(url)) fail(`link looks wrong: ${url}`)
  if ((await page.locator('select:has(option[value="approved"])').inputValue()) !== 'sent') fail('creating a link should mark the quote as sent')
  const customer = await page.context().newPage()
  await customer.goto(url)
  await customer.getByRole('button', { name: 'Accept quote' }).waitFor()
  const shown = await customer.locator('body').innerText()
  if (/Materials cost|markup|PRIVATE/i.test(shown)) fail('the customer page shows costs, markups or private notes')
  await customer.getByPlaceholder('e.g. Tom Bixler').fill('Smoke Customer')
  await customer.getByRole('button', { name: 'Accept quote' }).click()
  await customer.getByText('Tick the box').waitFor({ timeout: 5000 }).catch(() => fail('accepting without ticking the box should be refused'))
  await customer.getByRole('checkbox').check()
  await customer.getByRole('button', { name: 'Accept quote' }).click()
  await customer.getByText('Quote accepted').waitFor({ timeout: 5000 }).catch(() => fail('accepting did not confirm'))
  await customer.close()
  await go(page, '/quotes/1290')
  if ((await page.locator('select:has(option[value="approved"])').inputValue()) !== 'approved') fail('the quote should be approved after the customer accepted')
  await page.getByText('Accepted online by Smoke Customer').first().waitFor({ timeout: 5000 }).catch(() => fail('the timeline should say who accepted online'))
  log('customer accepted the quote online and it is approved')

  step = 'customer portal'
  await go(page, '/customers/c3')
  await page.getByRole('button', { name: 'Create portal link' }).click()
  const portalUrl = await page.locator('.qlink-url').inputValue()
  if (!/\/p\/[0-9a-f]{64}$/.test(portalUrl)) fail(`portal link looks wrong: ${portalUrl}`)
  const visitor = await page.context().newPage()
  await visitor.goto(portalUrl)
  await visitor.getByText('Balance owing').waitFor({ timeout: 8000 }).catch(() => fail('the customer portal did not load'))
  if (/Materials cost|markup|PRIVATE/i.test(await visitor.locator('body').innerText())) fail('the portal shows costs, markups or private notes')
  await visitor.getByRole('tab', { name: /^Quotes/ }).click()
  await visitor.getByText('Quote #1290').waitFor({ timeout: 5000 }).catch(() => fail('the portal should list quote 1290'))
  await visitor.getByRole('tab', { name: 'Statement' }).click()
  await visitor.getByText('Total owing (inc GST)').waitFor({ timeout: 5000 }).catch(() => fail('the portal statement did not show'))
  await visitor.close()
  log('customer portal shows quotes and statement')

  step = 'quote PDF'
  await go(page, '/quotes/1290/print')
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download PDF' }).click()])
  if (download.suggestedFilename() !== 'Quote-1290.pdf') fail(`PDF name should be Quote-1290.pdf, got ${download.suggestedFilename()}`)
  const stream = await download.createReadStream()
  const pdfHead = await new Promise((resolve) => stream.once('data', (c) => { resolve(c.subarray(0, 5).toString()); stream.destroy() }))
  if (pdfHead !== '%PDF-') fail('downloaded file is not a PDF')
  log('quote PDF downloads')

  step = 'approve quote 1290'
  await go(page, '/quotes/1290')
  if ((await page.locator('select:has(option[value="approved"])').inputValue()) !== 'approved') await page.locator('select:has(option[value="approved"])').selectOption('approved')
  await page.getByRole('button', { name: 'Create job' }).click()
  await page.waitForURL(/\/jobs\?job=\d+$/)
  const jobId = new URL(page.url()).searchParams.get('job')
  // the new job is listed first and highlighted
  const jobLink = page.locator('tbody tr.row-focus').first().getByRole('link', { name: 'Job cost' })
  await jobLink.waitFor()
  const costHref = await jobLink.getAttribute('href')
  if (!costHref?.includes(`/jobs/${jobId}/`)) fail(`highlighted row is not job ${jobId} (${costHref})`)
  log(`quote approved and job ${jobId} created, shown first`)

  step = 'progress claim'
  await page.getByRole('button', { name: 'Bill in stages' }).click()
  await page.locator('input[type=number]').first().fill('30')
  await page.getByRole('button', { name: 'Create claim' }).click()
  await page.waitForURL('**/invoices/*')
  await page.getByText('Deposit · 30%').first().waitFor({ timeout: 5000 }).catch(() => fail('claim invoice does not show "Deposit · 30%"'))
  const head = await page.locator('main').innerText()
  if (!head.includes('$1,923.22')) fail('30% claim on quote 1290 should total $1,923.22 inc GST')
  log('30% deposit claim invoiced for $1,923.22')

  step = 'job cost'
  await go(page, costHref)
  await page.getByPlaceholder('e.g. Reece Plumbing').fill('Smoke Supplies')
  await page.getByPlaceholder('0.00').fill('1500')
  await page.getByPlaceholder(/^e\.g\. 20 m/).fill('Cable and fittings')
  await page.getByRole('button', { name: 'Add cost' }).click()
  await page.getByText('Smoke Supplies').waitFor()
  const hero = await page.locator('.jc-hero').innerText()
  if (!hero.includes('$1,500.00')) fail('actual cost should be $1,500.00 after adding a $1,500 cost')
  if (!hero.includes('Profit so far')) fail('profit label should read "Profit so far" once a cost is recorded')
  log('job cost recorded and profit updated')

  step = 'employee hourly cost'
  await go(page, '/settings/employees')
  const rate = page.getByLabel(/^Hourly cost for /).first()
  await rate.fill('60')
  await page.getByRole('button', { name: 'Save' }).first().click()
  await page.getByText('Saved').first().waitFor({ timeout: 5000 }).catch(() => fail('saving an hourly cost did not say "Saved"'))
  log('hourly cost saved in Settings → Employees')

  step = 'add and deactivate an employee'
  await page.getByLabel('New employee name').fill('Smoke Subbie')
  await page.getByRole('button', { name: 'Add employee' }).click()
  const subbie = page.locator('tbody tr', { has: page.locator('input[value="Smoke Subbie"]') })
  await subbie.waitFor({ timeout: 5000 }).catch(() => fail('a new employee did not appear in the list'))
  await subbie.getByRole('button', { name: 'Mark inactive' }).click()
  await go(page, '/schedules/day')
  if (await page.getByRole('heading', { name: 'Smoke Subbie' }).count()) fail('an inactive employee still shows in Day view')
  log('employee added, marked inactive and hidden from the schedule')

  step = 'in-page confirm dialog'
  await go(page, '/materials/catalog')
  const partRows = await page.locator('main tbody tr').count()
  await page.getByRole('button', { name: 'Delete' }).first().click()
  const dialog = page.getByRole('alertdialog')
  await dialog.waitFor({ timeout: 5000 }).catch(() => fail('deleting a part should ask in an in-page dialog'))
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  if ((await page.locator('main tbody tr').count()) !== partRows) fail('cancelling the dialog should keep the part')
  log('delete asks in an in-page dialog and Cancel keeps the part')

  step = 'purchase order for the job'
  await go(page, '/materials/purchase-orders')
  await page.getByPlaceholder('Vendor (pick or type) *').fill('Smoke Electrical')
  await page.getByLabel('For job').selectOption(jobId)
  await page.getByRole('button', { name: '+ Line' }).click()
  const line = page.locator('.qrow').first()
  await line.locator('select').selectOption({ index: 1 })
  await line.locator('input[type=number]').first().fill('2')
  await page.getByRole('button', { name: 'Create PO' }).click()
  const poCard = page.locator('.card', { hasText: 'Smoke Electrical' }).first()
  await poCard.getByRole('button', { name: 'Mark as ordered' }).click()
  await poCard.locator('tbody input[type=number]').first().fill('2')
  await poCard.getByRole('button', { name: 'Receive items' }).click()
  await poCard.getByText(`For job ${jobId}`).waitFor({ timeout: 5000 }).catch(() => fail('received job PO should show "For job …"'))
  await go(page, costHref)
  await page.getByText(/^Received on PO \d+/).first().waitFor({ timeout: 5000 }).catch(() => fail('goods received on the job PO were not added to the job cost'))
  log('job PO received and its cost posted to the job')

  step = 'book on schedule'
  await go(page, '/schedules/day')
  await page.locator('.dnd-chips .dnd-item', { hasText: jobId }).click()
  const sheet = page.getByRole('dialog', { name: 'Book job' })
  await sheet.waitFor()
  await sheet.getByRole('button', { name: 'Book it' }).click()
  const note = await page.locator('.dnd-msg').innerText()
  if (!note.includes('is now with')) fail(`booking message missing, got: ${note}`)
  await go(page, '/jobs')
  const status = await page.locator('select:has(option[value="scheduled"])').first().inputValue()
  if (status !== 'scheduled') fail(`job should be scheduled after booking, is ${status}`)
  log('job booked from the waiting list and marked scheduled')
}

async function sweep(page, problems, width) {
  step = `page sweep at ${width}px`
  const wide = []
  for (const r of ROUTES) {
    await go(page, r)
    const text = await page.locator('main').innerText()
    if (/Not built yet|Something went wrong/.test(text)) fail(`${r} shows: ${text.slice(0, 80)}`)
    const w = await page.evaluate(() => document.documentElement.scrollWidth)
    if (w > width + 1) wide.push(`${r} (${w}px)`)
  }
  if (problems.length) fail(`errors while loading pages:\n${[...new Set(problems)].join('\n')}`)
  if (wide.length) fail(`pages wider than the screen at ${width}px: ${wide.join(', ')}`)
  log(`${ROUTES.length} pages load cleanly at ${width}px`)
}

let server = null
let browser = null
let page = null
let code = 0
try {
  console.log(`Fieldwork smoke test → ${BASE}`)
  server = await startServer()
  browser = await launch()
  for (const [label, viewport] of [['desktop', { width: 1366, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
    console.log(`${label} (${viewport.width}px)`)
    const context = await browser.newContext({ viewport, isMobile: label === 'phone', hasTouch: label === 'phone' })
    page = await context.newPage()
    const problems = watch(page)
    await workflow(page)
    await sweep(page, problems, viewport.width)
    await context.close()
  }
  console.log('Smoke test passed.')
} catch (e) {
  code = 1
  console.error(`\n✗ Failed during "${step}": ${e.message}`)
  if (page && !page.isClosed()) {
    mkdirSync(outDir, { recursive: true })
    const file = path.join(outDir, `failure-${Date.now()}.png`)
    await page.screenshot({ path: file, fullPage: true }).catch(() => {})
    console.error(`  screenshot: ${file}`)
  }
} finally {
  await browser?.close()
  server?.kill()
}
process.exit(code)
