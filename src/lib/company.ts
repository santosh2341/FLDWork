import type { CompanyProfile } from '../types'

export const emptyCompany: CompanyProfile = {
  tradingName: '', abn: '', phone: '', email: '', website: '', licence: '', address: '',
  bankName: '', accountName: '', bsb: '', accountNumber: '',
}

const digits = (s: string) => s.replace(/\D/g, '')

// ABN check: subtract 1 from the first digit, weight the 11 digits, the sum must divide by 89.
export function isValidAbn(abn: string): boolean {
  const d = digits(abn)
  if (d.length !== 11) return false
  const w = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19]
  const n = d.split('').map(Number)
  n[0] -= 1
  return n.reduce((a, x, i) => a + x * w[i], 0) % 89 === 0
}

export function formatAbn(abn: string): string {
  const d = digits(abn)
  return d.length === 11 ? `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}` : abn
}

export const isValidBsb = (b: string) => digits(b).length === 6
export const formatBsb = (b: string) => (digits(b).length === 6 ? `${digits(b).slice(0, 3)}-${digits(b).slice(3)}` : b)

export function validateCompany(c: CompanyProfile): string {
  if (c.abn.trim() && !isValidAbn(c.abn)) return 'That ABN is not valid. It should be 11 digits (check for typos).'
  if (c.bsb.trim() && !isValidBsb(c.bsb)) return 'BSB must be 6 digits.'
  if (c.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email.trim())) return 'Enter a valid company email address.'
  return ''
}
