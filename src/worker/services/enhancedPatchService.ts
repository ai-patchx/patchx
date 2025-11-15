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

    // 首先验证patch格式
    const validation = this.validatePatchFormat(upload.content)
    if (!validation.valid) {
      return {
        success: false,
        resolvedContent: targetContent,
        manualResolutionRequired: true,
        suggestions: [`Patch格式验证失败: ${validation.error}`]
      }
    }

    // 尝试应用patch并检测冲突
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
      // 检查基本的patch格式
      if (!content.includes('---') || !content.includes('+++')) {
        return { valid: false, error: '缺少patch文件头信息' }
      }

      if (!content.includes('@@')) {
        return { valid: false, error: '缺少diff块标记' }
      }

      const lines = content.split('\n')
      let hasValidDiff = false

      for (const line of lines) {
        if (line.startsWith('@@')) {
          hasValidDiff = true
        }

        // 检查行格式
        if (line.length > 0 && !line.startsWith('---') && !line.startsWith('+++')) {
          const firstChar = line[0]
          if (firstChar !== '@' && firstChar !== '+' && firstChar !== '-' && firstChar !== ' ') {
            return { valid: false, error: `无效的行格式: ${line}` }
          }
        }
      }

      if (!hasValidDiff) {
        return { valid: false, error: '未找到有效的diff块' }
      }

      return { valid: true }
    } catch (error) {
      return {
        valid: false,
        error: `Patch格式验证错误: ${error instanceof Error ? error.message : '未知错误'}`
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