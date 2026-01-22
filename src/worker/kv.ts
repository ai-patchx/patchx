import type { Env } from './types'

/**
 * Minimal KV-like interface used across the worker codebase.
 * When the real KV binding is missing (e.g., not configured in the environment),
 * we fall back to an in-memory Map so requests don't fail with 500s.
 * Note: the in-memory store is not durable and should be considered a temporary
 * fallback until KV is configured.
 */
export type KVLike = {
  get: (key: string, type?: 'text' | 'json' | 'arrayBuffer') => Promise<any>
  put: (key: string, value: string) => Promise<void>
  delete: (key: string) => Promise<void>
}

const GLOBAL_KV_KEY = '__PATCHX_IN_MEMORY_KV__'
const GLOBAL_WARN_KEY = '__PATCHX_IN_MEMORY_KV_WARNED__'

export const getKvNamespace = (env: Env): KVLike => {
  if (env.PATCHX_KV) {
    const kv = env.PATCHX_KV
    // Adapter to align KVNamespace overloads with our simplified KVLike signature
    return {
      async get(key: string, type?: 'text' | 'json' | 'arrayBuffer') {
        if (type === 'json') return kv.get(key, 'json')
        if (type === 'arrayBuffer') return kv.get(key, 'arrayBuffer')
        return kv.get(key)
      },
      async put(key: string, value: string) {
        await kv.put(key, value)
      },
      async delete(key: string) {
        await kv.delete(key)
      }
    }
  }

  const globalScope = globalThis as Record<string, any>

  if (!globalScope[GLOBAL_KV_KEY]) {
    const store = new Map<string, string>()

    const kvLike: KVLike = {
      async get(key: string, type?: 'text' | 'json' | 'arrayBuffer') {
        const value = store.get(key)
        if (value === undefined) return null

        if (type === 'json') {
          try {
            return JSON.parse(value)
          } catch (err) {
            console.warn('Failed to parse JSON from in-memory KV for key:', key, err)
            return null
          }
        }

        if (type === 'arrayBuffer') {
          return new TextEncoder().encode(value).buffer
        }

        return value
      },
      async put(key: string, value: string) {
        store.set(key, value)
      },
      async delete(key: string) {
        store.delete(key)
      }
    }

    globalScope[GLOBAL_KV_KEY] = kvLike
  }

  if (!globalScope[GLOBAL_WARN_KEY]) {
    console.warn('PATCHX_KV binding missing; using in-memory KV fallback (non-persistent).')
    globalScope[GLOBAL_WARN_KEY] = true
  }

  return globalScope[GLOBAL_KV_KEY] as KVLike
}
