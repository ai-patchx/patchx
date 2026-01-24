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

    // Initialize AI service providers
    for (const [name, providerConfig] of Object.entries(providers)) {
      this.providers.set(name, new AIService(providerConfig))
    }

    // Use first provider to create conflict resolution service
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

    // Select AI provider
    const provider = providerName || this.defaultProvider
    const aiService = this.providers.get(provider)

    if (!aiService) {
      throw new Error(`AI provider '${provider}' is not configured`)
    }

    // Use selected AI provider to create new conflict resolution service
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

    // Call all AI providers in parallel
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
        console.error(`AI provider ${name} resolution failed:`, error)
        return {
          provider: name,
          result: {
            resolvedCode: targetContent,
            explanation: `AI provider ${name} resolution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            confidence: 0,
            suggestions: ['Please try another AI provider or resolve manually'],
            requiresManualReview: true
          }
        }
      }
    })

    const resolutions = await Promise.all(promises)

    // Select best solution (highest confidence and no manual review required)
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

  // Use providers provided in constructor, so no default configuration function needed

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
        throw new Error(`Provider ${providerName} does not exist`)
      }

      // Send a simple test request
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
        error: error instanceof Error ? error.message : 'Test failed'
      }
    }
  }
}