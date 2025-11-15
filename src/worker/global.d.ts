/// <reference types="@cloudflare/workers-types" />

interface Env {
  AOSP_PATCH_KV: KVNamespace
  GERRIT_BASE_URL: string
  GERRIT_USERNAME: string
  GERRIT_PASSWORD: string
  MAX_FILE_SIZE: number
  RATE_LIMIT_WINDOW: number
  RATE_LIMIT_MAX: number
}