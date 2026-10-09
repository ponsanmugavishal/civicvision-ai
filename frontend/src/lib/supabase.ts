import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env, supabaseConfigured } from '@/config/env'

/** Browser Supabase client — used for authentication only. All data access goes through the backend API. */
export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(env.supabaseUrl, env.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null
