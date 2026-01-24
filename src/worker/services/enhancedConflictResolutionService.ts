import { PatchConflict } from '../types/ai'
import type { Env } from '../types'

export interface ThreeWayDiff {
  base: string[]
  incoming: string[]
  current: string[]
  conflicts: Array<{
    lineNumber: number
    original: string
    incoming: string
    current: string
    conflictType: 'add_add' | 'delete_add' | 'modify_modify' | 'context_conflict'
  }>
}

export interface ConflictResolutionRequest {
  originalCode: string
  incomingCode: string
  currentCode: string
  filePath: string
  conflicts: PatchConflict[]
}

export class EnhancedConflictResolutionService {
  private env: Env

  constructor(env: Env) {
    this.env = env
  }

  /**
   * Perform three-way diff analysis
   */
  performThreeWayDiff(
    originalCode: string,
    incomingCode: string,
    currentCode: string
  ): ThreeWayDiff {
    const baseLines = originalCode.split('\n')
    const incomingLines = incomingCode.split('\n')
    const currentLines = currentCode.split('\n')

    const maxLines = Math.max(baseLines.length, incomingLines.length, currentLines.length)
    const conflicts: ThreeWayDiff['conflicts'] = []

    for (let i = 0; i < maxLines; i++) {
      const baseLine = baseLines[i] || ''
      const incomingLine = incomingLines[i] || ''
      const currentLine = currentLines[i] || ''

      // Detect different types of conflicts
      const conflictType = this.detectConflictType(baseLine, incomingLine, currentLine)

      if (conflictType) {
        conflicts.push({
          lineNumber: i + 1,
          original: baseLine,
          incoming: incomingLine,
          current: currentLine,
          conflictType
        })
      }
    }

    return {
      base: baseLines,
      incoming: incomingLines,
      current: currentLines,
      conflicts
    }
  }

  /**
   * Detect conflict type
   */
  private detectConflictType(
    base: string,
    incoming: string,
    current: string
  ): ThreeWayDiff['conflicts'][0]['conflictType'] | null {
    // Identical, no conflict
    if (base === incoming && base === current) {
      return null
    }

    // Add-add conflict: base is empty, incoming and current both have content and differ
    if (!base.trim() && incoming.trim() && current.trim() && incoming !== current) {
      return 'add_add'
    }

    // Delete-add conflict: base has content, incoming is empty, current has content
    if (base.trim() && !incoming.trim() && current.trim()) {
      return 'delete_add'
    }

    // Modify-modify conflict: base is same, incoming and current differ
    if (base === current && base !== incoming) {
      return 'modify_modify'
    }

    // Context conflict: all three differ
    if (base !== incoming && base !== current && incoming !== current) {
      return 'context_conflict'
    }

    return null
  }

  /**
   * Apply conflict resolution
   */
  applyConflictResolution(
    threeWayDiff: ThreeWayDiff,
    resolutions: Record<number, {
      type: 'original' | 'incoming' | 'custom'
      content: string
    }>
  ): string {
    const { current, conflicts } = threeWayDiff
    const resolvedLines = [...current]

    conflicts.forEach(conflict => {
      const resolution = resolutions[conflict.lineNumber]
      if (!resolution) {
        // No resolution, keep current version
        return
      }

      const lineIndex = conflict.lineNumber - 1
      switch (resolution.type) {
        case 'original':
          resolvedLines[lineIndex] = conflict.original
          break
        case 'incoming':
          resolvedLines[lineIndex] = conflict.incoming
          break
        case 'custom':
          resolvedLines[lineIndex] = resolution.content
          break
      }
    })

    return resolvedLines.join('\n')
  }

