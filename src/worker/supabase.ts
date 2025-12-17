/**
 * Supabase client helper for Cloudflare Workers
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { Env } from './types'

let supabaseClient: SupabaseClient | null = null

export function getSupabaseClient(env: Env): SupabaseClient {
  if (supabaseClient) {
    return supabaseClient
  }

  const supabaseUrl = env.SUPABASE_URL
  const supabaseKey = env.SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase configuration is missing. SUPABASE_URL and SUPABASE_ANON_KEY must be set in environment variables.')
  }

  supabaseClient = createClient(supabaseUrl, supabaseKey)
  return supabaseClient
}
