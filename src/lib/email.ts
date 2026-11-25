import { supabase } from './supabase'

async function readError(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response })?.context
  if (ctx && typeof ctx.json === 'function') {
    try {
      const j = (await ctx.json()) as { error?: string }
      if (j.error) return j.error
    } catch { /* fall through */ }
  }
  return 'Could not reach the email service. Try again in a moment.'
}

export async function sendDocument(p: { kind: 'quote' | 'invoice'; id: number; subject: string; message: string; copyMe: boolean; pdf?: string; linkToken?: string }): Promise<{ to: string }> {
  if (!supabase) throw new Error('Sending email needs the Supabase connection.')
  const { data, error } = await supabase.functions.invoke('send-document', { body: p })
  if (error) throw new Error(await readError(error))
  return data as { to: string }
}

export interface SentRecord { to: string; at: string; subject: string }
export async function sentHistory(kind: 'quote' | 'invoice', id: number): Promise<SentRecord[]> {
  if (!supabase) return []
  const { data } = await supabase.from('email_log').select('to_email, subject, created_at').eq('kind', kind).eq('doc_id', id).order('created_at', { ascending: false }).limit(5)
  return (data ?? []).map((r) => ({ to: r.to_email as string, at: r.created_at as string, subject: r.subject as string }))
}
