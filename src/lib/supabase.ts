import { createClient, SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

const create = (url: string, key: string) => {
  client = createClient(url, key)
  return client
}

export const getSupabaseClient = async (): Promise<SupabaseClient> => {
  if (client) return client
  const url = import.meta.env.VITE_SUPABASE_URL || ''
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
  if (url && key) return create(url, key)
  const res = await fetch('/api/config/public').catch(() => null as unknown as Response)
  if (res) {
    const json = await res.json().catch(() => null) as { success?: boolean; data?: { supabaseUrl: string; supabaseAnonKey: string } } | null
    const remoteUrl = json?.data?.supabaseUrl || ''
    const remoteKey = json?.data?.supabaseAnonKey || ''
    if (remoteUrl && remoteKey) return create(remoteUrl, remoteKey)
  }
  return create('', '')
}