import { ConflictResolutionResponse } from '../types/ai'
import { PatchConflictResolver } from './patchConflictResolver'
import { Env, Upload } from '../types'

export class EnhancedPatchService {
  private conflictResolver: PatchConflictResolver

  constructor(env: Env) {
    this.conflictResolver = new PatchConflictResolver(env)
  }

  async processPatchWithAI(
    upload: Upload,
    targetContent: string,
    options?: {
      useAI?: boolean
      provider?: string
      useMultipleProviders?: boolean
    }
  ): Promise<{
    success: boolean
    resolvedContent: string
    aiResolution?: ConflictResolutionResponse
    manualResolutionRequired: boolean
    suggestions: string[]
  }> {

    // First validate patch format
    const validation = this.validatePatchFormat(upload.content)
    if (!validation.valid) {
      return {
        success: false,
        resolvedContent: targetContent,
        manualResolutionRequired: true,
        suggestions: [`Patch format validation failed: ${validation.error}`]
      }
    }

    // Try to apply patch and detect conflicts
    return await this.conflictResolver.resolvePatchConflicts(
      upload.content,
      targetContent,
      upload.filename,
      {
        useAI: options?.useAI !== false && this.conflictResolver.isAIEnabled(),
        provider: options?.provider,
        useMultipleProviders: options?.useMultipleProviders
      }
    )
  }

  private validatePatchFormat(content: string): { valid: boolean; error?: string } {
    try {
      // Check basic patch format
      if (!content.includes('---') || !content.includes('+++')) {
        return { valid: false, error: 'Missing patch file header information' }
      }

      if (!content.includes('@@')) {
        return { valid: false, error: 'Missing diff block markers' }
      }

      const lines = content.split('\n')
      let hasValidDiff = false

      for (const line of lines) {
        if (line.startsWith('@@')) {
          hasValidDiff = true
        }

        // Check line format
        if (line.length > 0 && !line.startsWith('---') && !line.startsWith('+++')) {
          const firstChar = line[0]
          if (firstChar !== '@' && firstChar !== '+' && firstChar !== '-' && firstChar !== ' ') {
            return { valid: false, error: `Invalid line format: ${line}` }
          }
        }
      }

      if (!hasValidDiff) {
        return { valid: false, error: 'No valid diff blocks found' }
      }

      return { valid: true }
    } catch (error) {
      return {
        valid: false,
        error: `Patch format validation error: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }
  }

  isAIEnabled(): boolean {
    return this.conflictResolver.isAIEnabled()
  }

  getAvailableAIProviders(): string[] {
    return this.conflictResolver.getAvailableAIProviders()
  }

  async testAIProviders(): Promise<Array<{
    provider: string
    success: boolean
    latency: number
    error?: string
  }>> {
    return await this.conflictResolver.testAIProviders()
  }

  async generateConflictReport(
    upload: Upload,
    targetContent: string
  ): Promise<{
    hasConflicts: boolean
    conflicts: Array<{
      type: string
      line: number
      description: string
    }>
    recommendations: string[]
    aiSuggestions?: string[]
  }> {

    const result = await this.processPatchWithAI(upload, targetContent, { useAI: false })

    return {
      hasConflicts: !result.success,
      conflicts: result.suggestions.map(suggestion => ({
        type: 'conflict',
        line: 0,
        description: suggestion
      })),
      recommendations: result.suggestions,
      aiSuggestions: result.aiResolution?.suggestions
    }
  }
}