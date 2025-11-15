import { ConflictResolutionResponse } from '../types/ai'

export interface ConflictResolutionUIProps {
  conflictData: {
    filePath: string
    originalCode: string
    incomingCode: string
    currentCode: string
    conflicts: Array<{
      lineNumber: number
      type: string
      description: string
    }>
  }
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