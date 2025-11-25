import { createClient, SupabaseClient } from '@supabase/supabase-js'

declare global {
  interface Window {
    __PX_PUBLIC_SITE_URL?: string
  }
}

let client: SupabaseClient | null = null

const setPublicSiteUrl = (url?: string) => {
  if (typeof window !== 'undefined' && url) {
    window.__PX_PUBLIC_SITE_URL = url.replace(/\/$/, '')
  }
}

const create = (url: string, key: string) => {
  client = createClient(url, key)
  return client
}

export const getSupabaseClient = async (): Promise<SupabaseClient> => {
  if (client) return client

  // First, try to get from build-time environment variables
  const url = import.meta.env.SUPABASE_URL || ''
  const key = import.meta.env.SUPABASE_ANON_KEY || ''
  const publicSiteUrl = import.meta.env.VITE_PUBLIC_SITE_URL?.trim()
  if (publicSiteUrl) {
    setPublicSiteUrl(publicSiteUrl)
  }

  if (url && key) {
    console.log('✅ Using Supabase config from build-time environment variables')
    return create(url, key)
  }

  // If not available, try to fetch from Worker's config endpoint
  console.log('⚠️ Build-time env vars not found, fetching from Worker endpoint...')
  try {
    const res = await fetch('/api/config/public', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (res && res.ok) {
      const json = await res.json() as { success?: boolean; data?: { supabaseUrl: string; supabaseAnonKey: string; publicSiteUrl?: string } } | null
      console.log('Worker endpoint response:', json)
      const remoteUrl = json?.data?.supabaseUrl || ''
      const remoteKey = json?.data?.supabaseAnonKey || ''
      if (json?.data?.publicSiteUrl) {
        setPublicSiteUrl(json.data.publicSiteUrl)
      }
      if (remoteUrl && remoteKey) {
        console.log('✅ Using Supabase config from Worker endpoint')
        return create(remoteUrl, remoteKey)
      } else {
        console.error('❌ Worker endpoint returned empty Supabase config:', json)
      }
    } else {
      console.error('❌ Failed to fetch from Worker endpoint, status:', res?.status, res?.statusText)
      const text = await res.text().catch(() => '')
      console.error('Response body:', text)
    }
  } catch (error) {
    console.error('❌ Failed to fetch Supabase config from Worker:', error)
    if (error instanceof Error) {
      console.error('Error details:', error.message, error.stack)
    }
  }

  // If all else fails, throw an error with helpful message
  const errorMsg = 'Supabase configuration is missing. ' +
    'Please ensure SUPABASE_URL and SUPABASE_ANON_KEY are set in Cloudflare Pages environment variables ' +
    '(Settings → Environment Variables → Production) and redeploy. ' +
    'Current values: SUPABASE_URL=' + (url || 'empty') + ', SUPABASE_ANON_KEY=' + (key ? '***' : 'empty')
  console.error(errorMsg)
  throw new Error(errorMsg)
}
