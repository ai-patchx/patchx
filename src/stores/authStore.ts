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

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  workerUser: null,
  loading: false,
  error: null,

  signUp: async (email: string, password: string) => {
    set({ loading: true, error: null })
    try {
      const supabase = await getSupabaseClient()
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      })
      if (error) throw error
      set({ user: data.user, loading: false })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
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
    const supabase = await getSupabaseClient()
    await supabase.auth.signOut().catch(() => undefined)
    localStorage.removeItem('px_token')
    localStorage.removeItem('px_user')
    set({ user: null, workerUser: null, loading: false })
  },

  checkUser: async () => {
    try {
      const supabase = await getSupabaseClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        set({ user, workerUser: null })
        return
      }
      const token = localStorage.getItem('px_token')
      const userStr = localStorage.getItem('px_user')
      if (token && userStr) {
        const wUser = JSON.parse(userStr) as WorkerUser
        set({ workerUser: wUser, user: null })
        return
      }
      set({ user: null, workerUser: null })
    } catch {
      set({ user: null, workerUser: null })
    }
  }
}))