import { ConflictResolutionResponse, AIProvider } from '../types/ai'
import type { Env } from '../types'
import { AIConflictResolver } from './aiConflictResolver'

export class AIConflictResolutionService {
  private resolver: AIConflictResolver

  constructor(env: Env) {
    // 从环境变量配置AI提供商
    const providers = this.configureProviders(env)
    this.resolver = new AIConflictResolver(providers)
  }

  private configureProviders(env: Env): Record<string, AIProvider> {
    const providers: Record<string, AIProvider> = {}

    // OpenAI 配置
    if (env.OPENAI_API_KEY) {
      providers.openai = {
        name: 'OpenAI',
        baseUrl: env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
        apiKey: env.OPENAI_API_KEY,
        model: env.OPENAI_MODEL || 'gpt-4',
        maxTokens: parseInt(env.OPENAI_MAX_TOKENS || '2000'),
        temperature: parseFloat(env.OPENAI_TEMPERATURE || '0.1')
      }
    }

    // Anthropic 配置
    if (env.ANTHROPIC_API_KEY) {
      providers.anthropic = {
        name: 'Anthropic',
        baseUrl: env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1',
        apiKey: env.ANTHROPIC_API_KEY,
        model: env.ANTHROPIC_MODEL || 'claude-3-sonnet-20240229',
        maxTokens: parseInt(env.ANTHROPIC_MAX_TOKENS || '2000'),
        temperature: parseFloat(env.ANTHROPIC_TEMPERATURE || '0.1')
      }
    }

    // 其他兼容OpenAI API的提供商
    if (env.CUSTOM_AI_BASE_URL && env.CUSTOM_AI_API_KEY) {
      providers.custom = {
        name: 'Custom',
        baseUrl: env.CUSTOM_AI_BASE_URL,
        apiKey: env.CUSTOM_AI_API_KEY,
        model: env.CUSTOM_AI_MODEL || 'gpt-3.5-turbo',
        maxTokens: parseInt(env.CUSTOM_AI_MAX_TOKENS || '2000'),
        temperature: parseFloat(env.CUSTOM_AI_TEMPERATURE || '0.1')
      }
    }

    if (Object.keys(providers).length === 0) {
      throw new Error('未配置任何AI提供商。请至少配置 OPENAI_API_KEY, ANTHROPIC_API_KEY 或 CUSTOM_AI_BASE_URL + CUSTOM_AI_API_KEY')
    }

    return providers
  }

  async resolvePatchConflicts(
    patchContent: string,
    targetContent: string,
    filePath: string,
    options?: {
      provider?: string
      useMultipleProviders?: boolean
      timeout?: number
    }
  ): Promise<ConflictResolutionResponse> {

    try {
      if (options?.useMultipleProviders) {
        // 使用多个AI提供商，选择最佳解决方案
        const results = await this.resolver.resolveWithMultipleProviders(
          patchContent,
          targetContent,
          filePath
        )

        // 记录所有提供商的结果用于调试
        console.log('多提供商冲突解决结果:', {
          bestProvider: results.recommendedProvider,
          confidence: results.bestResolution.confidence,
          requiresManualReview: results.bestResolution.requiresManualReview
        })

        return results.bestResolution
      } else {
        // 使用指定的单个提供商
        return await this.resolver.resolveWithAI(
          patchContent,
          targetContent,
          filePath,
          options?.provider
        )
      }
    } catch (error) {
      console.error('AI冲突解决服务错误:', error)

      // 返回一个安全的默认响应
      return {
        resolvedCode: targetContent,
        explanation: `AI冲突解决失败: ${error instanceof Error ? error.message : '未知错误'}。请手动解决冲突。`,
        confidence: 0,
        suggestions: [
          '检查AI提供商配置',
          '尝试使用不同的AI提供商',
          '手动解决代码冲突',
          '联系技术支持'
        ],
        requiresManualReview: true
      }
    }
  }

  async testAIProviders(): Promise<Array<{
    provider: string
    success: boolean
    latency: number
    error?: string
  }>> {
    const providers = this.resolver.getAvailableProviders()
    const results = []

    for (const provider of providers) {
      const result = await this.resolver.testProvider(provider)
      results.push({
        provider,
        ...result
      })
    }

    return results
  }

  getAvailableProviders(): string[] {
    return this.resolver.getAvailableProviders()
  }
}