/**
 * D1 Database Helper (Frontend)
 *
 * NOTE: D1 databases are only accessible from Cloudflare Workers, not from the frontend.
 * This file provides helper functions and types for frontend code that may need to
 * interact with D1-backed APIs.
 *
 * For authentication and other features that previously used Supabase, they need to
 * be reimplemented using Worker API endpoints that interact with D1.
 */

/**
 * Helper to get the Worker API base URL
 */
export function getWorkerBaseUrl(): string {
  if (typeof window === 'undefined') {
    return ''
  }

  // Check for explicit configuration
  const workerBaseUrl = import.meta.env.VITE_WORKER_BASE_URL
  if (workerBaseUrl) {
    return workerBaseUrl
  }

  // Fallback to same origin (for Cloudflare Pages with _redirects)
  return ''
}

/**
 * Helper to make authenticated API calls to Worker endpoints
 */
export async function callWorkerAPI(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const baseUrl = getWorkerBaseUrl()
  const url = baseUrl ? `${baseUrl}${endpoint}` : endpoint

  const token = typeof window !== 'undefined' ? localStorage.getItem('px_token') : null

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  return fetch(url, {
    ...options,
    headers,
  })
}

/**
 * Stub types for backward compatibility
 * These are placeholders for authentication features that need to be reimplemented
 */
export interface AuthClient {
  auth: {
    signInWithOtp: (options: any) => Promise<any>
    verifyOtp: (options: any) => Promise<any>
    signInWithPassword: (options: any) => Promise<any>
    signOut: () => Promise<any>
    getUser: () => Promise<any>
    getSession: () => Promise<any>
    setSession: (session: any) => Promise<any>
    updateUser: (options: any) => Promise<any>
  }
}

/**
 * Get authentication client (stub - needs reimplementation)
 *
 * @deprecated This function is a stub. Authentication needs to be reimplemented
 * using Worker API endpoints that interact with D1 database.
 */
export const getSupabaseClient = async (): Promise<AuthClient> => {
  throw new Error(
    'Supabase authentication is no longer available. ' +
    'Authentication system needs to be reimplemented for D1 database. ' +
    'Please use the Worker authentication endpoint (/api/auth/login) instead.'
  )
}
