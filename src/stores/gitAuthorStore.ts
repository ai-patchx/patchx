import { create } from 'zustand'

interface GitAuthorState {
  authorName: string
  authorEmail: string
}

interface GitAuthorActions {
  setAuthorName: (name: string) => void
  setAuthorEmail: (email: string) => void
  loadFromStorage: () => void
  saveToStorage: () => void
}

const useGitAuthorStore = create<GitAuthorState & GitAuthorActions>((set, get) => ({
  authorName: '',
  authorEmail: '',

  setAuthorName: (name) => {
    set({ authorName: name })
    get().saveToStorage()
  },

  setAuthorEmail: (email) => {
    set({ authorEmail: email })
    get().saveToStorage()
  },

  loadFromStorage: () => {
    try {
      const stored = localStorage.getItem('gitAuthorConfig')
      if (stored) {
        const config = JSON.parse(stored)
        set({
          authorName: config.authorName || '',
          authorEmail: config.authorEmail || ''
        })
      }
    } catch (error) {
      console.warn('Failed to load git author config from storage:', error)
    }
  },

  saveToStorage: () => {
    try {
      const { authorName, authorEmail } = get()
      localStorage.setItem('gitAuthorConfig', JSON.stringify({ authorName, authorEmail }))
    } catch (error) {
      console.warn('Failed to save git author config to storage:', error)
    }
  }
}))

export default useGitAuthorStore