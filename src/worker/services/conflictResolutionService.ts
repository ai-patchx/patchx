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

    // 1. 检测冲突
    const conflicts = await this.detectConflicts(patchContent, targetContent, filePath)

    if (conflicts.length === 0) {
      return {
        resolvedCode: targetContent,
        explanation: '未检测到冲突，可以直接应用patch',
        confidence: 1.0,
        suggestions: [],
        requiresManualReview: false
      }
    }

    // 2. 构建冲突解决请求
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

    // 3. 调用AI解决冲突
    return await this.aiService.resolvePatchConflict(request)
  }

  private async detectConflicts(
    patchContent: string,
    targetContent: string,
    filePath: string
  ): Promise<PatchConflict[]> {
    const conflicts: PatchConflict[] = []

    // 解析patch文件
    const patchLines = patchContent.split('\n')
    const targetLines = targetContent.split('\n')

    // 简单的冲突检测逻辑

    for (let i = 0; i < patchLines.length; i++) {
      const patchLine = patchLines[i]

      // 跳过patch头信息
      if (patchLine.startsWith('---') || patchLine.startsWith('+++') || patchLine.startsWith('@@')) {
        continue
      }

      // 检测删除操作
      if (patchLine.startsWith('-')) {
        const content = patchLine.substring(1)
        // 检查目标文件是否存在这行内容
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

      // 检测添加操作
      if (patchLine.startsWith('+')) {
        const content = patchLine.substring(1)
        // 检查目标文件是否已存在相同内容
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

      // 上下文行
      if (patchLine.startsWith(' ')) {
        // 保留上下文计数逻辑可根据需要扩展
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

    // 基本验证
    if (!resolvedCode || resolvedCode.trim().length === 0) {
      issues.push('解决后的代码为空')
      return { valid: false, issues, suggestions }
    }

    // 语法验证（简单的括号匹配）
    const openBraces = (resolvedCode.match(/\{/g) || []).length
    const openParens = (resolvedCode.match(/\(/g) || []).length
    const openBrackets = (resolvedCode.match(/\[/g) || []).length
    const closeBraces = (resolvedCode.match(/\}/g) || []).length
    const closeParens = (resolvedCode.match(/\)/g) || []).length
    const closeBrackets = (resolvedCode.match(/\]/g) || []).length

    const openTotal = openBraces + openParens + openBrackets
    const closeTotal = closeBraces + closeParens + closeBrackets

    if (openTotal !== closeTotal) {
      issues.push('括号不匹配，可能存在语法错误')
      suggestions.push('请检查代码中的括号匹配')
    }

    // 检查是否保留了重要的原始代码
    const originalLines = originalCode.split('\n').filter(line => line.trim().length > 0)
    const resolvedLines = resolvedCode.split('\n').filter(line => line.trim().length > 0)

    const preservedLines = originalLines.filter(line =>
      resolvedLines.some(resolvedLine => resolvedLine.includes(line.trim()))
    )

    const preservationRatio = preservedLines.length / originalLines.length

    if (preservationRatio < 0.5) {
      suggestions.push('解决后的代码与原始代码差异较大，建议仔细审查')
    }

    return {
      valid: issues.length === 0,
      issues,
      suggestions
    }
  }
}