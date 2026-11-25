// Draws a DocModel (lib/docs.ts) as an A4 PDF. Loaded on demand (import('../lib/pdf')) so pdf-lib stays out of the
// first page load. Uses the built-in Helvetica fonts: characters they cannot draw (emoji, some symbols) become "?".
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { PDFFont, PDFPage } from 'pdf-lib'
import type { DocModel } from './docs'

const A4 = { w: 595.28, h: 841.89 }
const M = 46 // page margin
const INK = rgb(0.06, 0.09, 0.16)
const MUTED = rgb(0.33, 0.39, 0.47)
const LINE = rgb(0.8, 0.84, 0.88)
const BRAND = rgb(0.059, 0.463, 0.431) // #0f766e
const PALE = rgb(0.94, 0.96, 0.97)

export async function docPdf(doc: DocModel): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(`${doc.title} #${doc.number}`)
  pdf.setAuthor(doc.company.name)
  pdf.setCreator('Fieldwork')
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)

  // Replace anything the standard font cannot encode, so one odd character never breaks the whole PDF.
  const ok = new Map<string, boolean>()
  const safe = (s: string, f: PDFFont) =>
    Array.from(s.replace(/\t/g, ' ')).map((ch) => {
      const k = ch + (f === bold ? 'b' : 'r')
      if (!ok.has(k)) { try { f.widthOfTextAtSize(ch, 10); ok.set(k, true) } catch { ok.set(k, false) } }
      return ok.get(k) ? ch : '?'
    }).join('')

  let page: PDFPage = pdf.addPage([A4.w, A4.h])
  let y = A4.h - M
  const pages: PDFPage[] = [page]

  const text = (s: string, x: number, size: number, opts: { font?: PDFFont; color?: ReturnType<typeof rgb>; right?: boolean } = {}) => {
    const f = opts.font ?? regular
    const t = safe(s, f)
    const w = f.widthOfTextAtSize(t, size)
    page.drawText(t, { x: opts.right ? x - w : x, y, size, font: f, color: opts.color ?? INK })
  }
  const wrap = (s: string, width: number, size: number, f: PDFFont = regular): string[] => {
    const out: string[] = []
    for (const para of safe(s, f).split(/\r?\n/)) {
      let line = ''
      for (const word of para.split(/\s+/)) {
        const next = line ? `${line} ${word}` : word
        if (f.widthOfTextAtSize(next, size) <= width) { line = next; continue }
        if (line) out.push(line)
        // a single word longer than the column is cut into pieces
        let w = word
        while (f.widthOfTextAtSize(w, size) > width && w.length > 1) {
          let n = w.length
          while (n > 1 && f.widthOfTextAtSize(w.slice(0, n), size) > width) n--
          out.push(w.slice(0, n)); w = w.slice(n)
        }
        line = w
      }
      out.push(line)
    }
    return out
  }
  const newPage = () => {
    page = pdf.addPage([A4.w, A4.h]); pages.push(page)
    y = A4.h - M
    text(`${doc.title} #${doc.number} (continued)`, M, 9, { color: MUTED })
    y -= 22
  }
  const need = (h: number) => { if (y - h < M + 24) newPage() }
  const rule = (yy: number, thick = 0.6, color = LINE) => page.drawLine({ start: { x: M, y: yy }, end: { x: A4.w - M, y: yy }, thickness: thick, color })

  // ---- letterhead
  const top = y
  text(doc.company.name, M, 16, { font: bold })
  y -= 16
  for (const l of doc.company.lines) { text(l, M, 9, { color: MUTED }); y -= 11.5 }
  const leftBottom = y
  y = top
  text(doc.title, A4.w - M, 20, { font: bold, color: BRAND, right: true })
  y -= 18
  text(`#${doc.number}`, A4.w - M, 12, { font: bold, right: true })
  y -= 16
  for (const [k, v] of doc.meta) {
    text(k, A4.w - M - 150, 9, { color: MUTED })
    text(v, A4.w - M, 9, { right: true })
    y -= 12
  }
  y = Math.min(y, leftBottom) - 10
  rule(y, 1.2, INK)
  y -= 18

  if (doc.voided) {
    page.drawText('VOID', { x: A4.w / 2 - 70, y: A4.h / 2, size: 72, font: bold, color: rgb(0.85, 0.2, 0.2), opacity: 0.25 })
  }

  // ---- parties
  const colW = (A4.w - 2 * M - 20) / 2
  const party = (label: string, p: { name: string; lines: string[] }, x: number) => {
    let yy = y
    page.drawText(label.toUpperCase(), { x, y: yy, size: 8, font: bold, color: MUTED }); yy -= 13
    for (const l of wrap(p.name, colW, 10.5, bold)) { page.drawText(l, { x, y: yy, size: 10.5, font: bold, color: INK }); yy -= 13 }
    for (const line of p.lines) for (const l of wrap(line, colW, 9.5)) { page.drawText(l, { x, y: yy, size: 9.5, font: regular, color: INK }); yy -= 12 }
    return yy
  }
  const a = party('Bill to', doc.billTo, M)
  const b = doc.site ? party('Job site', doc.site, M + colW + 20) : y
  y = Math.min(a, b) - 10

  // ---- heading and scope
  if (doc.heading) {
    for (const l of wrap(doc.heading, A4.w - 2 * M, 13, bold)) { need(16); text(l, M, 13, { font: bold }); y -= 16 }
    y -= 2
  }
  if (doc.scope) {
    for (const l of wrap(doc.scope, A4.w - 2 * M, 10)) { need(13); text(l, M, 10); y -= 13 }
    y -= 6
  }

  // ---- line items
  const cQty = A4.w - M - 200, cUnit = A4.w - M - 90, cAmt = A4.w - M
  const descW = cQty - M - 40
  const head = () => {
    need(30)
    page.drawRectangle({ x: M, y: y - 5, width: A4.w - 2 * M, height: 18, color: PALE })
    text('Description', M + 4, 8.5, { font: bold, color: MUTED })
    text('Qty', cQty, 8.5, { font: bold, color: MUTED, right: true })
    text('Unit price', cUnit, 8.5, { font: bold, color: MUTED, right: true })
    text('Amount', cAmt - 4, 8.5, { font: bold, color: MUTED, right: true })
    y -= 20
  }
  head()
  for (const s of doc.sections) {
    if (doc.sections.length > 1 && s.name) { need(18); text(s.name, M + 4, 9.5, { font: bold, color: BRAND }); y -= 14 }
    for (const it of s.items) {
      const lines = wrap(it.description || '-', descW, 9.5)
      if (y - lines.length * 12 - 6 < M + 24) { newPage(); head() }
      text(lines[0], M + 4, 9.5)
      text(it.qty, cQty, 9.5, { right: true })
      text(money(it.unit), cUnit, 9.5, { right: true })
      text(money(it.amount), cAmt - 4, 9.5, { right: true })
      y -= 12
      for (const l of lines.slice(1)) { text(l, M + 4, 9.5); y -= 12 }
      rule(y + 6 - 3)
      y -= 6
    }
  }
  y -= 6

  // ---- claim summary and totals (right-aligned block)
  const block = (rows: { label: string; value: string; strong?: boolean }[]) => {
    for (const r of rows) {
      need(16)
      const size = r.strong ? 11 : 9.5
      const f = r.strong ? bold : regular
      if (r.strong) {
        y -= 6 // breathing room above a total, then a short rule over the totals column only
        page.drawLine({ start: { x: A4.w - M - 244, y: y + 14 }, end: { x: A4.w - M, y: y + 14 }, thickness: 0.8, color: INK })
      }
      text(r.label, A4.w - M - 240, size, { font: f })
      text(r.value, A4.w - M - 4, size, { font: f, right: true })
      y -= r.strong ? 17 : 14
    }
    y -= 8
  }
  if (doc.claim.length) block(doc.claim.map(([label, value]) => ({ label, value })))
  block(doc.totals)

  // ---- pay, notes, footer
  if (doc.pay.length) {
    need(16 + doc.pay.length * 12 + 10)
    page.drawRectangle({ x: M, y: y - doc.pay.length * 12 - 4, width: A4.w - 2 * M, height: doc.pay.length * 12 + 20, color: PALE })
    text('Pay by bank transfer', M + 8, 10, { font: bold }); y -= 14
    for (const l of doc.pay) { text(l, M + 8, 9.5); y -= 12 }
    y -= 14
  }
  if (doc.notes) {
    need(30); text('Notes', M, 10, { font: bold }); y -= 13
    for (const l of wrap(doc.notes, A4.w - 2 * M, 9.5)) { need(12); text(l, M, 9.5); y -= 12 }
    y -= 8
  }
  for (const f of doc.footer) for (const l of wrap(f, A4.w - 2 * M, 8.5)) { need(11); text(l, M, 8.5, { color: MUTED }); y -= 11 }

  // ---- page numbers
  pages.forEach((p, i) => {
    const label = `Page ${i + 1} of ${pages.length}`
    p.drawText(label, { x: A4.w - M - regular.widthOfTextAtSize(label, 8), y: M - 18, size: 8, font: regular, color: MUTED })
  })
  return pdf.save()
}

const money = (n: number) => n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' })

// Save the PDF to the device (works on desktop browsers and iPhone/Android: the file opens or downloads).
export function downloadPdf(bytes: Uint8Array, fileName: string) {
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}
