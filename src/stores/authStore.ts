import { create } from 'zustand'
import { getSupabaseClient } from '@/lib/d1'
import type { AuthClient } from '@/lib/d1'

// Stub User type (previously from @supabase/supabase-js)
interface User {
  id: string
  email?: string
  email_confirmed_at?: string
  [key: string]: any
}

interface WorkerUser {
  id: string
  username: string
  role?: string
}

interface AuthState {
  user: User | null
  workerUser: WorkerUser | null
  loading: boolean
  error: string | null
  signUp: (email: string, password: string) => Promise<void>
  verifyEmailCode: (email: string, token: string) => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signInWorker: (username: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  checkUser: () => Promise<void>
  isAdmin: () => boolean
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  workerUser: null,
  loading: false,
  error: null,

  signUp: async (email: string, password: string) => {
    set({ loading: true, error: null })
    try {
      // TODO: Reimplement authentication with D1 or alternative auth system
      throw new Error(
        'Email registration is not available. Authentication system needs to be reimplemented after D1 migration. ' +
        'Please use Worker authentication (username/password) instead.'
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      set({ error: message, loading: false })
    }
  },

  verifyEmailCode: async (email: string, token: string) => {
    set({ loading: true, error: null })
    try {
      // TODO: Reimplement email verification with D1 or alternative auth system
      throw new Error(
        'Email verification is not available. Authentication system needs to be reimplemented after D1 migration.'
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      set({ error: message, loading: false })
      throw error
    }
  },

  signIn: async (email: string, password: string) => {
    set({ loading: true, error: null })
    try {
      // TODO: Reimplement email/password authentication with D1 or alternative auth system
      throw new Error(
        'Email/password login is not available. Authentication system needs to be reimplemented after D1 migration. ' +
        'Please use Worker authentication (username/password) instead.'
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      set({ error: message, loading: false })
    }
  },

  signInWorker: async (username: string, password: string) => {
    set({ loading: true, error: null })
    try {
      const base = import.meta.env.VITE_WORKER_BASE_URL
      const url = base ? `${base}/api/auth/login` : '/api/auth/login'
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })
      if (!res.ok) {
        const errData: unknown = await res.json().catch(() => null)
        const msg = (typeof errData === 'object' && errData && 'message' in errData)
          ? String((errData as { message?: unknown }).message)
          : 'Login failed'
        throw new Error(msg)
      }
      const data = await res.json() as { user: WorkerUser; token: string }
      localStorage.setItem('px_token', data.token)
      localStorage.setItem('px_user', JSON.stringify(data.user))
      set({ workerUser: data.user, user: null, loading: false })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      set({ error: message, loading: false })
    }
  },

  signOut: async () => {
    set({ loading: true, error: null })
    try {
      // Clear all authentication state
      // Note: Supabase authentication is no longer available
    } catch (error) {
      // Ignore errors during logout
      console.warn('Sign out error (ignored):', error)
    }
    // Always clear localStorage and state regardless of user type
    localStorage.removeItem('px_token')
    localStorage.removeItem('px_user')
    set({ user: null, workerUser: null, loading: false })
  },

  checkUser: async () => {
    try {
      // Check localStorage for worker user (only authentication method available)
      const token = localStorage.getItem('px_token')
      const userStr = localStorage.getItem('px_user')
      if (token && userStr) {
        try {
          const wUser = JSON.parse(userStr) as WorkerUser
          set({ workerUser: wUser, user: null })
          return
        } catch (parseError) {
          // If parsing fails, clear invalid data
          localStorage.removeItem('px_token')
          localStorage.removeItem('px_user')
        }
      }

      // No Supabase authentication available - only worker auth
      // Clear state if no worker user found
      set({ user: null, workerUser: null })
    } catch (error) {
      // Clear state on error if we don't have valid localStorage data
      const token = localStorage.getItem('px_token')
      const userStr = localStorage.getItem('px_user')
      if (!token || !userStr) {
        set({ user: null, workerUser: null })
      }
    }
  },

  isAdmin: () => {
    const state = get()
    // Only worker users can be admins (regular Supabase users don't have role field)
    return state.workerUser?.role === 'administrator'
  }
}))