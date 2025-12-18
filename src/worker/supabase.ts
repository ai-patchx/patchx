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
  // Prefer service role key for backend operations (bypasses RLS)
  // Fallback to anon key if service role key is not available
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY
  const usingServiceRole = !!env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase configuration is missing. SUPABASE_URL and SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY) must be set in environment variables.')
  }

  console.log(`[Supabase] Using ${usingServiceRole ? 'SERVICE_ROLE' : 'ANON'} key for database operations`)
  supabaseClient = createClient(supabaseUrl, supabaseKey)
  return supabaseClient
}
