import { ConflictResolutionResponse } from '../types/ai'
import type { Env } from '../types'
import { AIConflictResolutionService } from './aiConflictResolutionService'

export class PatchConflictResolver {
  private aiService: AIConflictResolutionService | null = null

  constructor(env: Env) {
    try {
      this.aiService = new AIConflictResolutionService(env)
    } catch (error) {
      console.warn('AI conflict resolution service initialization failed:', error)
      // Continue running, but do not provide AI conflict resolution functionality
    }
  }

  async resolvePatchConflicts(
    patchContent: string,
    targetContent: string,
    filePath: string,
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

    // First try basic conflict detection
    const basicConflicts = this.detectBasicConflicts(patchContent, targetContent)

    if (basicConflicts.length === 0) {
      return {
        success: true,
        resolvedContent: this.applyPatchBasic(patchContent, targetContent),
        manualResolutionRequired: false,
        suggestions: ['No conflicts, patch can be applied directly']
      }
    }

    // If AI service is available and user chooses to use AI
    if (this.aiService && options?.useAI !== false) {
      try {
        const aiResolution = await this.aiService.resolvePatchConflicts(
          patchContent,
          targetContent,
          filePath,
          {
            provider: options?.provider,
            useMultipleProviders: options?.useMultipleProviders
          }
        )

        // Validate AI solution
        if (aiResolution.confidence > 0.7 && !aiResolution.requiresManualReview) {
          return {
            success: true,
            resolvedContent: aiResolution.resolvedCode,
            aiResolution,
            manualResolutionRequired: false,
            suggestions: [
              'AI successfully resolved conflicts',
              ...aiResolution.suggestions
            ]
          }
        } else {
          return {
            success: false,
            resolvedContent: targetContent,
            aiResolution,
            manualResolutionRequired: true,
            suggestions: [
              'AI solution has low confidence, recommend manual review',
              ...aiResolution.suggestions,
              'Please carefully check AI-suggested code changes'
            ]
          }
        }
      } catch (error) {
        console.error('AI conflict resolution failed:', error)
        return {
          success: false,
          resolvedContent: targetContent,
          manualResolutionRequired: true,
          suggestions: [
            'AI conflict resolution failed',
            'Please resolve conflicts manually',
            'Check AI service configuration',
            `Error message: ${error instanceof Error ? error.message : 'Unknown error'}`
          ]
        }
      }
    }

    // No AI service or AI resolution failed, return manual resolution suggestions
    return {
      success: false,
      resolvedContent: targetContent,
      manualResolutionRequired: true,
      suggestions: [
        'Code conflicts detected, manual resolution required',
        'Please carefully compare differences between original code and incoming code',
        'Ensure merged code maintains functionality integrity',
        'Recommend adding appropriate comments explaining conflict resolution',
        ...basicConflicts.map(conflict =>
          `Conflict in file ${conflict.filePath} at line ${conflict.lineNumber}: ${conflict.conflictType}`
        )
      ]
    }
  }

  private detectBasicConflicts(patchContent: string, targetContent: string): Array<{
    filePath: string
    lineNumber: number
    conflictType: string
  }> {
    const conflicts = []
    const patchLines = patchContent.split('\n')
    const targetLines = targetContent.split('\n')

    // Simple conflict detection
    let lineNumber = 0
    for (const patchLine of patchLines) {
      lineNumber++

      if (patchLine.startsWith('+')) {
        const content = patchLine.substring(1).trim()
        if (content.length > 0) {
          // Check if same content already exists
          const exists = targetLines.some(targetLine =>
            targetLine.trim() === content
          )
          if (exists) {
            conflicts.push({
              filePath: 'unknown',
              lineNumber,
              conflictType: 'add_add'
            })
          }
        }
      }

      if (patchLine.startsWith('-')) {
        const content = patchLine.substring(1).trim()
        if (content.length > 0) {
          // Check if content to be deleted exists
          const exists = targetLines.some(targetLine =>
            targetLine.trim() === content
          )
          if (!exists) {
            conflicts.push({
              filePath: 'unknown',
              lineNumber,
              conflictType: 'delete_missing'
            })
          }
        }
      }
    }

    return conflicts
  }

  private applyPatchBasic(patchContent: string, targetContent: string): string {
    // Basic patch application logic (simplified version)
    // More complex patch application logic should be implemented here
    // Currently just returns original content
    return targetContent
  }

  isAIEnabled(): boolean {
    return this.aiService !== null
  }

  getAvailableAIProviders(): string[] {
    return this.aiService ? this.aiService.getAvailableProviders() : []
  }

  async testAIProviders(): Promise<Array<{
    provider: string
    success: boolean
    latency: number
    error?: string
  }>> {
    if (!this.aiService) {
      return []
    }

    return await this.aiService.testAIProviders()
  }
}