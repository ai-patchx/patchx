/// <reference types="@cloudflare/workers-types" />

interface Env {
  AOSP_PATCH_KV?: KVNamespace
  GERRIT_BASE_URL: string
  GERRIT_USERNAME: string
  GERRIT_PASSWORD: string
  MAX_FILE_SIZE: number
  RATE_LIMIT_WINDOW: number
  RATE_LIMIT_MAX: number
  TEST_USER_PASSWORD?: string
  ADMIN_USER_PASSWORD?: string
  SUPABASE_URL?: string
  SUPABASE_ANON_KEY?: string
  VITE_PUBLIC_SITE_URL?: string
  MAILCHANNELS_FROM_EMAIL?: string
  MAILCHANNELS_FROM_NAME?: string
  MAILCHANNELS_REPLY_TO_EMAIL?: string
  MAILCHANNELS_API_ENDPOINT?: string
}