import React, { useState, useEffect } from 'react'
import { X, AlertTriangle, GitMerge, Bot, CheckCircle, XCircle, RefreshCw, Save, RotateCcw } from 'lucide-react'
import { ConflictData } from '../types/ui'
import { ConflictResolutionResponse } from '../types/ai'
import ThreeWayDiffViewer from './ThreeWayDiffViewer'

interface EnhancedConflictResolutionModalProps {
  isOpen: boolean
  conflictData: ConflictData
  onClose: () => void
  onResolve: (resolution: ConflictResolutionResponse) => void
  aiProviders?: string[]
  isAIEnabled?: boolean
}

const EnhancedConflictResolutionModal: React.FC<EnhancedConflictResolutionModalProps> = ({
  isOpen,
  conflictData,
  onClose,
  onResolve,
  aiProviders = [],
  isAIEnabled = false
}) => {
  const [activeTab, setActiveTab] = useState<'visual' | 'text' | 'ai'>('visual')
  const [resolutions, setResolutions] = useState<Record<number, {
    type: 'original' | 'incoming' | 'custom'
    content: string
  }>>({})
  const [aiResolution, setAiResolution] = useState<ConflictResolutionResponse | null>(null)
  const [isAILoading, setIsAILoading] = useState(false)
  const [selectedAIProvider, setSelectedAIProvider] = useState(aiProviders[0] || '')
  const [resolutionHistory, setResolutionHistory] = useState<typeof resolutions[]>([])
  const [showPreview, setShowPreview] = useState(false)

  useEffect(() => {
    if (isOpen) {
      // 重置状态
      setResolutions({})
      setAiResolution(null)
      setResolutionHistory([])
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleResolveConflict = (lineNumber: number, type: 'original' | 'incoming' | 'custom', content?: string) => {
    // 保存历史记录
    setResolutionHistory(prev => [...prev, { ...resolutions }])

    setResolutions(prev => ({
      ...prev,
      [lineNumber]: {
        type,
        content: content || ''
      }
    }))
  }

  const handleUndo = () => {
    if (resolutionHistory.length > 0) {
      const lastResolution = resolutionHistory[resolutionHistory.length - 1]
      setResolutions(lastResolution)
      setResolutionHistory(prev => prev.slice(0, -1))
    }
  }

  const handleAIResolve = async () => {
    if (!selectedAIProvider) return

    setIsAILoading(true)
    try {
      const response = await fetch('/api/ai/resolve-conflict', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          originalCode: conflictData.originalCode,
          incomingCode: conflictData.incomingCode,
          currentCode: conflictData.currentCode,
          filePath: conflictData.filePath,
          provider: selectedAIProvider,
          conflicts: conflictData.conflicts
        })
      })

      if (!response.ok) {
        throw new Error('AI冲突解决失败')
      }

      const result: { data: ConflictResolutionResponse } = await response.json()
      setAiResolution(result.data)

      // 如果AI解决成功，自动填充到resolutions中
      if (result.data.confidence > 0.7 && !result.data.requiresManualReview) {
        // 解析AI解决结果并更新resolutions
        const lines = result.data.resolvedCode.split('\n')
        const newResolutions: typeof resolutions = {}

        conflictData.conflicts.forEach(conflict => {
          const lineContent = lines[conflict.lineNumber - 1] || ''
          newResolutions[conflict.lineNumber] = {
            type: 'custom',
            content: lineContent
          }
        })

        setResolutions(newResolutions)
      }
    } catch (error) {
      console.error('AI冲突解决错误:', error)
      setAiResolution({
        resolvedCode: conflictData.currentCode,
        explanation: `AI冲突解决失败: ${error instanceof Error ? error.message : '未知错误'}`,
        confidence: 0,
        suggestions: ['请尝试其他AI提供商或手动解决冲突'],
        requiresManualReview: true
      })
    } finally {
      setIsAILoading(false)
    }
  }

  const generateResolvedCode = () => {
    const lines = conflictData.currentCode.split('\n')
    const resolvedLines = [...lines]

    Object.entries(resolutions).forEach(([lineNumber, resolution]) => {
      const lineNum = parseInt(lineNumber) - 1
      if (lineNum >= 0 && lineNum < resolvedLines.length) {
        resolvedLines[lineNum] = resolution.content
      }
    })

    return resolvedLines.join('\n')
  }

  const handleApplyResolution = () => {
    const resolvedCode = generateResolvedCode()
    const resolution: ConflictResolutionResponse = {
      resolvedCode,
      explanation: aiResolution?.explanation || '手动解决冲突',
      confidence: aiResolution?.confidence || 0.8,
      suggestions: aiResolution?.suggestions || ['手动解决完成'],
      requiresManualReview: Object.keys(resolutions).length < conflictData.conflicts.length
    }

    onResolve(resolution)
  }

  const handleAcceptAIResolution = () => {
    if (aiResolution) {
      onResolve(aiResolution)
    }
  }

  const allConflictsResolved = Object.keys(resolutions).length === conflictData.conflicts.length

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-7xl w-full mx-4 max-h-[95vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <AlertTriangle className="w-6 h-6 text-orange-500" />
            <div>
              <h2 className="text-xl font-semibold text-gray-900">补丁冲突解决</h2>
              <p className="text-sm text-gray-600">
                文件: {conflictData.filePath} | {conflictData.conflicts.length} 个冲突需要解决
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 py-3 border-b border-gray-200">
          <div className="flex space-x-4">
            <button
              onClick={() => setActiveTab('visual')}
              className={`px-4 py-2 rounded-md text-sm font-medium flex items-center ${
                activeTab === 'visual'
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <GitMerge className="w-4 h-4 mr-2" />
              可视化解决
            </button>
            <button
              onClick={() => setActiveTab('text')}
              className={`px-4 py-2 rounded-md text-sm font-medium flex items-center ${
                activeTab === 'text'
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Save className="w-4 h-4 mr-2" />
              文本编辑
            </button>
            {isAIEnabled && (
              <button
                onClick={() => setActiveTab('ai')}
                className={`px-4 py-2 rounded-md text-sm font-medium flex items-center ${
                  activeTab === 'ai'
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Bot className="w-4 h-4 mr-2" />
                AI解决
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {activeTab === 'visual' && (
            <ThreeWayDiffViewer
              conflictData={conflictData}
              onResolveConflict={handleResolveConflict}
              onAcceptAll={handleApplyResolution}
              onRejectAll={() => {
                setResolutions({})
                setResolutionHistory([])
              }}
            />
          )}

          {activeTab === 'text' && (
            <div className="h-full p-4">
              <div className="h-full flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-medium text-gray-900">手动编辑解决</h3>
                  <div className="flex space-x-2">
                    <button
                      onClick={handleUndo}
                      disabled={resolutionHistory.length === 0}
                      className="px-3 py-1 text-sm text-gray-700 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 flex items-center"
                    >
                      <RotateCcw className="w-4 h-4 mr-1" />
                      撤销
                    </button>
                    <button
                      onClick={() => setShowPreview(!showPreview)}
                      className="px-3 py-1 text-sm text-blue-700 bg-blue-100 rounded hover:bg-blue-200"
                    >
                      {showPreview ? '隐藏预览' : '显示预览'}
                    </button>
                  </div>
                </div>

                <div className="flex-1 flex space-x-4">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      编辑解决后的代码
                    </label>
                    <textarea
                      value={generateResolvedCode()}
                      onChange={(e) => {
                        // 这里可以添加更复杂的文本编辑逻辑
                        const lines = e.target.value.split('\n')
                        const newResolutions: typeof resolutions = {}
                        conflictData.conflicts.forEach(conflict => {
                          const lineContent = lines[conflict.lineNumber - 1] || ''
                          newResolutions[conflict.lineNumber] = {
                            type: 'custom',
                            content: lineContent
                          }
                        })
                        setResolutions(newResolutions)
                      }}
                      className="w-full h-full p-3 font-mono text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      style={{ minHeight: '400px' }}
                    />
                  </div>

                  {showPreview && (
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        预览原始代码
                      </label>
                      <pre className="w-full h-full p-3 bg-gray-50 border border-gray-300 rounded-md overflow-auto text-sm">
                        <code>{conflictData.originalCode}</code>
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'ai' && (
            <div className="h-full p-4">
              <div className="h-full flex flex-col">
                {/* AI Provider Selection */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    选择AI提供商
                  </label>
                  <div className="flex space-x-2">
                    <select
                      value={selectedAIProvider}
                      onChange={(e) => setSelectedAIProvider(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {aiProviders.map(provider => (
                        <option key={provider} value={provider}>
                          {provider}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={handleAIResolve}
                      disabled={isAILoading || !selectedAIProvider}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                    >
                      {isAILoading ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          AI解决中...
                        </>
                      ) : (
                        <>
                          <Bot className="w-4 h-4 mr-2" />
                          使用AI解决
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* AI Resolution Result */}
                {aiResolution && (
                  <div className="flex-1 flex flex-col">
                    <div className="mb-3">
                      <h3 className="text-lg font-medium text-gray-900">AI解决结果</h3>
                      <div className="flex items-center mt-1">
                        <span className="text-sm text-gray-600">置信度: </span>
                        <div className="ml-2 bg-gray-200 rounded-full h-2 w-20">
                          <div
                            className="bg-blue-500 h-2 rounded-full"
                            style={{ width: `${aiResolution.confidence * 100}%` }}
                          />
                        </div>
                        <span className="ml-2 text-sm text-gray-600">
                          {(aiResolution.confidence * 100).toFixed(0)}%
                        </span>
                        {aiResolution.requiresManualReview && (
                          <span className="ml-2 px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded">
                            需要人工审查
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex-1 flex space-x-4">
                      <div className="flex-1">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          AI建议的解决代码
                        </label>
                        <pre className="w-full h-full p-3 bg-blue-50 border border-blue-200 rounded-md overflow-auto text-sm">
                          <code>{aiResolution.resolvedCode}</code>
                        </pre>
                      </div>

                      <div className="flex-1">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          解决说明
                        </label>
                        <div className="w-full h-full p-3 bg-gray-50 border border-gray-300 rounded-md overflow-auto">
                          <p className="text-sm text-gray-700 mb-3">{aiResolution.explanation}</p>

                          {aiResolution.suggestions.length > 0 && (
                            <div>
                              <h5 className="font-medium text-gray-700 mb-2">建议:</h5>
                              <ul className="text-sm text-gray-600 space-y-1">
                                {aiResolution.suggestions.map((suggestion, index) => (
                                  <li key={index} className="flex items-start">
                                    <span className="mr-2">•</span>
                                    <span>{suggestion}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* AI Resolution Actions */}
                    <div className="mt-4 flex justify-end space-x-2">
                      <button
                        onClick={() => setAiResolution(null)}
                        className="px-4 py-2 text-sm text-gray-700 bg-gray-200 rounded hover:bg-gray-300 flex items-center"
                      >
                        <XCircle className="w-4 h-4 mr-1" />
                        拒绝AI解决
                      </button>
                      <button
                        onClick={handleAcceptAIResolution}
                        disabled={aiResolution.requiresManualReview}
                        className="px-4 py-2 text-sm text-white bg-green-600 rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                      >
                        <CheckCircle className="w-4 h-4 mr-1" />
                        接受AI解决
                      </button>
                    </div>
                  </div>
                )}

                {!aiResolution && !isAILoading && (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                      <Bot className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                      <p className="text-gray-600">选择一个AI提供商并点击"使用AI解决"来开始</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-between items-center">
          <div className="text-sm text-gray-600">
            {activeTab === 'visual' && (
              <>
                已解决 {Object.keys(resolutions).length} / {conflictData.conflicts.length} 个冲突
                {allConflictsResolved && (
                  <span className="ml-2 text-green-600 font-medium">✓ 所有冲突已解决</span>
                )}
              </>
            )}
            {activeTab === 'ai' && aiResolution && (
              <>
                AI置信度: {(aiResolution.confidence * 100).toFixed(0)}%
                {aiResolution.requiresManualReview && (
                  <span className="ml-2 text-yellow-600">需要人工审查</span>
                )}
              </>
            )}
          </div>

          <div className="flex space-x-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-700 bg-gray-200 rounded hover:bg-gray-300"
            >
              取消
            </button>
            {(activeTab === 'visual' || activeTab === 'text') && (
              <button
                onClick={handleApplyResolution}
                disabled={!allConflictsResolved}
                className="px-4 py-2 text-sm text-white bg-green-600 rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
              >
                <Save className="w-4 h-4 mr-1" />
                应用解决
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default EnhancedConflictResolutionModal