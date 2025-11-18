import { ConflictResolutionResponse } from '../types/ai'

export interface ConflictData {
  filePath: string
  originalCode: string
  incomingCode: string
  currentCode: string
  conflicts: Array<{
    lineNumber: number
    type: string
    description: string
    original?: string
    incoming?: string
    current?: string
  }>
}

export interface ConflictResolutionUIProps {
  conflictData: ConflictData
  onResolve: (resolution: ConflictResolutionResponse) => void
  onCancel: () => void
  aiProviders: string[]
  isAIEnabled: boolean
}

export interface AIProviderConfig {
  name: string
  baseUrl: string
  apiKey: string
  model: string
  maxTokens?: number
  temperature?: number
  enabled: boolean
}
