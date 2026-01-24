import { ConflictResolutionRequest, ConflictResolutionResponse, PatchConflict, AIProvider } from '../types/ai'

export class AIService {
  private provider: AIProvider

  constructor(provider: AIProvider) {
    this.provider = provider
  }

  async resolvePatchConflict(request: ConflictResolutionRequest): Promise<ConflictResolutionResponse> {
    const prompt = this.generateConflictResolutionPrompt(request)

    try {
      const response = await this.callAIProvider(prompt)
      return this.parseAIResponse(response)
    } catch (error) {
      console.error('AI conflict resolution failed:', error)
      throw new Error(`AI conflict resolution failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private generateConflictResolutionPrompt(request: ConflictResolutionRequest): string {
    return `You are a professional code conflict resolution expert. Please analyze the following code conflicts and provide solutions.

File path: ${request.filePath}

Current code:
\`\`\`
${request.currentCode}
\`\`\`

Original code (from target branch):
\`\`\`
${request.originalCode}
\`\`\`

Incoming code (from patch):
\`\`\`
${request.incomingCode}
\`\`\`

    Conflict locations:
    ${request.conflictMarkers.map((marker: ConflictResolutionRequest['conflictMarkers'][number], index: number) =>
      `Conflict ${index + 1}: Lines ${marker.start}-${marker.end}\nOriginal: ${marker.original}\nIncoming: ${marker.incoming}`
    ).join('\n')}

Please provide:
1. Resolved code
2. Explanation of resolution strategy
3. Assessment of code functionality
4. Recommendation on whether manual review is needed

Please ensure the solution:
- Maintains code functionality integrity
- Follows best practices
- Adds necessary comments explaining conflict resolution
- Clearly states the reason if automatic resolution is not possible

Please return results in JSON format:
{\n  "resolvedCode": "resolved code",
  "explanation": "resolution strategy explanation",
  "confidence": 0.8,
  "suggestions": ["suggestion1", "suggestion2"],
  "requiresManualReview": false
}`
  }

  private async callAIProvider(prompt: string): Promise<string> {
    const response = await fetch(`${this.provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.provider.apiKey}`
      },
      body: JSON.stringify({
        model: this.provider.model,
        messages: [
          {
            role: 'system',
            content: 'You are a professional code conflict resolution expert, skilled at analyzing code conflicts and providing optimal solutions.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: this.provider.maxTokens || 2000,
        temperature: this.provider.temperature || 0.1
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`AI service call failed: ${response.status} ${errorText}`)
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>
    }
    return data.choices[0]?.message?.content || ''
  }

  private parseAIResponse(response: string): ConflictResolutionResponse {
    try {
      // Try to parse JSON response
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        return {
          resolvedCode: parsed.resolvedCode || '',
          explanation: parsed.explanation || 'AI provided a solution',
          confidence: parsed.confidence || 0.5,
          suggestions: parsed.suggestions || [],
          requiresManualReview: parsed.requiresManualReview || false
        }
      }

      // If JSON cannot be parsed, return default response
      return {
        resolvedCode: response,
        explanation: 'AI provided a solution, but format needs manual processing',
        confidence: 0.3,
        suggestions: ['Please manually verify the AI-provided solution'],
        requiresManualReview: true
      }
    } catch (_error) {
      return {
        resolvedCode: response,
        explanation: `Failed to parse AI response: ${_error instanceof Error ? _error.message : 'Unknown error'}`,
        confidence: 0.1,
        suggestions: ['AI response format is abnormal, requires manual review'],
        requiresManualReview: true
      }
    }
  }

  async analyzePatchConflicts(patchContent: string, targetContent: string): Promise<PatchConflict[]> {
    const conflicts: PatchConflict[] = []

    // Simple conflict detection logic
    const patchLines = patchContent.split('\n')
    const targetLines = targetContent.split('\n')

    // More complex conflict detection algorithms can be implemented here
    // Currently implements basic text conflict detection

    for (let i = 0; i < Math.min(patchLines.length, targetLines.length); i++) {
      const patchLine = patchLines[i]
      const targetLine = targetLines[i]

      // Detect obvious conflicts
      if (patchLine.startsWith('+') && targetLine.startsWith('+')) {
        if (patchLine !== targetLine) {
          conflicts.push({
            filePath: 'unknown',
            lineNumber: i + 1,
            original: targetLine.substring(1),
            incoming: patchLine.substring(1),
            current: targetLine.substring(1),
            conflictType: 'add_add'
          })
        }
      }
    }

    return conflicts
  }
}