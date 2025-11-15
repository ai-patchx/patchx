import { ConflictResolutionResponse } from '../types/ai'
import type { Env } from '../types'
import { AIConflictResolutionService } from './aiConflictResolutionService'

export class PatchConflictResolver {
  private aiService: AIConflictResolutionService | null = null

  constructor(env: Env) {
    try {
      this.aiService = new AIConflictResolutionService(env)
    } catch (error) {
      console.warn('AI冲突解决服务初始化失败:', error)
      // 继续运行，但不提供AI冲突解决功能
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

    // 首先尝试基本的冲突检测
    const basicConflicts = this.detectBasicConflicts(patchContent, targetContent)

    if (basicConflicts.length === 0) {
      return {
        success: true,
        resolvedContent: this.applyPatchBasic(patchContent, targetContent),
        manualResolutionRequired: false,
        suggestions: ['无冲突，patch可以直接应用']
      }
    }

    // 如果有AI服务且用户选择使用AI
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

        // 验证AI解决方案
        if (aiResolution.confidence > 0.7 && !aiResolution.requiresManualReview) {
          return {
            success: true,
            resolvedContent: aiResolution.resolvedCode,
            aiResolution,
            manualResolutionRequired: false,
            suggestions: [
              'AI已成功解决冲突',
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
              'AI提供的解决方案置信度较低，建议人工审查',
              ...aiResolution.suggestions,
              '请仔细检查AI建议的代码更改'
            ]
          }
        }
      } catch (error) {
        console.error('AI冲突解决失败:', error)
        return {
          success: false,
          resolvedContent: targetContent,
          manualResolutionRequired: true,
          suggestions: [
            'AI冲突解决失败',
            '请手动解决冲突',
            '检查AI服务配置',
            `错误信息: ${error instanceof Error ? error.message : '未知错误'}`
          ]
        }
      }
    }

    // 没有AI服务或AI解决失败，返回手动解决建议
    return {
      success: false,
      resolvedContent: targetContent,
      manualResolutionRequired: true,
      suggestions: [
        '检测到代码冲突，需要手动解决',
        '请仔细比较原始代码和传入代码的差异',
        '确保合并后的代码保持功能完整性',
        '建议添加适当的注释说明冲突解决',
        ...basicConflicts.map(conflict =>
          `冲突在文件 ${conflict.filePath} 第 ${conflict.lineNumber} 行: ${conflict.conflictType}`
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

    // 简单的冲突检测
    let lineNumber = 0
    for (const patchLine of patchLines) {
      lineNumber++

      if (patchLine.startsWith('+')) {
        const content = patchLine.substring(1).trim()
        if (content.length > 0) {
          // 检查是否已存在相同内容
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
          // 检查要删除的内容是否存在
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
    // 基本的patch应用逻辑（简化版）
    // 这里应该实现更复杂的patch应用逻辑
    // 目前只是返回原始内容
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