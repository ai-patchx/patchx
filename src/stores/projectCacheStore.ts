import { create } from 'zustand'

interface CachedProjects {
  data: Array<{ id: string; name: string; description?: string }>
  timestamp: number
}

interface CachedBranches {
  data: Array<{ ref: string; revision: string; name: string }>
  timestamp: number
}

interface ProjectCacheState {
  projectsCache: CachedProjects | null
  branchesCache: Record<string, CachedBranches>
  cacheExpiry: number // Cache expiry time in milliseconds (default: 10 minutes)
}

interface ProjectCacheActions {
  getCachedProjects: () => Array<{ id: string; name: string; description?: string }> | null
  setCachedProjects: (projects: Array<{ id: string; name: string; description?: string }>) => void
  getCachedBranches: (projectName: string) => Array<{ ref: string; revision: string; name: string }> | null
  setCachedBranches: (projectName: string, branches: Array<{ ref: string; revision: string; name: string }>) => void
  clearCache: () => void
  clearBranchesCache: (projectName?: string) => void
  isCacheValid: (timestamp: number) => boolean
  loadFromStorage: () => void
  saveToStorage: () => void
}

const CACHE_EXPIRY_MS = 10 * 60 * 1000 // 10 minutes
const STORAGE_KEY_PROJECTS = 'patchx_projects_cache'
const STORAGE_KEY_BRANCHES = 'patchx_branches_cache'

const useProjectCacheStore = create<ProjectCacheState & ProjectCacheActions>((set, get) => ({
  projectsCache: null,
  branchesCache: {},
  cacheExpiry: CACHE_EXPIRY_MS,

  isCacheValid: (timestamp: number) => {
    const now = Date.now()
    return (now - timestamp) < get().cacheExpiry
  },

  getCachedProjects: () => {
    const { projectsCache, isCacheValid } = get()
    if (projectsCache && isCacheValid(projectsCache.timestamp)) {
      return projectsCache.data
    }
    return null
  },

  setCachedProjects: (projects) => {
    set({
      projectsCache: {
        data: projects,
        timestamp: Date.now()
      }
    })
    get().saveToStorage()
  },

  getCachedBranches: (projectName: string) => {
    const { branchesCache, isCacheValid } = get()
    const cached = branchesCache[projectName]
    if (cached && isCacheValid(cached.timestamp)) {
      return cached.data
    }
    return null
  },

  setCachedBranches: (projectName: string, branches) => {
    set((state) => ({
      branchesCache: {
        ...state.branchesCache,
        [projectName]: {
          data: branches,
          timestamp: Date.now()
        }
      }
    }))
    get().saveToStorage()
  },

  clearCache: () => {
    set({
      projectsCache: null,
      branchesCache: {}
    })
    try {
      localStorage.removeItem(STORAGE_KEY_PROJECTS)
      localStorage.removeItem(STORAGE_KEY_BRANCHES)
    } catch (error) {
      console.warn('Failed to clear cache from storage:', error)
    }
  },

  clearBranchesCache: (projectName?: string) => {
    if (projectName) {
      set((state) => {
        const newBranchesCache = { ...state.branchesCache }
        delete newBranchesCache[projectName]
        return { branchesCache: newBranchesCache }
      })
    } else {
      set({ branchesCache: {} })
    }
    get().saveToStorage()
  },

  loadFromStorage: () => {
    try {
      // Load projects cache
      const projectsStored = localStorage.getItem(STORAGE_KEY_PROJECTS)
      if (projectsStored) {
        const cached: CachedProjects = JSON.parse(projectsStored)
        if (get().isCacheValid(cached.timestamp)) {
          set({ projectsCache: cached })
        } else {
          localStorage.removeItem(STORAGE_KEY_PROJECTS)
        }
      }

      // Load branches cache
      const branchesStored = localStorage.getItem(STORAGE_KEY_BRANCHES)
      if (branchesStored) {
        const cached: Record<string, CachedBranches> = JSON.parse(branchesStored)
        const validBranches: Record<string, CachedBranches> = {}

        // Filter out expired entries
        Object.entries(cached).forEach(([projectName, branchCache]) => {
          if (get().isCacheValid(branchCache.timestamp)) {
            validBranches[projectName] = branchCache
          }
        })

        set({ branchesCache: validBranches })

        // Update storage with only valid entries
        if (Object.keys(validBranches).length !== Object.keys(cached).length) {
          localStorage.setItem(STORAGE_KEY_BRANCHES, JSON.stringify(validBranches))
        }
      }
    } catch (error) {
      console.warn('Failed to load cache from storage:', error)
    }
  },

  saveToStorage: () => {
    try {
      const { projectsCache, branchesCache } = get()

      if (projectsCache) {
        localStorage.setItem(STORAGE_KEY_PROJECTS, JSON.stringify(projectsCache))
      }

      if (Object.keys(branchesCache).length > 0) {
        localStorage.setItem(STORAGE_KEY_BRANCHES, JSON.stringify(branchesCache))
      }
    } catch (error) {
      console.warn('Failed to save cache to storage:', error)
    }
  }
}))

export default useProjectCacheStore