  /**
   * Validate resolution result
   */
  validateResolution(
    resolvedCode: string,
    originalCode: string,
    incomingCode: string
  ): {
    isValid: boolean
    issues: string[]
    warnings: string[]
    suggestions: string[]
  } {
    const issues: string[] = []
    const warnings: string[] = []
    const suggestions: string[] = []

    // Basic validation
    if (!resolvedCode || resolvedCode.trim().length === 0) {
      issues.push('Resolved code is empty')
      return { isValid: false, issues, warnings, suggestions }
    }

    // Syntax validation (simplified version)
    const syntaxValidation = this.validateSyntax(resolvedCode)
    if (!syntaxValidation.isValid) {
      issues.push(...syntaxValidation.issues)
    }

    // Completeness validation
    const completenessValidation = this.validateCompleteness(
      resolvedCode,
      originalCode,
      incomingCode
    )
    warnings.push(...completenessValidation.warnings)
    suggestions.push(...completenessValidation.suggestions)

    return {
      isValid: issues.length === 0,
      issues,
      warnings,
      suggestions
    }
  }

  /**
   * Syntax validation
   */
  private validateSyntax(code: string): {
    isValid: boolean
    issues: string[]
  } {
    const issues: string[] = []

    // Bracket matching
    const openBraces = (code.match(/\{/g) || []).length
    const closeBraces = (code.match(/\}/g) || []).length
    const openParens = (code.match(/\(/g) || []).length
    const closeParens = (code.match(/\)/g) || []).length
    const openBrackets = (code.match(/\[/g) || []).length
    const closeBrackets = (code.match(/\]/g) || []).length

    if (openBraces !== closeBraces) {
      issues.push(`Braces do not match: ${openBraces} open, ${closeBraces} close`)
    }
    if (openParens !== closeParens) {
      issues.push(`Parentheses do not match: ${openParens} open, ${closeParens} close`)
    }
    if (openBrackets !== closeBrackets) {
      issues.push(`Brackets do not match: ${openBrackets} open, ${closeBrackets} close`)
    }

    // Check common syntax error patterns (not logged as warnings, only for potential issue identification)
    const syntaxPatterns = [
      /;\s*}/g,
      /{\s*;/g,
      /\b(if|for|while|function)\s*\(\s*\)\s*{/g
    ]
    syntaxPatterns.forEach(pattern => {
      if (pattern.test(code)) {
        issues.push('Possible syntax anomaly detected')
      }
    })

    return {
      isValid: issues.length === 0,
      issues
    }
  }

  /**
   * Completeness validation
   */
  private validateCompleteness(
    resolvedCode: string,
    originalCode: string,
    incomingCode: string
  ): {
    warnings: string[]
    suggestions: string[]
  } {
    const warnings: string[] = []
    const suggestions: string[] = []

    const originalLines = originalCode.split('\n').filter(line => line.trim().length > 0)
    const incomingLines = incomingCode.split('\n').filter(line => line.trim().length > 0)
    const resolvedLines = resolvedCode.split('\n').filter(line => line.trim().length > 0)

    // Check preservation ratio of original code
    const preservedOriginalLines = originalLines.filter(originalLine =>
      resolvedLines.some(resolvedLine => resolvedLine.includes(originalLine.trim()))
    )

    const originalPreservationRatio = preservedOriginalLines.length / originalLines.length
    if (originalPreservationRatio < 0.3) {
      warnings.push(`Original code preservation ratio is low (${(originalPreservationRatio * 100).toFixed(1)}%)`)
      suggestions.push('Check if important original code was accidentally deleted')
    }

    // Check integration ratio of incoming code
    const integratedIncomingLines = incomingLines.filter(incomingLine =>
      resolvedLines.some(resolvedLine => resolvedLine.includes(incomingLine.trim()))
    )

    const incomingIntegrationRatio = integratedIncomingLines.length / incomingLines.length
    if (incomingIntegrationRatio < 0.5) {
      warnings.push(`Incoming code integration ratio is low (${(incomingIntegrationRatio * 100).toFixed(1)}%)`)
      suggestions.push('Check if incoming changes were successfully integrated')
    }

    // Check code line count changes
    const lineCountChange = Math.abs(resolvedLines.length - originalLines.length)
    if (lineCountChange > originalLines.length * 0.5) {
      warnings.push('Code line count change is significant, please check if unexpected changes were introduced')
    }

    return { warnings, suggestions }
  }

  /**
   * Generate conflict resolution report
   */
  generateResolutionReport(
    threeWayDiff: ThreeWayDiff,
    resolutions: Record<number, {
      type: 'original' | 'incoming' | 'custom'
      content: string
    }>,
    validationResult: ReturnType<typeof this.validateResolution>
  ): string {
    const report: string[] = []

    report.push('=== Patch Conflict Resolution Report ===')
    report.push('')
    report.push(`Total conflicts: ${threeWayDiff.conflicts.length}`)
    report.push(`Resolved conflicts: ${Object.keys(resolutions).length}`)
    report.push(`Unresolved conflicts: ${threeWayDiff.conflicts.length - Object.keys(resolutions).length}`)
    report.push('')

    // Resolution statistics
    const resolutionStats = {
      original: 0,
      incoming: 0,
      custom: 0
    }

    Object.values(resolutions).forEach(resolution => {
      resolutionStats[resolution.type]++
    })

    report.push('Resolution method statistics:')
    report.push(`- Using original version: ${resolutionStats.original}`)
    report.push(`- Using incoming version: ${resolutionStats.incoming}`)
    report.push(`- Custom resolution: ${resolutionStats.custom}`)
    report.push('')

    // Validation results
    report.push('Validation results:')
    if (validationResult.isValid) {
      report.push('✓ Code syntax validation passed')
    } else {
      report.push('✗ Syntax issues found:')
      validationResult.issues.forEach(issue => report.push(`  - ${issue}`))
    }

    if (validationResult.warnings.length > 0) {
      report.push('⚠️  Warnings:')
      validationResult.warnings.forEach(warning => report.push(`  - ${warning}`))
    }

    if (validationResult.suggestions.length > 0) {
      report.push('💡 Suggestions:')
      validationResult.suggestions.forEach(suggestion => report.push(`  - ${suggestion}`))
    }

    return report.join('\n')
  }

  /**
   * Auto-resolve simple conflicts
   */
  autoResolveSimpleConflicts(threeWayDiff: ThreeWayDiff): {
    resolved: boolean
    resolutions: Record<number, {
      type: 'original' | 'incoming' | 'custom'
      content: string
    }>
    explanation: string
  } {
    const resolutions: Record<number, {
      type: 'original' | 'incoming' | 'custom'
      content: string
    }> = {}

    let resolvedCount = 0

    threeWayDiff.conflicts.forEach(conflict => {
      // Auto-resolution strategy: choose best solution based on conflict type
      switch (conflict.conflictType) {
        case 'add_add':
          // Add-add conflict: merge two lines (if possible)
          if (conflict.original.trim() === '' && conflict.incoming !== conflict.current) {
            resolutions[conflict.lineNumber] = {
              type: 'custom',
              content: `${conflict.incoming} ${conflict.current}`
            }
            resolvedCount++
          }
          break

        case 'delete_add':
          // Delete-add conflict: prioritize keeping added content
          if (!conflict.incoming.trim() && conflict.current.trim()) {
            resolutions[conflict.lineNumber] = {
              type: 'incoming',
              content: conflict.incoming
            }
            resolvedCount++
          }
          break

        case 'modify_modify': {
          const similarity = this.calculateSimilarity(conflict.incoming, conflict.current)
          if (similarity > 0.8) {
            resolutions[conflict.lineNumber] = {
              type: 'custom',
              content: conflict.current.length > conflict.incoming.length ? conflict.current : conflict.incoming
            }
            resolvedCount++
          }
          break
        }
      }
    })

    return {
      resolved: resolvedCount > 0,
      resolutions,
      explanation: `Auto-resolved ${resolvedCount} simple conflicts`
    }
  }

  /**
   * Calculate string similarity
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2
    const shorter = str1.length > str2.length ? str2 : str1

    if (longer.length === 0) return 1.0

    const editDistance = this.levenshteinDistance(longer, shorter)
    return (longer.length - editDistance) / longer.length
  }

  /**
   * Levenshtein distance algorithm
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = []

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i]
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1]
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          )
        }
      }
    }

    return matrix[str2.length][str1.length]
  }
}