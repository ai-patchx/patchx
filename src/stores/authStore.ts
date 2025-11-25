import { create } from 'zustand'
import { getSupabaseClient } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

interface WorkerUser {
  id: string
  username: string
}

interface AuthState {
  user: User | null
  workerUser: WorkerUser | null
  loading: boolean
  error: string | null
  signUp: (email: string, password: string) => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signInWorker: (username: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  checkUser: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  workerUser: null,
  loading: false,
  error: null,

  signUp: async (email: string, password: string) => {
    set({ loading: true, error: null })
    try {
      const supabase = await getSupabaseClient()

      const getRedirectBaseUrl = () => {
        const envUrl = import.meta.env.VITE_PUBLIC_SITE_URL?.trim()
        if (envUrl) {
          return envUrl
        }
        if (typeof window !== 'undefined') {
          const globalUrl = window.__PX_PUBLIC_SITE_URL
          if (globalUrl) {
            return globalUrl
          }
          return window.location.origin
        }
        return 'https://patchx.pages.dev'
      }

      const getRedirectUrl = () => `${getRedirectBaseUrl().replace(/\/$/, '')}/auth/confirm`

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: getRedirectUrl(),
        },
      })
      if (error) throw error

      // Check if email confirmation is required
      set({ user: data.user, loading: false })
    } catch (error) {
      let message = error instanceof Error ? error.message : String(error)

      // Provide more helpful error messages
      if (message.includes('User already registered')) {
        message = 'This email is already registered. Please try logging in instead.'
      } else if (message.includes('Password')) {
        message = 'Password must be at least 6 characters long.'
      } else if (message.includes('Invalid email')) {
        message = 'Please enter a valid email address.'
      }

      set({ error: message, loading: false })
    }
  },

  signIn: async (email: string, password: string) => {
    set({ loading: true, error: null })
    try {
      const supabase = await getSupabaseClient()
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) throw error
      set({ user: data.user, workerUser: null, loading: false })
    } catch (error) {
      let message = error instanceof Error ? error.message : String(error)

      // Provide more helpful error messages
      if (message.includes('Invalid login credentials') || message.includes('Email not confirmed')) {
        message = 'Invalid email or password. If you just registered, please check your email to confirm your account first.'
      } else if (message.includes('Email not confirmed')) {
        message = 'Please check your email and confirm your account before logging in.'
      } else if (message.includes('Invalid email')) {
        message = 'Please enter a valid email address.'
      } else if (message.includes('Password')) {
        message = 'Invalid password. Please try again.'
      }

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
          : '登录失败'
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
      // Only call Supabase signOut if we have a regular user
      // Worker users don't use Supabase, so skip it for them
      const currentUser = get().user
      if (currentUser) {
        const supabase = await getSupabaseClient()
        await supabase.auth.signOut().catch(() => undefined)
      }
    } catch (error) {
      // Ignore Supabase errors during logout (e.g., if Supabase is not configured)
      console.warn('Supabase signOut error (ignored):', error)
    }
    // Always clear localStorage and state regardless of user type
    localStorage.removeItem('px_token')
    localStorage.removeItem('px_user')
    set({ user: null, workerUser: null, loading: false })
  },

  checkUser: async () => {
    try {
      // First check localStorage for worker user (faster and more reliable for worker auth)
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

      // Then check Supabase for regular user
      const supabase = await getSupabaseClient()
      const { data: { user }, error } = await supabase.auth.getUser()
      if (user && !error) {
        set({ user, workerUser: null })
        return
      }

      // Only clear state if we've checked both and found nothing
      if (!token && !user) {
        set({ user: null, workerUser: null })
      }
    } catch (error) {
      // Only clear state on error if we don't have valid localStorage data
      const token = localStorage.getItem('px_token')
      const userStr = localStorage.getItem('px_user')
      if (!token || !userStr) {
        set({ user: null, workerUser: null })
      }
    }
  }
}))