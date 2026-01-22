/**
 * D1 Database helper for Cloudflare Workers
 */
import { Env } from './types'

export interface D1Result<T = any> {
  results: T[]
  success: boolean
  meta: {
    duration: number
    size_after: number
    rows_read: number
    rows_written: number
  }
}

export interface D1Response<T = any> {
  results: T[]
  success: boolean
  meta: {
    duration: number
    size_after: number
    rows_read: number
    rows_written: number
  }
}

/**
 * Generate a UUID v4 (for compatibility with existing UUID-based IDs)
 */
export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/**
 * Get D1 database from environment
 */
export function getD1Database(env: Env): D1Database {
  if (!env.PATCHX_D1) {
    throw new Error('D1 database binding (PATCHX_D1) is not configured in environment variables.')
  }
  return env.PATCHX_D1
}

/**
 * Helper to execute a query and return results
 */
export async function queryD1<T = any>(
  db: D1Database,
  sql: string,
  params: any[] = []
): Promise<D1Result<T>> {
  const stmt = db.prepare(sql)
  if (params.length > 0) {
    return await stmt.bind(...params).all<T>()
  }
  return await stmt.all<T>()
}

/**
 * Helper to execute a query and return a single result
 */
export async function queryD1First<T = any>(
  db: D1Database,
  sql: string,
  params: any[] = []
): Promise<T | null> {
  const stmt = db.prepare(sql)
  if (params.length > 0) {
    const result = await stmt.bind(...params).first<T>()
    return result || null
  }
  const result = await stmt.first<T>()
  return result || null
}

/**
 * Helper to execute an insert/update/delete and return metadata
 */
export async function executeD1(
  db: D1Database,
  sql: string,
  params: any[] = []
): Promise<D1Response> {
  const stmt = db.prepare(sql)
  if (params.length > 0) {
    return await stmt.bind(...params).run()
  }
  return await stmt.run()
}
