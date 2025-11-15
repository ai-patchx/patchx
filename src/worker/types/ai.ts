export interface AIProvider {
  name: string
  baseUrl: string
  apiKey: string
  model: string
  maxTokens?: number
  temperature?: number
}

export interface ConflictResolutionRequest {
  originalCode: string
  incomingCode: string
  currentCode: string
  filePath: string
  conflictMarkers: Array<{
    start: number
    end: number
    original: string
    incoming: string
  }>
}

export interface ConflictResolutionResponse {
  resolvedCode: string
  explanation: string
  confidence: number
  suggestions: string[]
  requiresManualReview: boolean
}

export interface PatchConflict {
  filePath: string
  lineNumber: number
  original: string
  incoming: string
  current: string
  conflictType: 'add_add' | 'add_delete' | 'delete_add' | 'modify_modify'
}