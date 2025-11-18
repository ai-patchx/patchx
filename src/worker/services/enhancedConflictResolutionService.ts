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
   * 执行三向差异分析
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

      // 检测不同类型的冲突
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
   * 检测冲突类型
   */
  private detectConflictType(
    base: string,
    incoming: string,
    current: string
  ): ThreeWayDiff['conflicts'][0]['conflictType'] | null {
    // 完全相同，无冲突
    if (base === incoming && base === current) {
      return null
    }

    // 添加-添加冲突：base为空，incoming和current都有内容且不同
    if (!base.trim() && incoming.trim() && current.trim() && incoming !== current) {
      return 'add_add'
    }

    // 删除-添加冲突：base有内容，incoming为空，current有内容
    if (base.trim() && !incoming.trim() && current.trim()) {
      return 'delete_add'
    }

    // 修改-修改冲突：base相同，incoming和current不同
    if (base === current && base !== incoming) {
      return 'modify_modify'
    }

    // 上下文冲突：三方都不同
    if (base !== incoming && base !== current && incoming !== current) {
      return 'context_conflict'
    }

    return null
  }

  /**
   * 应用冲突解决
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
        // 没有解决，保留当前版本
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
   * 验证解决结果
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

    // 基本验证
    if (!resolvedCode || resolvedCode.trim().length === 0) {
      issues.push('解决后的代码为空')
      return { isValid: false, issues, warnings, suggestions }
    }

    // 语法验证（简化版）
    const syntaxValidation = this.validateSyntax(resolvedCode)
    if (!syntaxValidation.isValid) {
      issues.push(...syntaxValidation.issues)
    }

    // 完整性验证
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
   * 语法验证
   */
  private validateSyntax(code: string): {
    isValid: boolean
    issues: string[]
  } {
    const issues: string[] = []

    // 括号匹配
    const openBraces = (code.match(/\{/g) || []).length
    const closeBraces = (code.match(/\}/g) || []).length
    const openParens = (code.match(/\(/g) || []).length
    const closeParens = (code.match(/\)/g) || []).length
    const openBrackets = (code.match(/\[/g) || []).length
    const closeBrackets = (code.match(/\]/g) || []).length

    if (openBraces !== closeBraces) {
      issues.push(`大括号不匹配: ${openBraces} 开, ${closeBraces} 关`)
    }
    if (openParens !== closeParens) {
      issues.push(`圆括号不匹配: ${openParens} 开, ${closeParens} 关`)
    }
    if (openBrackets !== closeBrackets) {
      issues.push(`方括号不匹配: ${openBrackets} 开, ${closeBrackets} 关`)
    }

    // 检查常见的语法错误模式（不记录警告，仅用于潜在问题识别）
    const syntaxPatterns = [
      /;\s*}/g,
      /{\s*;/g,
      /\b(if|for|while|function)\s*\(\s*\)\s*{/g
    ]
    syntaxPatterns.forEach(pattern => {
      if (pattern.test(code)) {
        issues.push('检测到可能的语法异常')
      }
    })

    return {
      isValid: issues.length === 0,
      issues
    }
  }

  /**
   * 完整性验证
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

    // 检查原始代码的保留程度
    const preservedOriginalLines = originalLines.filter(originalLine =>
      resolvedLines.some(resolvedLine => resolvedLine.includes(originalLine.trim()))
    )

    const originalPreservationRatio = preservedOriginalLines.length / originalLines.length
    if (originalPreservationRatio < 0.3) {
      warnings.push(`原始代码保留率较低 (${(originalPreservationRatio * 100).toFixed(1)}%)`)
      suggestions.push('检查是否意外删除了重要的原始代码')
    }

    // 检查传入代码的集成程度
    const integratedIncomingLines = incomingLines.filter(incomingLine =>
      resolvedLines.some(resolvedLine => resolvedLine.includes(incomingLine.trim()))
    )

    const incomingIntegrationRatio = integratedIncomingLines.length / incomingLines.length
    if (incomingIntegrationRatio < 0.5) {
      warnings.push(`传入代码集成率较低 (${(incomingIntegrationRatio * 100).toFixed(1)}%)`)
      suggestions.push('检查是否成功集成了传入的更改')
    }

    // 检查代码行数变化
    const lineCountChange = Math.abs(resolvedLines.length - originalLines.length)
    if (lineCountChange > originalLines.length * 0.5) {
      warnings.push('代码行数变化较大，请检查是否引入了意外的更改')
    }

    return { warnings, suggestions }
  }

  /**
   * 生成冲突解决报告
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

    report.push('=== 补丁冲突解决报告 ===')
    report.push('')
    report.push(`冲突总数: ${threeWayDiff.conflicts.length}`)
    report.push(`已解决冲突: ${Object.keys(resolutions).length}`)
    report.push(`未解决冲突: ${threeWayDiff.conflicts.length - Object.keys(resolutions).length}`)
    report.push('')

    // 解决统计
    const resolutionStats = {
      original: 0,
      incoming: 0,
      custom: 0
    }

    Object.values(resolutions).forEach(resolution => {
      resolutionStats[resolution.type]++
    })

    report.push('解决方式统计:')
    report.push(`- 使用原始版本: ${resolutionStats.original}`)
    report.push(`- 使用传入版本: ${resolutionStats.incoming}`)
    report.push(`- 自定义解决: ${resolutionStats.custom}`)
    report.push('')

    // 验证结果
    report.push('验证结果:')
    if (validationResult.isValid) {
      report.push('✓ 代码语法验证通过')
    } else {
      report.push('✗ 发现语法问题:')
      validationResult.issues.forEach(issue => report.push(`  - ${issue}`))
    }

    if (validationResult.warnings.length > 0) {
      report.push('⚠️  警告:')
      validationResult.warnings.forEach(warning => report.push(`  - ${warning}`))
    }

    if (validationResult.suggestions.length > 0) {
      report.push('💡 建议:')
      validationResult.suggestions.forEach(suggestion => report.push(`  - ${suggestion}`))
    }

    return report.join('\n')
  }

  /**
   * 自动解决简单冲突
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
      // 自动解决策略：根据冲突类型选择最佳方案
      switch (conflict.conflictType) {
        case 'add_add':
          // 添加-添加冲突：合并两行（如果可能）
          if (conflict.original.trim() === '' && conflict.incoming !== conflict.current) {
            resolutions[conflict.lineNumber] = {
              type: 'custom',
              content: `${conflict.incoming} ${conflict.current}`
            }
            resolvedCount++
          }
          break

        case 'delete_add':
          // 删除-添加冲突：优先保留添加的内容
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
      explanation: `自动解决了 ${resolvedCount} 个简单冲突`
    }
  }

  /**
   * 计算字符串相似度
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2
    const shorter = str1.length > str2.length ? str2 : str1

    if (longer.length === 0) return 1.0

    const editDistance = this.levenshteinDistance(longer, shorter)
    return (longer.length - editDistance) / longer.length
  }

  /**
   * Levenshtein距离算法
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