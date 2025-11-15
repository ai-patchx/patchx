import React, { useState } from 'react'
import { AlertTriangle, Bot, Code, FileText, CheckCircle, XCircle, RefreshCw } from 'lucide-react'
import { ConflictResolutionUIProps } from '../types/ui'
import { ConflictResolutionResponse } from '../types/ai'

const ConflictResolutionUI: React.FC<ConflictResolutionUIProps> = ({
  conflictData,
  onResolve,
  onCancel,
  aiProviders,
  isAIEnabled
}) => {
  const [selectedProvider, setSelectedProvider] = useState(aiProviders[0] || '')
  const [isResolving, setIsResolving] = useState(false)
  const [resolution, setResolution] = useState<ConflictResolutionResponse | null>(null)
  const [useMultipleProviders, setUseMultipleProviders] = useState(false)

  const handleAIResolve = async () => {
    if (!selectedProvider) return

    setIsResolving(true)
    try {
      // 调用AI冲突解决API
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
          provider: selectedProvider,
          useMultipleProviders
        })
      })

      if (!response.ok) {
        throw new Error('AI冲突解决失败')
      }

      const result: { data: ConflictResolutionResponse } = await response.json()
      setResolution(result.data)
    } catch (error) {
      console.error('AI冲突解决错误:', error)
      setResolution({
        resolvedCode: conflictData.currentCode,
        explanation: `AI冲突解决失败: ${error instanceof Error ? error.message : '未知错误'}`,
        confidence: 0,
        suggestions: ['请尝试其他AI提供商或手动解决冲突'],
        requiresManualReview: true
      })
    } finally {
      setIsResolving(false)
    }
  }

  const handleAcceptResolution = () => {
    if (resolution) {
      onResolve(resolution)
    }
  }

  const handleRejectResolution = () => {
    setResolution(null)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full mx-4 max-h-[90vh] overflow-hidden">
        {/* 头部 */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <AlertTriangle className="w-6 h-6 text-yellow-500" />
              <h2 className="text-xl font-semibold text-gray-900">代码冲突解决</h2>
            </div>
            <button
              onClick={onCancel}
              className="text-gray-400 hover:text-gray-600"
            >
              <XCircle className="w-6 h-6" />
            </button>
          </div>
          <p className="text-sm text-gray-600 mt-2">
            文件: {conflictData.filePath} | 检测到 {conflictData.conflicts.length} 个冲突
          </p>
        </div>

        <div className="flex h-[calc(90vh-120px)]">
          {/* 左侧: 控制面板 */}
          <div className="w-80 border-r border-gray-200 p-4 bg-gray-50">
            <div className="space-y-4">
              {/* AI提供商选择 */}
              {isAIEnabled && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Bot className="w-4 h-4 inline mr-2" />
                    AI提供商
                  </label>
                  <select
                    value={selectedProvider}
                    onChange={(e) => setSelectedProvider(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {aiProviders.map(provider => (
                      <option key={provider} value={provider}>
                        {provider}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* 多提供商模式 */}
              {isAIEnabled && aiProviders.length > 1 && (
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="multipleProviders"
                    checked={useMultipleProviders}
                    onChange={(e) => setUseMultipleProviders(e.target.checked)}
                    className="mr-2"
                  />
                  <label htmlFor="multipleProviders" className="text-sm text-gray-700">
                    使用多个AI提供商对比结果
                  </label>
                </div>
              )}

              {/* 冲突列表 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <AlertTriangle className="w-4 h-4 inline mr-2" />
                  冲突详情
                </label>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {conflictData.conflicts.map((conflict, index) => (
                    <div key={index} className="p-2 bg-white border border-gray-200 rounded text-xs">
                      <div className="font-medium text-gray-700">行 {conflict.lineNumber}</div>
                      <div className="text-gray-600">{conflict.type}</div>
                      <div className="text-gray-500 mt-1">{conflict.description}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* AI解决按钮 */}
              {isAIEnabled && !resolution && (
                <button
                  onClick={handleAIResolve}
                  disabled={isResolving || !selectedProvider}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {isResolving ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      AI解决中...
                    </>
                  ) : (
                    <>
                      <Bot className="w-4 h-4 mr-2" />
                      使用AI解决冲突
                    </>
                  )}
                </button>
              )}

              {/* 操作按钮 */}
              {resolution && (
                <div className="space-y-2">
                  <button
                    onClick={handleAcceptResolution}
                    disabled={resolution.requiresManualReview}
                    className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                  >
                    <CheckCircle className="w-4 h-4 inline mr-2" />
                    接受解决方案
                  </button>
                  <button
                    onClick={handleRejectResolution}
                    className="w-full px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
                  >
                    <XCircle className="w-4 h-4 inline mr-2" />
                    重新解决
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* 右侧: 代码对比 */}
          <div className="flex-1 flex">
            {/* 原始代码 */}
            <div className="flex-1 p-4">
              <div className="flex items-center mb-3">
                <FileText className="w-4 h-4 mr-2 text-gray-500" />
                <h3 className="font-medium text-gray-700">原始代码</h3>
              </div>
              <pre className="bg-gray-100 p-4 rounded-md text-sm overflow-auto h-[calc(100%-60px)]">
                <code>{conflictData.originalCode}</code>
              </pre>
            </div>

            {/* 传入代码 */}
            <div className="flex-1 p-4 border-l border-gray-200">
              <div className="flex items-center mb-3">
                <FileText className="w-4 h-4 mr-2 text-gray-500" />
                <h3 className="font-medium text-gray-700">传入代码 (Patch)</h3>
              </div>
              <pre className="bg-gray-100 p-4 rounded-md text-sm overflow-auto h-[calc(100%-60px)]">
                <code>{conflictData.incomingCode}</code>
              </pre>
            </div>

            {/* 解决结果 */}
            {resolution && (
              <div className="flex-1 p-4 border-l border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center">
                    <Code className="w-4 h-4 mr-2 text-gray-500" />
                    <h3 className="font-medium text-gray-700">解决结果</h3>
                  </div>
                  <div className={`px-2 py-1 rounded text-xs ${
                    resolution.requiresManualReview
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-green-100 text-green-800'
                  }`}>
                    {resolution.requiresManualReview ? '需人工审查' : 'AI已解决'}
                  </div>
                </div>

                <div className="space-y-4 h-[calc(100%-60px)]">
                  <pre className="bg-blue-50 p-4 rounded-md text-sm overflow-auto h-1/2 border border-blue-200">
                    <code>{resolution.resolvedCode}</code>
                  </pre>

                  <div className="bg-gray-50 p-4 rounded-md h-1/2 overflow-auto">
                    <h4 className="font-medium text-gray-700 mb-2">解决说明</h4>
                    <p className="text-sm text-gray-600 mb-3">{resolution.explanation}</p>

                    <div className="flex items-center mb-2">
                      <span className="text-sm text-gray-600">置信度:</span>
                      <div className="ml-2 bg-gray-200 rounded-full h-2 flex-1 max-w-20">
                        <div
                          className="bg-blue-500 h-2 rounded-full"
                          style={{ width: `${resolution.confidence * 100}%` }}
                        />
                      </div>
                      <span className="ml-2 text-sm text-gray-600">
                        {(resolution.confidence * 100).toFixed(0)}%
                      </span>
                    </div>

                    {resolution.suggestions.length > 0 && (
                      <div>
                        <h5 className="font-medium text-gray-700 mb-1">建议:</h5>
                        <ul className="text-sm text-gray-600 space-y-1">
                          {resolution.suggestions.map((suggestion, index) => (
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
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default ConflictResolutionUI