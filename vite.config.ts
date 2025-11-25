import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";
import { execSync } from 'node:child_process'
import { readFileSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables from .env.local if it exists
const loadEnvLocal = () => {
  try {
    const envLocalPath = join(__dirname, '.env.local')
    const envContent = readFileSync(envLocalPath, 'utf-8')
    const env: Record<string, string> = {}

    for (const line of envContent.split('\n')) {
      const trimmed = line.trim()
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=')
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=').trim().replace(/^["']|["']$/g, '')
          env[key.trim()] = value
        }
      }
    }
    return env
  } catch {
    return {}
  }
}

const envLocal = loadEnvLocal()

// Get environment variables, prioritizing process.env, then .env.local
const getEnv = (key: string): string => {
  return process.env[key] || envLocal[key] || ''
}

const gitHash = (() => {
  try {
    return execSync('git rev-parse --short=7 HEAD').toString().trim()
  } catch {
    return 'unknown'
  }
})()

// https://vite.dev/config/
export default defineConfig({
  build: {
    sourcemap: 'hidden',
  },
  define: {
    'import.meta.env.GIT_HASH': JSON.stringify(gitHash),
    'import.meta.env.BUILD_TIME': JSON.stringify(new Date().toISOString()),
    'import.meta.env.TEST_USER_PASSWORD': JSON.stringify(getEnv('TEST_USER_PASSWORD') || 'patchx'),
    'import.meta.env.SUPABASE_URL': JSON.stringify(getEnv('SUPABASE_URL')),
    'import.meta.env.SUPABASE_ANON_KEY': JSON.stringify(getEnv('SUPABASE_ANON_KEY')),
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path
      }
    }
  },
  plugins: [
    react({
      babel: {
        plugins: [
          'react-dev-locator',
        ],
      },
    }),
    tsconfigPaths()
  ],
})
