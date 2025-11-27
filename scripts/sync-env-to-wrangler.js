#!/usr/bin/env node

/**
 * Sync Supabase and LiteLLM environment variables from .env.local to wrangler.toml
 * This allows the Worker to expose Supabase config via /api/config/public
 * so the frontend can use it even if Cloudflare Pages env vars aren't set.
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
let publicSiteUrl = ''
let litellmBaseUrl = ''
let litellmApiKey = ''
let mailFromEmail = ''
let mailFromName = ''
let mailReplyTo = ''
let mailApiEndpoint = ''

try {
  const envLocalPath = join(rootDir, '.env.local')
  const envContent = readFileSync(envLocalPath, 'utf-8')

  for (const line of envContent.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith('SUPABASE_URL=')) {
      supabaseUrl = trimmed.split('=')[1].trim().replace(/^["']|["']$/g, '')
    } else if (trimmed.startsWith('SUPABASE_ANON_KEY=')) {
      supabaseAnonKey = trimmed.split('=')[1].trim().replace(/^["']|["']$/g, '')
    } else if (trimmed.startsWith('VITE_PUBLIC_SITE_URL=')) {
      publicSiteUrl = trimmed.split('=')[1]?.trim().replace(/^["']|["']$/g, '') || ''
    } else if (trimmed.startsWith('LITELLM_BASE_URL=')) {
      litellmBaseUrl = trimmed.split('=')[1]?.trim().replace(/^["']|["']$/g, '') || ''
    } else if (trimmed.startsWith('LITELLM_API_KEY=')) {
      litellmApiKey = trimmed.split('=')[1]?.trim().replace(/^["']|["']$/g, '') || ''
    } else if (trimmed.startsWith('MAILCHANNELS_FROM_EMAIL=')) {
      mailFromEmail = trimmed.split('=')[1]?.trim().replace(/^["']|["']$/g, '') || ''
    } else if (trimmed.startsWith('MAILCHANNELS_FROM_NAME=')) {
      mailFromName = trimmed.split('=')[1]?.trim().replace(/^["']|["']$/g, '') || ''
    } else if (trimmed.startsWith('MAILCHANNELS_REPLY_TO_EMAIL=')) {
      mailReplyTo = trimmed.split('=')[1]?.trim().replace(/^["']|["']$/g, '') || ''
    } else if (trimmed.startsWith('MAILCHANNELS_API_ENDPOINT=')) {
      mailApiEndpoint = trimmed.split('=')[1]?.trim().replace(/^["']|["']$/g, '') || ''
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

updateMailVar('MAILCHANNELS_FROM_EMAIL', mailFromEmail)
updateMailVar('MAILCHANNELS_FROM_NAME', mailFromName)
updateMailVar('MAILCHANNELS_REPLY_TO_EMAIL', mailReplyTo)
updateMailVar('MAILCHANNELS_API_ENDPOINT', mailApiEndpoint)

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

// Write back
writeFileSync(wranglerPath, wranglerContent, 'utf-8')

console.log('✅ Successfully synced environment variables to wrangler.toml')
console.log('\n📝 Next steps:')
console.log('   1. Review wrangler.toml to ensure values are correct')
console.log('   2. Deploy Worker: npm run deploy')
console.log('   3. The frontend will automatically use /api/config/public if Cloudflare Pages env vars are not set')
