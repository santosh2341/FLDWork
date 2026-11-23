import { supabase } from './supabase'
import type { LineItem } from '../types'

export interface QuoteDraft {
  title: string
  description: string
  items: (Omit<LineItem, 'id'> & { needsPrice?: boolean })[]
  assumptions: string[]
  questions: string[]
  remaining?: number
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('The AI assistant needs the Supabase connection.')
  const { data, error } = await supabase.functions.invoke('ai-assist', { body })
  if (error) {
    // the function returns a readable { error } body; supabase-js hides it inside error.context
    const ctx = (error as { context?: Response }).context
    if (ctx && typeof ctx.json === 'function') {
      try {
        const j = (await ctx.json()) as { error?: string }
        if (j.error) throw new Error(j.error)
      } catch (e) {
        if (e instanceof Error && e.message && !/JSON|Unexpected|body/i.test(e.message)) throw e
      }
    }
    throw new Error('Could not reach the AI assistant. Try again in a moment.')
  }
  return data as T
}

export const draftQuote = (text: string) => call<QuoteDraft>({ task: 'quote_draft', text })
export const polishText = async (text: string, kind: 'scope' | 'notes' | 'job_summary') => (await call<{ text: string }>({ task: 'polish_text', text, kind })).text
