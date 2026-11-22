import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

// Null until env vars are set. The app runs on local demo data in that case.
export const supabase = url && key ? createClient(url, key) : null
