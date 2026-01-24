import { ConflictResolutionResponse, AIProvider } from '../types/ai'
import type { Env } from '../types'
import { AIConflictResolver } from './aiConflictResolver'

export class AIConflictResolutionService {
  private resolver: AIConflictResolver

  constructor(env: Env) {
    // Configure AI providers from environment variables
    const providers = this.configureProviders(env)
    this.resolver = new AIConflictResolver(providers)
  }

  private configureProviders(env: Env): Record<string, AIProvider> {
    const providers: Record<string, AIProvider> = {}

    // OpenAI configuration
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

    // Anthropic configuration
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

    // Other providers compatible with OpenAI API
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
      throw new Error('No AI providers configured. Please configure at least OPENAI_API_KEY, ANTHROPIC_API_KEY or CUSTOM_AI_BASE_URL + CUSTOM_AI_API_KEY')
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
        // Use multiple AI providers, select best solution
        const results = await this.resolver.resolveWithMultipleProviders(
          patchContent,
          targetContent,
          filePath
        )

        // Log all provider results for debugging
        console.log('Multi-provider conflict resolution results:', {
          bestProvider: results.recommendedProvider,
          confidence: results.bestResolution.confidence,
          requiresManualReview: results.bestResolution.requiresManualReview
        })

        return results.bestResolution
      } else {
        // Use specified single provider
        return await this.resolver.resolveWithAI(
          patchContent,
          targetContent,
          filePath,
          options?.provider
        )
      }
    } catch (error) {
      console.error('AI conflict resolution service error:', error)

      // Return a safe default response
      return {
        resolvedCode: targetContent,
        explanation: `AI conflict resolution failed: ${error instanceof Error ? error.message : 'Unknown error'}. Please resolve conflicts manually.`,
        confidence: 0,
        suggestions: [
          'Check AI provider configuration',
          'Try using a different AI provider',
          'Manually resolve code conflicts',
          'Contact technical support'
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