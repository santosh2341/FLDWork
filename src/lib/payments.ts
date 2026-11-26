// Card payments through Stripe Checkout (Edge Functions stripe-checkout and stripe-webhook).
// Needs the database connection and both Stripe secrets; otherwise card payment simply isn't offered.
import { supabase } from './supabase'

let enabledCache: Promise<boolean> | null = null

export function cardPaymentsEnabled(): Promise<boolean> {
  if (!supabase) return Promise.resolve(false)
  enabledCache ??= supabase.functions.invoke('stripe-checkout', { method: 'GET' })
    .then(({ data, error }) => !error && !!(data as { enabled?: boolean })?.enabled)
    .catch(() => false)
  return enabledCache
}

async function readError(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response })?.context
  if (ctx && typeof ctx.json === 'function') {
    try { const j = (await ctx.json()) as { error?: string }; if (j.error) return j.error } catch { /* fall through */ }
  }
  return 'Could not reach the payment service. Try again in a moment.'
}

// Returns the Stripe payment page URL for the invoice's balance. Portal callers pass their portal token.
export async function startCardPayment(p: { invoiceId: number; portalToken?: string }): Promise<{ url: string; amount: number }> {
  if (!supabase) throw new Error('Card payments need the database connection.')
  const { data, error } = await supabase.functions.invoke('stripe-checkout', { body: p })
  if (error) throw new Error(await readError(error))
  return data as { url: string; amount: number }
}
