import { create } from 'zustand'
import { getSupabaseClient } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

interface AuthState {
  user: User | null
  loading: boolean
  error: string | null
  signUp: (email: string, password: string) => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  checkUser: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
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
      set({ user: data.user, loading: false })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      set({ error: message, loading: false })
    }
  },

  signOut: async () => {
    set({ loading: true, error: null })
    try {
      const supabase = await getSupabaseClient()
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      set({ user: null, loading: false })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      set({ error: message, loading: false })
    }
  },

  checkUser: async () => {
    try {
      const supabase = await getSupabaseClient()
      const { data: { user } } = await supabase.auth.getUser()
      set({ user })
    } catch {
      set({ user: null })
    }
  }
}))