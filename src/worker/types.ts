export interface Env {
  AOSP_PATCH_KV: KVNamespace
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
  LITELLM_BASE_URL?: string
  LITELLM_API_KEY?: string
  // Resend Email Configuration (free tier: 100 emails/day)
  RESEND_API_KEY?: string
  RESEND_FROM_EMAIL?: string
  RESEND_FROM_NAME?: string
  RESEND_REPLY_TO_EMAIL?: string

  // Legacy MailChannels support (deprecated)
  MAILCHANNELS_FROM_EMAIL?: string
  MAILCHANNELS_FROM_NAME?: string
  MAILCHANNELS_REPLY_TO_EMAIL?: string
  MAILCHANNELS_API_ENDPOINT?: string
  MAILCHANNELS_API_KEY?: string
  CACHE_VERSION?: string
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
  model?: string
  notificationEmails?: string[]
  notificationCc?: string[]
  remoteNodeId?: string
  gitRepository?: string
  createdAt: string
  updatedAt: string
}