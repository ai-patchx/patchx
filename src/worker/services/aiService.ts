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
      console.error('AI冲突解决失败:', error)
      throw new Error(`AI冲突解决失败: ${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  private generateConflictResolutionPrompt(request: ConflictResolutionRequest): string {
    return `你是一个专业的代码冲突解决专家。请分析以下代码冲突并提供解决方案。

文件路径: ${request.filePath}

当前代码:
\`\`\`
${request.currentCode}
\`\`\`

原始代码 (来自目标分支):
\`\`\`
${request.originalCode}
\`\`\`

传入代码 (来自patch):
\`\`\`
${request.incomingCode}
\`\`\`

    冲突位置:
    ${request.conflictMarkers.map((marker: ConflictResolutionRequest['conflictMarkers'][number], index: number) =>
      `冲突 ${index + 1}: 行 ${marker.start}-${marker.end}\n原始: ${marker.original}\n传入: ${marker.incoming}`
    ).join('\n')}

请提供:
1. 解决后的代码
2. 解决策略的解释
3. 对代码功能的评估
4. 是否需要人工审查的建议

请确保解决方案:
- 保持代码功能完整性
- 遵循最佳实践
- 添加必要的注释说明冲突解决
- 如果无法自动解决，明确说明原因

请以JSON格式返回结果:
{\n  "resolvedCode": "解决后的代码",
  "explanation": "解决策略解释",
  "confidence": 0.8,
  "suggestions": ["建议1", "建议2"],
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
            content: '你是一个专业的代码冲突解决专家，擅长分析代码冲突并提供最佳解决方案。'
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
      throw new Error(`AI服务调用失败: ${response.status} ${errorText}`)
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>
    }
    return data.choices[0]?.message?.content || ''
  }

  private parseAIResponse(response: string): ConflictResolutionResponse {
    try {
      // 尝试解析JSON响应
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        return {
          resolvedCode: parsed.resolvedCode || '',
          explanation: parsed.explanation || 'AI提供了解决方案',
          confidence: parsed.confidence || 0.5,
          suggestions: parsed.suggestions || [],
          requiresManualReview: parsed.requiresManualReview || false
        }
      }

      // 如果无法解析JSON，返回默认响应
      return {
        resolvedCode: response,
        explanation: 'AI提供了解决方案，但格式需要手动处理',
        confidence: 0.3,
        suggestions: ['请手动验证AI提供的解决方案'],
        requiresManualReview: true
      }
    } catch (_error) {
      return {
        resolvedCode: response,
        explanation: `解析AI响应失败: ${_error instanceof Error ? _error.message : '未知错误'}`,
        confidence: 0.1,
        suggestions: ['AI响应格式异常，需要人工审查'],
        requiresManualReview: true
      }
    }
  }

  async analyzePatchConflicts(patchContent: string, targetContent: string): Promise<PatchConflict[]> {
    const conflicts: PatchConflict[] = []

    // 简单的冲突检测逻辑
    const patchLines = patchContent.split('\n')
    const targetLines = targetContent.split('\n')

    // 这里可以实现更复杂的冲突检测算法
    // 目前实现基本的文本冲突检测

    for (let i = 0; i < Math.min(patchLines.length, targetLines.length); i++) {
      const patchLine = patchLines[i]
      const targetLine = targetLines[i]

      // 检测明显的冲突
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