import { ConflictResolutionRequest, ConflictResolutionResponse, PatchConflict } from '../types/ai'
import { AIService } from './aiService'

export class ConflictResolutionService {
  private aiService: AIService

  constructor(aiService: AIService) {
    this.aiService = aiService
  }

  async resolvePatchConflicts(
    patchContent: string,
    targetContent: string,
    filePath: string
  ): Promise<ConflictResolutionResponse> {

    // 1. Detect conflicts
    const conflicts = await this.detectConflicts(patchContent, targetContent, filePath)

    if (conflicts.length === 0) {
      return {
        resolvedCode: targetContent,
        explanation: 'No conflicts detected, patch can be applied directly',
        confidence: 1.0,
        suggestions: [],
        requiresManualReview: false
      }
    }

    // 2. Build conflict resolution request
    const request: ConflictResolutionRequest = {
      originalCode: targetContent,
      incomingCode: patchContent,
      currentCode: targetContent,
      filePath: filePath,
      conflictMarkers: conflicts.map(conflict => ({
        start: conflict.lineNumber,
        end: conflict.lineNumber + 1,
        original: conflict.original,
        incoming: conflict.incoming
      }))
    }

    // 3. Call AI to resolve conflicts
    return await this.aiService.resolvePatchConflict(request)
  }

  private async detectConflicts(
    patchContent: string,
    targetContent: string,
    filePath: string
  ): Promise<PatchConflict[]> {
    const conflicts: PatchConflict[] = []

    // Parse patch file
    const patchLines = patchContent.split('\n')
    const targetLines = targetContent.split('\n')

    // Simple conflict detection logic

    for (let i = 0; i < patchLines.length; i++) {
      const patchLine = patchLines[i]

      // Skip patch header information
      if (patchLine.startsWith('---') || patchLine.startsWith('+++') || patchLine.startsWith('@@')) {
        continue
      }

      // Detect delete operations
      if (patchLine.startsWith('-')) {
        const content = patchLine.substring(1)
        // Check if target file contains this line
        const found = targetLines.find(line => line.trim() === content.trim())
        if (!found) {
          conflicts.push({
            filePath,
            lineNumber: i + 1,
            original: content,
            incoming: '',
            current: '',
            conflictType: 'delete_add'
          })
        }
      }

      // Detect add operations
      if (patchLine.startsWith('+')) {
        const content = patchLine.substring(1)
        // Check if target file already contains the same content
        const exists = targetLines.find(line => line.trim() === content.trim())
        if (exists) {
          conflicts.push({
            filePath,
            lineNumber: i + 1,
            original: content,
            incoming: content,
            current: content,
            conflictType: 'add_add'
          })
        }
      }

      // Context lines
      if (patchLine.startsWith(' ')) {
        // Context counting logic can be extended as needed
      }
    }

    return conflicts
  }

  async validateResolution(resolvedCode: string, originalCode: string): Promise<{
    valid: boolean
    issues: string[]
    suggestions: string[]
  }> {
    const issues: string[] = []
    const suggestions: string[] = []

    // Basic validation
    if (!resolvedCode || resolvedCode.trim().length === 0) {
      issues.push('Resolved code is empty')
      return { valid: false, issues, suggestions }
    }

    // Syntax validation (simple bracket matching)
    const openBraces = (resolvedCode.match(/\{/g) || []).length
    const openParens = (resolvedCode.match(/\(/g) || []).length
    const openBrackets = (resolvedCode.match(/\[/g) || []).length
    const closeBraces = (resolvedCode.match(/\}/g) || []).length
    const closeParens = (resolvedCode.match(/\)/g) || []).length
    const closeBrackets = (resolvedCode.match(/\]/g) || []).length

    const openTotal = openBraces + openParens + openBrackets
    const closeTotal = closeBraces + closeParens + closeBrackets

    if (openTotal !== closeTotal) {
      issues.push('Brackets do not match, possible syntax error')
      suggestions.push('Please check bracket matching in code')
    }

    // Check if important original code is preserved
    const originalLines = originalCode.split('\n').filter(line => line.trim().length > 0)
    const resolvedLines = resolvedCode.split('\n').filter(line => line.trim().length > 0)

    const preservedLines = originalLines.filter(line =>
      resolvedLines.some(resolvedLine => resolvedLine.includes(line.trim()))
    )

    const preservationRatio = preservedLines.length / originalLines.length

    if (preservationRatio < 0.5) {
      suggestions.push('Resolved code differs significantly from original code, recommend careful review')
    }

    return {
      valid: issues.length === 0,
      issues,
      suggestions
    }
  }
}