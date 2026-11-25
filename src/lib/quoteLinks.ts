import type { QuoteLink } from '../types'

export const linkUrl = (token: string) => `${window.location.origin}/q/${token}`

// The link a customer can still use: not revoked, not expired and not yet decided.
export function activeLink(links: QuoteLink[] | undefined, quoteId: number): QuoteLink | undefined {
  const now = Date.now()
  return (links ?? []).find((l) => l.quoteId === quoteId && !l.revokedAt && !l.decision && new Date(l.expiresAt).getTime() > now)
}

export function linkState(l: QuoteLink): 'accepted' | 'declined' | 'revoked' | 'expired' | 'active' {
  if (l.decision) return l.decision
  if (l.revokedAt) return 'revoked'
  if (new Date(l.expiresAt).getTime() <= Date.now()) return 'expired'
  return 'active'
}
