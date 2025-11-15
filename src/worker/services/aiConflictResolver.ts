import { ConflictResolutionResponse, AIProvider } from '../types/ai'
import { ConflictResolutionService } from './conflictResolutionService'
import { AIService } from './aiService'

export class AIConflictResolver {
  private conflictResolutionService: ConflictResolutionService
  private providers: Map<string, AIService>
  private defaultProvider: string

  constructor(providers: Record<string, AIProvider>) {
    this.providers = new Map()
    this.defaultProvider = Object.keys(providers)[0]

    // 初始化AI服务提供商
    for (const [name, providerConfig] of Object.entries(providers)) {
      this.providers.set(name, new AIService(providerConfig))
    }

    // 使用第一个提供商创建冲突解决服务
    this.conflictResolutionService = new ConflictResolutionService(
      this.providers.get(this.defaultProvider) as AIService
    )
  }

  async resolveWithAI(
    patchContent: string,
    targetContent: string,
    filePath: string,
    providerName?: string
  ): Promise<ConflictResolutionResponse> {

    // 选择AI提供商
    const provider = providerName || this.defaultProvider
    const aiService = this.providers.get(provider)

    if (!aiService) {
      throw new Error(`AI提供商 '${provider}' 未配置`)
    }

    // 使用选定的AI提供商创建新的冲突解决服务
    const service = new ConflictResolutionService(aiService)

    return await service.resolvePatchConflicts(
      patchContent,
      targetContent,
      filePath
    )
  }

  async resolveWithMultipleProviders(
    patchContent: string,
    targetContent: string,
    filePath: string
  ): Promise<{
    resolutions: Array<{
      provider: string
      result: ConflictResolutionResponse
    }>
    bestResolution: ConflictResolutionResponse
    recommendedProvider: string
  }> {

    // 并行调用所有AI提供商
    const promises = Array.from(this.providers.entries()).map(async ([name, aiService]) => {
      try {
        const service = new ConflictResolutionService(aiService)
        const result = await service.resolvePatchConflicts(
          patchContent,
          targetContent,
          filePath
        )
        return { provider: name, result }
      } catch (error) {
        console.error(`AI提供商 ${name} 解决失败:`, error)
        return {
          provider: name,
          result: {
            resolvedCode: targetContent,
            explanation: `AI提供商 ${name} 解决失败: ${error instanceof Error ? error.message : '未知错误'}`,
            confidence: 0,
            suggestions: ['请尝试其他AI提供商或手动解决'],
            requiresManualReview: true
          }
        }
      }
    })

    const resolutions = await Promise.all(promises)

    // 选择最佳解决方案（置信度最高且不需要人工审查）
    let bestResolution = resolutions[0].result
    let recommendedProvider = resolutions[0].provider

    for (const resolution of resolutions) {
      if (resolution.result.confidence > bestResolution.confidence &&
          !resolution.result.requiresManualReview) {
        bestResolution = resolution.result
        recommendedProvider = resolution.provider
      }
    }

    return {
      resolutions,
      bestResolution,
      recommendedProvider
    }
  }

  // 使用构造函数中提供的 providers，因此无需默认配置函数

  getAvailableProviders(): string[] {
    return Array.from(this.providers.keys())
  }

  async testProvider(providerName: string): Promise<{
    success: boolean
    latency: number
    error?: string
  }> {
    const startTime = Date.now()

    try {
      const aiService = this.providers.get(providerName)
      if (!aiService) {
        throw new Error(`提供商 ${providerName} 不存在`)
      }

      // 发送一个简单的测试请求
      await this.resolveWithAI(
        '+console.log("test")',
        'console.log("original")',
        'test.js',
        providerName
      )

      return {
        success: true,
        latency: Date.now() - startTime
      }
    } catch (error) {
      return {
        success: false,
        latency: Date.now() - startTime,
        error: error instanceof Error ? error.message : '测试失败'
      }
    }
  }
}