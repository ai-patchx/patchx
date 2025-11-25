#!/usr/bin/env node

/**
 * Sync Supabase environment variables from .env.local to wrangler.toml
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

try {
  const envLocalPath = join(rootDir, '.env.local')
  const envContent = readFileSync(envLocalPath, 'utf-8')

  for (const line of envContent.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith('SUPABASE_URL=')) {
      supabaseUrl = trimmed.split('=')[1].trim().replace(/^["']|["']$/g, '')
    } else if (trimmed.startsWith('SUPABASE_ANON_KEY=')) {
      supabaseAnonKey = trimmed.split('=')[1].trim().replace(/^["']|["']$/g, '')
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

// Read wrangler.toml
const wranglerPath = join(rootDir, 'wrangler.toml')
let wranglerContent = readFileSync(wranglerPath, 'utf-8')

// Update production environment
wranglerContent = wranglerContent.replace(
  /SUPABASE_URL = ".*"/g,
  `SUPABASE_URL = "${supabaseUrl}"`
)
wranglerContent = wranglerContent.replace(
  /SUPABASE_ANON_KEY = ".*"/g,
  `SUPABASE_ANON_KEY = "${supabaseAnonKey}"`
)

// Write back
writeFileSync(wranglerPath, wranglerContent, 'utf-8')

console.log('✅ Successfully synced Supabase environment variables to wrangler.toml')
console.log(`   SUPABASE_URL: ${supabaseUrl}`)
console.log(`   SUPABASE_ANON_KEY: ${supabaseAnonKey.substring(0, 20)}...`)
console.log('\n📝 Next steps:')
console.log('   1. Review wrangler.toml to ensure values are correct')
console.log('   2. Deploy Worker: npm run deploy')
console.log('   3. The frontend will automatically use /api/config/public if Cloudflare Pages env vars are not set')
