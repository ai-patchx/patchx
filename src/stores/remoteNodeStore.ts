import { create } from 'zustand'
import type { RemoteNode, RemoteNodeFormData, ApiResponse } from '@/types'

interface RemoteNodeState {
  nodes: RemoteNode[]
  isLoading: boolean
  error: string | null
}

interface NodeApiResponse extends ApiResponse<RemoteNode | RemoteNode[]> {
  data?: RemoteNode | RemoteNode[]
}

interface RemoteNodeActions {
  fetchNodes: () => Promise<void>
  addNode: (node: RemoteNodeFormData) => Promise<void>
  updateNode: (id: string, node: RemoteNodeFormData) => Promise<void>
  deleteNode: (id: string) => Promise<void>
  testConnection: (id: string) => Promise<boolean>
  testConnectionConfig: (node: RemoteNodeFormData) => Promise<{ success: boolean; message: string }>
  setError: (error: string | null) => void
}

const useRemoteNodeStore = create<RemoteNodeState & RemoteNodeActions>((set, get) => ({
  nodes: [],
  isLoading: false,
  error: null,

  setError: (error) => set({ error }),

  fetchNodes: async () => {
    set({ isLoading: true, error: null })
    try {
      const response = await fetch('/api/nodes', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        const contentType = response.headers.get('content-type')
        if (contentType && contentType.includes('application/json')) {
          const errorData = await response.json().catch(() => ({ error: 'Failed to fetch remote nodes' })) as { error?: string }
          throw new Error(errorData.error || 'Failed to fetch remote nodes')
        } else {
          throw new Error(`Failed to fetch remote nodes: ${response.status} ${response.statusText}`)
        }
      }

      const contentType = response.headers.get('content-type')
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Invalid response format from server')
      }

      const result = await response.json() as NodeApiResponse
      if (result.success && result.data) {
        const nodes = Array.isArray(result.data) ? result.data : [result.data]
        set({ nodes, isLoading: false })
      } else {
        throw new Error(result.error || 'Failed to fetch remote nodes')
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch remote nodes',
        isLoading: false
      })
    }
  },

  addNode: async (nodeData: RemoteNodeFormData) => {
    set({ isLoading: true, error: null })
    try {
      const response = await fetch('/api/nodes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(nodeData)
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to add remote node' })) as { error?: string }
        throw new Error(errorData.error || 'Failed to add remote node')
      }

      const result = await response.json() as NodeApiResponse
      if (result.success && result.data) {
        const node = Array.isArray(result.data) ? result.data[0] : result.data
        set((state) => ({
          nodes: [...state.nodes, node],
          isLoading: false
        }))
      } else {
        throw new Error(result.error || 'Failed to add remote node')
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to add remote node',
        isLoading: false
      })
      throw error
    }
  },

  updateNode: async (id: string, nodeData: RemoteNodeFormData) => {
    set({ isLoading: true, error: null })
    try {
      const response = await fetch(`/api/nodes/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(nodeData)
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to update remote node' })) as { error?: string }
        throw new Error(errorData.error || 'Failed to update remote node')
      }

      const result = await response.json() as NodeApiResponse
      if (result.success && result.data) {
        const node = Array.isArray(result.data) ? result.data[0] : result.data
        set((state) => ({
          nodes: state.nodes.map((n) => (n.id === id ? node : n)),
          isLoading: false
        }))
      } else {
        throw new Error(result.error || 'Failed to update remote node')
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to update remote node',
        isLoading: false
      })
      throw error
    }
  },

  deleteNode: async (id: string) => {
    set({ isLoading: true, error: null })
    try {
      const response = await fetch(`/api/nodes/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to delete remote node' })) as { error?: string }
        throw new Error(errorData.error || 'Failed to delete remote node')
      }

      set((state) => ({
        nodes: state.nodes.filter((node) => node.id !== id),
        isLoading: false
      }))
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to delete remote node',
        isLoading: false
      })
      throw error
    }
  },

  testConnection: async (id: string) => {
    set({ isLoading: true, error: null })
    try {
      const response = await fetch(`/api/nodes/${id}/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Connection test failed' })) as { error?: string }
        throw new Error(errorData.error || 'Connection test failed')
      }

      const result = await response.json() as { success?: boolean }
      set({ isLoading: false })
      return result.success === true
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Connection test failed',
        isLoading: false
      })
      return false
    }
  },

  testConnectionConfig: async (nodeData: RemoteNodeFormData) => {
    set({ error: null })
    try {
      const response = await fetch('/api/nodes/test-config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(nodeData)
      })

      const result = await response.json().catch(() => ({ success: false, error: 'Connection test failed' })) as { success?: boolean; message?: string; error?: string }

      if (!response.ok) {
        // If response is not OK, use the error from the response
        throw new Error(result.error || result.message || `Connection test failed: ${response.status} ${response.statusText}`)
      }

      if (!result.success) {
        throw new Error(result.error || result.message || 'Connection test failed')
      }

      return { success: true, message: result.message || 'Connection test succeeded' }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection test failed'
      set({ error: message })
      return { success: false, message }
    }
  }
}))

export default useRemoteNodeStore

