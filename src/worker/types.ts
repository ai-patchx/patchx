export interface Env {
  AOSP_PATCH_KV: KVNamespace
  GERRIT_BASE_URL: string
  GERRIT_USERNAME: string
  GERRIT_PASSWORD: string
  MAX_FILE_SIZE: number
  RATE_LIMIT_WINDOW: number
  RATE_LIMIT_MAX: number
  TEST_USER_PASSWORD?: string
  SUPABASE_URL?: string
  SUPABASE_ANON_KEY?: string
  VITE_PUBLIC_SITE_URL?: string
  OPENAI_API_KEY?: string
  OPENAI_BASE_URL?: string
  OPENAI_MODEL?: string
  OPENAI_MAX_TOKENS?: string
  OPENAI_TEMPERATURE?: string
  ANTHROPIC_API_KEY?: string
  ANTHROPIC_BASE_URL?: string
  ANTHROPIC_MODEL?: string
  ANTHROPIC_MAX_TOKENS?: string
  ANTHROPIC_TEMPERATURE?: string
  CUSTOM_AI_BASE_URL?: string
  CUSTOM_AI_API_KEY?: string
  CUSTOM_AI_MODEL?: string
  CUSTOM_AI_MAX_TOKENS?: string
  CUSTOM_AI_TEMPERATURE?: string
}

export interface Upload {
  id: string
  filename: string
  content: string
  project: string
  validationStatus: 'valid' | 'invalid'
  validationError?: string
  createdAt: string
}

export interface Submission {
  id: string
  uploadId: string
  filename: string
  project: string
  subject: string
  description: string
  branch: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  changeId?: string
  changeUrl?: string
  error?: string
  createdAt: string
  updatedAt: string
}
import type { KVNamespace } from '@cloudflare/workers-types'