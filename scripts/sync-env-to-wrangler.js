#!/usr/bin/env node

/**
 * Sync Supabase, LiteLLM, Resend, MailChannels, and Gerrit environment variables from .env.local to wrangler.toml
 * This allows the Worker to expose Supabase config via /api/config/public
 * so the frontend can use it even if Cloudflare Pages env vars aren't set.
 *
 * Note: SSH Service API configuration (SSH_SERVICE_API_URL and SSH_SERVICE_API_KEY) is now stored
 * per-node in Supabase instead of as environment variables.
 */

import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const rootDir = join(__dirname, '..')

// Read .env.local
let supabaseUrl = ''
let supabaseAnonKey = ''
let supabaseServiceRoleKey = ''
let publicSiteUrl = ''
let litellmBaseUrl = ''
let litellmApiKey = ''
let resendApiKey = ''
let resendFromEmail = ''
let resendFromName = ''
let resendReplyTo = ''
let mailFromEmail = ''
let mailFromName = ''
let mailReplyTo = ''
let mailApiEndpoint = ''
let gerritBaseUrl = ''
let gerritUsername = ''
let gerritPassword = ''
let cacheVersion = ''
let testUserPassword = ''
let adminUserPassword = ''

try {
  const envLocalPath = join(rootDir, '.env.local')
  const envContent = readFileSync(envLocalPath, 'utf-8')

  for (const line of envContent.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith('SUPABASE_URL=')) {
      supabaseUrl = trimmed.split('=')[1].trim().replace(/^["']|["']$/g, '')
    } else if (trimmed.startsWith('SUPABASE_ANON_KEY=')) {
      supabaseAnonKey = trimmed.split('=')[1].trim().replace(/^["']|["']$/g, '')
    } else if (trimmed.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) {
      supabaseServiceRoleKey = trimmed.split('=')[1].trim().replace(/^["']|["']$/g, '')
    } else if (trimmed.startsWith('VITE_PUBLIC_SITE_URL=')) {
      publicSiteUrl = trimmed.split('=')[1]?.trim().replace(/^["']|["']$/g, '') || ''
    } else if (trimmed.startsWith('LITELLM_BASE_URL=')) {
      litellmBaseUrl = trimmed.split('=')[1]?.trim().replace(/^["']|["']$/g, '') || ''
    } else if (trimmed.startsWith('LITELLM_API_KEY=')) {
      litellmApiKey = trimmed.split('=')[1]?.trim().replace(/^["']|["']$/g, '') || ''
    } else if (trimmed.startsWith('RESEND_API_KEY=')) {
      resendApiKey = trimmed.split('=')[1]?.trim().replace(/^["']|["']$/g, '') || ''
    } else if (trimmed.startsWith('RESEND_FROM_EMAIL=')) {
      resendFromEmail = trimmed.split('=')[1]?.trim().replace(/^["']|["']$/g, '') || ''
    } else if (trimmed.startsWith('RESEND_FROM_NAME=')) {
      resendFromName = trimmed.split('=')[1]?.trim().replace(/^["']|["']$/g, '') || ''
    } else if (trimmed.startsWith('RESEND_REPLY_TO_EMAIL=')) {
      resendReplyTo = trimmed.split('=')[1]?.trim().replace(/^["']|["']$/g, '') || ''
    } else if (trimmed.startsWith('MAILCHANNELS_FROM_EMAIL=')) {
      mailFromEmail = trimmed.split('=')[1]?.trim().replace(/^["']|["']$/g, '') || ''
    } else if (trimmed.startsWith('MAILCHANNELS_FROM_NAME=')) {
      mailFromName = trimmed.split('=')[1]?.trim().replace(/^["']|["']$/g, '') || ''
    } else if (trimmed.startsWith('MAILCHANNELS_REPLY_TO_EMAIL=')) {
      mailReplyTo = trimmed.split('=')[1]?.trim().replace(/^["']|["']$/g, '') || ''
    } else if (trimmed.startsWith('MAILCHANNELS_API_ENDPOINT=')) {
      mailApiEndpoint = trimmed.split('=')[1]?.trim().replace(/^["']|["']$/g, '') || ''
    } else if (trimmed.startsWith('GERRIT_BASE_URL=')) {
      gerritBaseUrl = trimmed.split('=')[1]?.trim().replace(/^["']|["']$/g, '') || ''
    } else if (trimmed.startsWith('GERRIT_USERNAME=')) {
      gerritUsername = trimmed.split('=')[1]?.trim().replace(/^["']|["']$/g, '') || ''
    } else if (trimmed.startsWith('GERRIT_PASSWORD=')) {
      gerritPassword = trimmed.split('=')[1]?.trim().replace(/^["']|["']$/g, '') || ''
    } else if (trimmed.startsWith('CACHE_VERSION=')) {
      cacheVersion = trimmed.split('=')[1]?.trim().replace(/^["']|["']$/g, '') || 'v1'
    } else if (trimmed.startsWith('TEST_USER_PASSWORD=')) {
      testUserPassword = trimmed.split('=')[1]?.trim().replace(/^["']|["']$/g, '') || ''
    } else if (trimmed.startsWith('ADMIN_USER_PASSWORD=')) {
      adminUserPassword = trimmed.split('=')[1]?.trim().replace(/^["']|["']$/g, '') || ''
    }
  }
} catch (error) {
  console.error('Error reading .env.local:', error.message)
  console.log('\nMake sure .env.local exists with SUPABASE_URL and SUPABASE_ANON_KEY')
  process.exit(1)
}

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_ANON_KEY not found in .env.local')
  process.exit(1)
}

if (!litellmBaseUrl || !litellmApiKey) {
  console.warn('⚠️  Warning: LITELLM_BASE_URL and/or LITELLM_API_KEY not found in .env.local. Model selection feature will not be available.')
}

if (!publicSiteUrl) {
  console.warn('⚠️  Warning: VITE_PUBLIC_SITE_URL not found in .env.local. Using existing value in wrangler.toml.')
}

if (!supabaseServiceRoleKey) {
  console.warn('⚠️  Warning: SUPABASE_SERVICE_ROLE_KEY not found in .env.local. Using anon key for backend operations (RLS policies may restrict access).')
}

if (!resendApiKey) {
  console.warn('⚠️  Warning: RESEND_API_KEY not found in .env.local. Resend email service will not be available.')
}
if (!resendFromEmail) {
  console.warn('⚠️  Warning: RESEND_FROM_EMAIL not found in .env.local. Resend email service will not be available.')
}
if (!resendFromName) {
  console.warn('⚠️  Warning: RESEND_FROM_NAME not found in .env.local.')
}
if (!resendReplyTo) {
  console.warn('⚠️  Warning: RESEND_REPLY_TO_EMAIL not found in .env.local.')
}
if (!mailFromEmail) {
  console.warn('⚠️  Warning: MAILCHANNELS_FROM_EMAIL not found in .env.local. Email notifications may use stale values in wrangler.toml.')
}
if (!mailFromName) {
  console.warn('⚠️  Warning: MAILCHANNELS_FROM_NAME not found in .env.local.')
}
if (!mailReplyTo) {
  console.warn('⚠️  Warning: MAILCHANNELS_REPLY_TO_EMAIL not found in .env.local.')
}
if (!mailApiEndpoint) {
  console.warn('⚠️  Warning: MAILCHANNELS_API_ENDPOINT not found in .env.local. Defaults to the public MailChannels endpoint.')
}

if (!gerritBaseUrl) {
  console.warn('⚠️  Warning: GERRIT_BASE_URL not found in .env.local. Using default: https://android-review.googlesource.com')
  gerritBaseUrl = 'https://android-review.googlesource.com'
}
if (!gerritUsername || !gerritPassword) {
  console.warn('⚠️  Warning: GERRIT_USERNAME and/or GERRIT_PASSWORD not found in .env.local. Gerrit API features (like project listing) will not work.')
}

if (!cacheVersion) {
  console.warn('⚠️  Warning: CACHE_VERSION not found in .env.local. Using default: v1')
  cacheVersion = 'v1'
}

if (!testUserPassword) {
  console.warn('⚠️  Warning: TEST_USER_PASSWORD not found in .env.local. Using existing value in wrangler.toml.')
}

if (!adminUserPassword) {
  console.warn('⚠️  Warning: ADMIN_USER_PASSWORD not found in .env.local. Using existing value in wrangler.toml.')
}


// Read wrangler.toml
const wranglerPath = join(rootDir, 'wrangler.toml')
let wranglerContent = readFileSync(wranglerPath, 'utf-8')

// Update all environments (default, production, staging)
wranglerContent = wranglerContent.replace(
  /SUPABASE_URL = ".*"/g,
  `SUPABASE_URL = "${supabaseUrl}"`
)
wranglerContent = wranglerContent.replace(
  /SUPABASE_ANON_KEY = ".*"/g,
  `SUPABASE_ANON_KEY = "${supabaseAnonKey}"`
)

// Update SUPABASE_SERVICE_ROLE_KEY if it exists in .env.local
if (supabaseServiceRoleKey) {
  // First, remove all existing SUPABASE_SERVICE_ROLE_KEY entries to avoid duplicates
  wranglerContent = wranglerContent.replace(/^SUPABASE_SERVICE_ROLE_KEY\s*=.*$/gm, '')
  // Clean up multiple consecutive empty lines
  wranglerContent = wranglerContent.replace(/\n\n\n+/g, '\n\n')

  // Add to default [vars] section after SUPABASE_ANON_KEY
  const lines = wranglerContent.split('\n')
  let inVarsSection = false
  let varsAnonKeyIndex = -1

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '[vars]') {
      inVarsSection = true
    } else if (lines[i].trim().startsWith('[') && lines[i].trim() !== '[vars]') {
      if (inVarsSection) {
        break
      }
    }
    if (inVarsSection && lines[i].includes('SUPABASE_ANON_KEY =')) {
      varsAnonKeyIndex = i
    }
  }

  if (varsAnonKeyIndex >= 0) {
    lines.splice(varsAnonKeyIndex + 1, 0, `SUPABASE_SERVICE_ROLE_KEY = "${supabaseServiceRoleKey}"`)
    wranglerContent = lines.join('\n')
  }

  // Add to [env.production.vars] after SUPABASE_ANON_KEY
  const lines2 = wranglerContent.split('\n')
  let inProductionSection = false
  let productionAnonKeyIndex = -1

  for (let i = 0; i < lines2.length; i++) {
    if (lines2[i].trim() === '[env.production.vars]') {
      inProductionSection = true
    } else if (lines2[i].trim().startsWith('[') && lines2[i].trim() !== '[env.production.vars]') {
      if (inProductionSection && lines2[i].trim() === '[env.staging.vars]') {
        break
      }
    }
    if (inProductionSection && lines2[i].includes('SUPABASE_ANON_KEY =')) {
      productionAnonKeyIndex = i
    }
  }

  if (productionAnonKeyIndex >= 0) {
    lines2.splice(productionAnonKeyIndex + 1, 0, `SUPABASE_SERVICE_ROLE_KEY = "${supabaseServiceRoleKey}"`)
    wranglerContent = lines2.join('\n')
  }

  // Add to [env.staging.vars] after SUPABASE_ANON_KEY
  const lines3 = wranglerContent.split('\n')
  let inStagingSection = false
  let stagingAnonKeyIndex = -1

  for (let i = 0; i < lines3.length; i++) {
    if (lines3[i].trim() === '[env.staging.vars]') {
      inStagingSection = true
    }
    if (inStagingSection && lines3[i].includes('SUPABASE_ANON_KEY =')) {
      stagingAnonKeyIndex = i
      break
    }
  }

  if (stagingAnonKeyIndex >= 0) {
    lines3.splice(stagingAnonKeyIndex + 1, 0, `SUPABASE_SERVICE_ROLE_KEY = "${supabaseServiceRoleKey}"`)
    wranglerContent = lines3.join('\n')
  }
}

// Update Gerrit variables
if (gerritBaseUrl) {
  wranglerContent = wranglerContent.replace(
    /GERRIT_BASE_URL = ".*"/g,
    `GERRIT_BASE_URL = "${gerritBaseUrl}"`
  )
}

if (publicSiteUrl) {
  wranglerContent = wranglerContent.replace(
    /VITE_PUBLIC_SITE_URL = ".*"/g,
    `VITE_PUBLIC_SITE_URL = "${publicSiteUrl}"`
  )
}

// Update LiteLLM variables (if they exist) - sync to all environments
// First, remove all existing LITELLM entries (including placeholders) to avoid duplicates
wranglerContent = wranglerContent.replace(/^LITELLM_BASE_URL\s*=.*$/gm, '')
wranglerContent = wranglerContent.replace(/^LITELLM_API_KEY\s*=.*$/gm, '')
// Remove all existing Resend entries to avoid duplicates
wranglerContent = wranglerContent.replace(/^RESEND_API_KEY\s*=.*$/gm, '')
wranglerContent = wranglerContent.replace(/^RESEND_FROM_EMAIL\s*=.*$/gm, '')
wranglerContent = wranglerContent.replace(/^RESEND_FROM_NAME\s*=.*$/gm, '')
wranglerContent = wranglerContent.replace(/^RESEND_REPLY_TO_EMAIL\s*=.*$/gm, '')
// Clean up multiple consecutive empty lines
wranglerContent = wranglerContent.replace(/\n\n\n+/g, '\n\n')

if (litellmBaseUrl) {
  // Add to default [vars] section after VITE_PUBLIC_SITE_URL
  const lines = wranglerContent.split('\n')
  let inVarsSection = false
  let varsViteLineIndex = -1

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '[vars]') {
      inVarsSection = true
    } else if (lines[i].trim().startsWith('[') && lines[i].trim() !== '[vars]') {
      if (inVarsSection) {
        break
      }
    }
    if (inVarsSection && lines[i].includes('VITE_PUBLIC_SITE_URL =')) {
      varsViteLineIndex = i
    }
  }

  if (varsViteLineIndex >= 0) {
    lines.splice(varsViteLineIndex + 1, 0, `LITELLM_BASE_URL = "${litellmBaseUrl}"`)
    wranglerContent = lines.join('\n')
  }

  // Add to [env.production.vars] after VITE_PUBLIC_SITE_URL
  const lines2 = wranglerContent.split('\n')
  let inProductionSection = false
  let productionViteLineIndex = -1

  for (let i = 0; i < lines2.length; i++) {
    if (lines2[i].trim() === '[env.production.vars]') {
      inProductionSection = true
    } else if (lines2[i].trim().startsWith('[') && lines2[i].trim() !== '[env.production.vars]') {
      if (inProductionSection && lines2[i].trim() === '[env.staging.vars]') {
        break
      }
    }
    if (inProductionSection && lines2[i].includes('VITE_PUBLIC_SITE_URL =')) {
      productionViteLineIndex = i
    }
  }

  if (productionViteLineIndex >= 0) {
    lines2.splice(productionViteLineIndex + 1, 0, `LITELLM_BASE_URL = "${litellmBaseUrl}"`)
    wranglerContent = lines2.join('\n')
  }

  // Add to [env.staging.vars] after VITE_PUBLIC_SITE_URL
  const lines3 = wranglerContent.split('\n')
  let inStagingSection = false
  let stagingViteLineIndex = -1

  for (let i = 0; i < lines3.length; i++) {
    if (lines3[i].trim() === '[env.staging.vars]') {
      inStagingSection = true
    }
    if (inStagingSection && lines3[i].includes('VITE_PUBLIC_SITE_URL =')) {
      stagingViteLineIndex = i
      break
    }
  }

  if (stagingViteLineIndex >= 0) {
    lines3.splice(stagingViteLineIndex + 1, 0, `LITELLM_BASE_URL = "${litellmBaseUrl}"`)
    wranglerContent = lines3.join('\n')
  }
}

const updateMailVar = (key, value) => {
  if (!value) {
    return
  }
  const regex = new RegExp(`${key}\\s*=\\s*(?:"[^"]*"|[^\\s]+)`, 'g')
  if (regex.test(wranglerContent)) {
    wranglerContent = wranglerContent.replace(regex, `${key} = "${value}"`)
  }
}

// Update Resend variables
updateMailVar('RESEND_API_KEY', resendApiKey)
updateMailVar('RESEND_FROM_EMAIL', resendFromEmail)
updateMailVar('RESEND_FROM_NAME', resendFromName)
updateMailVar('RESEND_REPLY_TO_EMAIL', resendReplyTo)

// Update MailChannels variables (fallback)
updateMailVar('MAILCHANNELS_FROM_EMAIL', mailFromEmail)
updateMailVar('MAILCHANNELS_FROM_NAME', mailFromName)
updateMailVar('MAILCHANNELS_REPLY_TO_EMAIL', mailReplyTo)
updateMailVar('MAILCHANNELS_API_ENDPOINT', mailApiEndpoint)

// Update Gerrit credentials (similar to LITELLM pattern)
// First, remove all existing GERRIT_USERNAME and GERRIT_PASSWORD entries to avoid duplicates
wranglerContent = wranglerContent.replace(/^GERRIT_USERNAME\s*=.*$/gm, '')
wranglerContent = wranglerContent.replace(/^GERRIT_PASSWORD\s*=.*$/gm, '')
// Clean up multiple consecutive empty lines
wranglerContent = wranglerContent.replace(/\n\n\n+/g, '\n\n')

if (gerritUsername) {
  // Add to default [vars] section after GERRIT_BASE_URL
  const lines = wranglerContent.split('\n')
  let inVarsSection = false
  let varsGerritBaseUrlIndex = -1

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '[vars]') {
      inVarsSection = true
    } else if (lines[i].trim().startsWith('[') && lines[i].trim() !== '[vars]') {
      if (inVarsSection) {
        break
      }
    }
    if (inVarsSection && lines[i].includes('GERRIT_BASE_URL =')) {
      varsGerritBaseUrlIndex = i
    }
  }

  if (varsGerritBaseUrlIndex >= 0) {
    lines.splice(varsGerritBaseUrlIndex + 1, 0, `GERRIT_USERNAME = "${gerritUsername}"`)
    wranglerContent = lines.join('\n')
  }

  // Add to [env.production.vars] after GERRIT_BASE_URL
  const lines2 = wranglerContent.split('\n')
  let inProductionSection = false
  let productionGerritBaseUrlIndex = -1

  for (let i = 0; i < lines2.length; i++) {
    if (lines2[i].trim() === '[env.production.vars]') {
      inProductionSection = true
    } else if (lines2[i].trim().startsWith('[') && lines2[i].trim() !== '[env.production.vars]') {
      if (inProductionSection && lines2[i].trim() === '[env.staging.vars]') {
        break
      }
    }
    if (inProductionSection && lines2[i].includes('GERRIT_BASE_URL =')) {
      productionGerritBaseUrlIndex = i
    }
  }

  if (productionGerritBaseUrlIndex >= 0) {
    lines2.splice(productionGerritBaseUrlIndex + 1, 0, `GERRIT_USERNAME = "${gerritUsername}"`)
    wranglerContent = lines2.join('\n')
  }

  // Add to [env.staging.vars] after GERRIT_BASE_URL
  const lines3 = wranglerContent.split('\n')
  let inStagingSection = false
  let stagingGerritBaseUrlIndex = -1

  for (let i = 0; i < lines3.length; i++) {
    if (lines3[i].trim() === '[env.staging.vars]') {
      inStagingSection = true
    }
    if (inStagingSection && lines3[i].includes('GERRIT_BASE_URL =')) {
      stagingGerritBaseUrlIndex = i
      break
    }
  }

  if (stagingGerritBaseUrlIndex >= 0) {
    lines3.splice(stagingGerritBaseUrlIndex + 1, 0, `GERRIT_USERNAME = "${gerritUsername}"`)
    wranglerContent = lines3.join('\n')
  }
}

if (gerritPassword) {
  // Add to default [vars] section after GERRIT_USERNAME or GERRIT_BASE_URL
  const lines = wranglerContent.split('\n')
  let inVarsSection = false
  let insertIndex = -1

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '[vars]') {
      inVarsSection = true
    } else if (lines[i].trim().startsWith('[') && lines[i].trim() !== '[vars]') {
      if (inVarsSection) {
        break
      }
    }
    if (inVarsSection) {
      if (lines[i].includes('GERRIT_USERNAME =')) {
        insertIndex = i
        break
      } else if (lines[i].includes('GERRIT_BASE_URL =') && insertIndex === -1) {
        insertIndex = i
      }
    }
  }

  if (insertIndex >= 0) {
    lines.splice(insertIndex + 1, 0, `GERRIT_PASSWORD = "${gerritPassword}"`)
    wranglerContent = lines.join('\n')
  }

  // Add to [env.production.vars] after GERRIT_USERNAME or GERRIT_BASE_URL
  const lines2 = wranglerContent.split('\n')
  let inProductionSection = false
  let insertIndex2 = -1

  for (let i = 0; i < lines2.length; i++) {
    if (lines2[i].trim() === '[env.production.vars]') {
      inProductionSection = true
    } else if (lines2[i].trim().startsWith('[') && lines2[i].trim() !== '[env.production.vars]') {
      if (inProductionSection && lines2[i].trim() === '[env.staging.vars]') {
        break
      }
    }
    if (inProductionSection) {
      if (lines2[i].includes('GERRIT_USERNAME =')) {
        insertIndex2 = i
        break
      } else if (lines2[i].includes('GERRIT_BASE_URL =') && insertIndex2 === -1) {
        insertIndex2 = i
      }
    }
  }

  if (insertIndex2 >= 0) {
    lines2.splice(insertIndex2 + 1, 0, `GERRIT_PASSWORD = "${gerritPassword}"`)
    wranglerContent = lines2.join('\n')
  }

  // Add to [env.staging.vars] after GERRIT_USERNAME or GERRIT_BASE_URL
  const lines3 = wranglerContent.split('\n')
  let inStagingSection = false
  let insertIndex3 = -1

  for (let i = 0; i < lines3.length; i++) {
    if (lines3[i].trim() === '[env.staging.vars]') {
      inStagingSection = true
    }
    if (inStagingSection) {
      if (lines3[i].includes('GERRIT_USERNAME =')) {
        insertIndex3 = i
        break
      } else if (lines3[i].includes('GERRIT_BASE_URL =') && insertIndex3 === -1) {
        insertIndex3 = i
      }
    }
  }

  if (insertIndex3 >= 0) {
    lines3.splice(insertIndex3 + 1, 0, `GERRIT_PASSWORD = "${gerritPassword}"`)
    wranglerContent = lines3.join('\n')
  }
}

if (litellmApiKey) {
  // Add to default [vars] section after LITELLM_BASE_URL or VITE_PUBLIC_SITE_URL
  const lines = wranglerContent.split('\n')
  let inVarsSection = false
  let insertIndex = -1

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '[vars]') {
      inVarsSection = true
    } else if (lines[i].trim().startsWith('[') && lines[i].trim() !== '[vars]') {
      if (inVarsSection) {
        break
      }
    }
    if (inVarsSection) {
      if (lines[i].includes('LITELLM_BASE_URL =')) {
        insertIndex = i
        break
      } else if (lines[i].includes('VITE_PUBLIC_SITE_URL =') && insertIndex === -1) {
        insertIndex = i
      }
    }
  }

  if (insertIndex >= 0) {
    lines.splice(insertIndex + 1, 0, `LITELLM_API_KEY = "${litellmApiKey}"`)
    wranglerContent = lines.join('\n')
  }

  // Add to [env.production.vars] after LITELLM_BASE_URL or VITE_PUBLIC_SITE_URL
  const lines2 = wranglerContent.split('\n')
  let inProductionSection = false
  let insertIndex2 = -1

  for (let i = 0; i < lines2.length; i++) {
    if (lines2[i].trim() === '[env.production.vars]') {
      inProductionSection = true
    } else if (lines2[i].trim().startsWith('[') && lines2[i].trim() !== '[env.production.vars]') {
      if (inProductionSection && lines2[i].trim() === '[env.staging.vars]') {
        break
      }
    }
    if (inProductionSection) {
      if (lines2[i].includes('LITELLM_BASE_URL =')) {
        insertIndex2 = i
        break
      } else if (lines2[i].includes('VITE_PUBLIC_SITE_URL =') && insertIndex2 === -1) {
        insertIndex2 = i
      }
    }
  }

  if (insertIndex2 >= 0) {
    lines2.splice(insertIndex2 + 1, 0, `LITELLM_API_KEY = "${litellmApiKey}"`)
    wranglerContent = lines2.join('\n')
  }

  // Add to [env.staging.vars] after LITELLM_BASE_URL or VITE_PUBLIC_SITE_URL
  const lines3 = wranglerContent.split('\n')
  let inStagingSection = false
  let insertIndex3 = -1

  for (let i = 0; i < lines3.length; i++) {
    if (lines3[i].trim() === '[env.staging.vars]') {
      inStagingSection = true
    }
    if (inStagingSection) {
      if (lines3[i].includes('LITELLM_BASE_URL =')) {
        insertIndex3 = i
        break
      } else if (lines3[i].includes('VITE_PUBLIC_SITE_URL =') && insertIndex3 === -1) {
        insertIndex3 = i
      }
    }
  }

  if (insertIndex3 >= 0) {
    lines3.splice(insertIndex3 + 1, 0, `LITELLM_API_KEY = "${litellmApiKey}"`)
    wranglerContent = lines3.join('\n')
  }
}

// Add Resend variables if configured
if (resendApiKey && resendFromEmail) {
  // Add to default [vars] section after LITELLM_API_KEY or VITE_PUBLIC_SITE_URL
  const lines = wranglerContent.split('\n')
  let inVarsSection = false
  let insertIndex = -1

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '[vars]') {
      inVarsSection = true
    } else if (lines[i].trim().startsWith('[') && lines[i].trim() !== '[vars]') {
      if (inVarsSection) {
        break
      }
    }
    if (inVarsSection) {
      if (lines[i].includes('LITELLM_API_KEY =')) {
        insertIndex = i
        break
      } else if (lines[i].includes('VITE_PUBLIC_SITE_URL =') && insertIndex === -1) {
        insertIndex = i
      }
    }
  }

  if (insertIndex >= 0) {
    const resendVars = []
    if (resendApiKey) resendVars.push(`RESEND_API_KEY = "${resendApiKey}"`)
    if (resendFromEmail) resendVars.push(`RESEND_FROM_EMAIL = "${resendFromEmail}"`)
    if (resendFromName) resendVars.push(`RESEND_FROM_NAME = "${resendFromName}"`)
    if (resendReplyTo) resendVars.push(`RESEND_REPLY_TO_EMAIL = "${resendReplyTo}"`)
    lines.splice(insertIndex + 1, 0, '', ...resendVars)
    wranglerContent = lines.join('\n')
  }

  // Add to [env.production.vars] after LITELLM_API_KEY or VITE_PUBLIC_SITE_URL
  const lines2 = wranglerContent.split('\n')
  let inProductionSection = false
  let insertIndex2 = -1

  for (let i = 0; i < lines2.length; i++) {
    if (lines2[i].trim() === '[env.production.vars]') {
      inProductionSection = true
    } else if (lines2[i].trim().startsWith('[') && lines2[i].trim() !== '[env.production.vars]') {
      if (inProductionSection && lines2[i].trim() === '[env.staging.vars]') {
        break
      }
    }
    if (inProductionSection) {
      if (lines2[i].includes('LITELLM_API_KEY =')) {
        insertIndex2 = i
        break
      } else if (lines2[i].includes('VITE_PUBLIC_SITE_URL =') && insertIndex2 === -1) {
        insertIndex2 = i
      }
    }
  }

  if (insertIndex2 >= 0) {
    const resendVars = []
    if (resendApiKey) resendVars.push(`RESEND_API_KEY = "${resendApiKey}"`)
    if (resendFromEmail) resendVars.push(`RESEND_FROM_EMAIL = "${resendFromEmail}"`)
    if (resendFromName) resendVars.push(`RESEND_FROM_NAME = "${resendFromName}"`)
    if (resendReplyTo) resendVars.push(`RESEND_REPLY_TO_EMAIL = "${resendReplyTo}"`)
    lines2.splice(insertIndex2 + 1, 0, '', ...resendVars)
    wranglerContent = lines2.join('\n')
  }

  // Add to [env.staging.vars] after LITELLM_API_KEY or VITE_PUBLIC_SITE_URL
  const lines3 = wranglerContent.split('\n')
  let inStagingSection = false
  let insertIndex3 = -1

  for (let i = 0; i < lines3.length; i++) {
    if (lines3[i].trim() === '[env.staging.vars]') {
      inStagingSection = true
    }
    if (inStagingSection) {
      if (lines3[i].includes('LITELLM_API_KEY =')) {
        insertIndex3 = i
        break
      } else if (lines3[i].includes('VITE_PUBLIC_SITE_URL =') && insertIndex3 === -1) {
        insertIndex3 = i
      }
    }
  }

  if (insertIndex3 >= 0) {
    const resendVars = []
    if (resendApiKey) resendVars.push(`RESEND_API_KEY = "${resendApiKey}"`)
    if (resendFromEmail) resendVars.push(`RESEND_FROM_EMAIL = "${resendFromEmail}"`)
    if (resendFromName) resendVars.push(`RESEND_FROM_NAME = "${resendFromName}"`)
    if (resendReplyTo) resendVars.push(`RESEND_REPLY_TO_EMAIL = "${resendReplyTo}"`)
    lines3.splice(insertIndex3 + 1, 0, '', ...resendVars)
    wranglerContent = lines3.join('\n')
  }
}

// Update TEST_USER_PASSWORD in all sections
if (testUserPassword) {
  // Update TEST_USER_PASSWORD using regex replacement (works for all sections)
  wranglerContent = wranglerContent.replace(
    /TEST_USER_PASSWORD\s*=\s*"[^"]*"/g,
    `TEST_USER_PASSWORD = "${testUserPassword}"`
  )
}

// Update ADMIN_USER_PASSWORD in all sections
if (adminUserPassword) {
  // Update ADMIN_USER_PASSWORD using regex replacement (works for all sections)
  wranglerContent = wranglerContent.replace(
    /ADMIN_USER_PASSWORD\s*=\s*"[^"]*"/g,
    `ADMIN_USER_PASSWORD = "${adminUserPassword}"`
  )
}

// Update CACHE_VERSION in all sections
if (cacheVersion) {
  // Update CACHE_VERSION using regex replacement (works for all sections)
  wranglerContent = wranglerContent.replace(
    /CACHE_VERSION\s*=\s*"[^"]*"/g,
    `CACHE_VERSION = "${cacheVersion}"`
  )

  // If CACHE_VERSION doesn't exist yet, add it after MAILCHANNELS_API_ENDPOINT in all sections
  if (!wranglerContent.includes('CACHE_VERSION =')) {
    // Add to default [vars] section
    const lines = wranglerContent.split('\n')
    let inVarsSection = false
    let varsMailEndpointIndex = -1

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() === '[vars]') {
        inVarsSection = true
      } else if (lines[i].trim().startsWith('[') && lines[i].trim() !== '[vars]') {
        if (inVarsSection) {
          break
        }
      }
      if (inVarsSection && lines[i].includes('MAILCHANNELS_API_ENDPOINT =')) {
        varsMailEndpointIndex = i
      }
    }

    if (varsMailEndpointIndex >= 0) {
      lines.splice(varsMailEndpointIndex + 1, 0, '', `# Cache version - update this to invalidate all caches on deploy`, `CACHE_VERSION = "${cacheVersion}"`)
      wranglerContent = lines.join('\n')
    }

    // Add to [env.production.vars] section
    const lines2 = wranglerContent.split('\n')
    let inProductionSection = false
    let productionMailEndpointIndex = -1

    for (let i = 0; i < lines2.length; i++) {
      if (lines2[i].trim() === '[env.production.vars]') {
        inProductionSection = true
      } else if (lines2[i].trim().startsWith('[') && lines2[i].trim() !== '[env.production.vars]') {
        if (inProductionSection && lines2[i].trim() === '[env.staging.vars]') {
          break
        }
      }
      if (inProductionSection && lines2[i].includes('MAILCHANNELS_API_ENDPOINT =')) {
        productionMailEndpointIndex = i
      }
    }

    if (productionMailEndpointIndex >= 0) {
      lines2.splice(productionMailEndpointIndex + 1, 0, '', `# Cache version - update this to invalidate all caches on deploy`, `CACHE_VERSION = "${cacheVersion}"`)
      wranglerContent = lines2.join('\n')
    }

    // Add to [env.staging.vars] section
    const lines3 = wranglerContent.split('\n')
    let inStagingSection = false
    let stagingMailEndpointIndex = -1

    for (let i = 0; i < lines3.length; i++) {
      if (lines3[i].trim() === '[env.staging.vars]') {
        inStagingSection = true
      }
      if (inStagingSection && lines3[i].includes('MAILCHANNELS_API_ENDPOINT =')) {
        stagingMailEndpointIndex = i
        break
      }
    }

    if (stagingMailEndpointIndex >= 0) {
      lines3.splice(stagingMailEndpointIndex + 1, 0, '', `# Cache version - update this to invalidate all caches on deploy`, `CACHE_VERSION = "${cacheVersion}"`)
      wranglerContent = lines3.join('\n')
    }
  }
}


// Write back
writeFileSync(wranglerPath, wranglerContent, 'utf-8')

console.log('✅ Successfully synced environment variables to wrangler.toml')
console.log('\n📝 Next steps:')
console.log('   1. Review wrangler.toml to ensure values are correct')
console.log('   2. Deploy Worker: npm run deploy')
console.log('   3. The frontend will automatically use /api/config/public if Cloudflare Pages env vars are not set')
