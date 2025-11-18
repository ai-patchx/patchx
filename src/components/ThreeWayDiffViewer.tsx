import React, { useState, useMemo } from 'react'
import { GitMerge, FileText, AlertTriangle, Check, X, ArrowLeftRight } from 'lucide-react'
import { ConflictData } from '../types/ui'

interface DiffLine {
  lineNumber: number
  content: string
  type: 'context' | 'add' | 'remove' | 'conflict' | 'resolved'
  conflictInfo?: {
    original: string
    incoming: string
    current: string
  }
}

interface ThreeWayDiffViewerProps {
  conflictData: ConflictData
  onResolveConflict: (lineNumber: number, resolution: 'original' | 'incoming' | 'custom', customContent?: string) => void
  onAcceptAll: () => void
  onRejectAll: () => void
}

const ThreeWayDiffViewer: React.FC<ThreeWayDiffViewerProps> = ({
  conflictData,
  onResolveConflict,
  onAcceptAll,
  onRejectAll
}) => {
  const [selectedResolutions, setSelectedResolutions] = useState<Record<number, 'original' | 'incoming' | 'custom'>>({})
  const [customEdits, setCustomEdits] = useState<Record<number, string>>({})
  const [showResolved, setShowResolved] = useState(false)

  const parseDiffLines = useMemo(() => {
    const lines: DiffLine[] = []
    const originalLines = conflictData.originalCode.split('\n')
    const incomingLines = conflictData.incomingCode.split('\n')
    const currentLines = conflictData.currentCode.split('\n')

    // 简化的三向差异算法
    const maxLines = Math.max(originalLines.length, incomingLines.length, currentLines.length)

    for (let i = 0; i < maxLines; i++) {
      const original = originalLines[i] || ''
      const incoming = incomingLines[i] || ''
      const current = currentLines[i] || ''

      // 检测冲突
      const hasConflict = conflictData.conflicts.some(c => c.lineNumber === i + 1)

      if (hasConflict) {
        lines.push({
          lineNumber: i + 1,
          content: current,
          type: 'conflict',
          conflictInfo: { original, incoming, current }
        })
      } else if (original !== incoming || original !== current) {
        // 非冲突的差异
        if (original !== current && incoming === current) {
          lines.push({
            lineNumber: i + 1,
            content: current,
            type: 'add'
          })
        } else if (original === current && original !== incoming) {
          lines.push({
            lineNumber: i + 1,
            content: current,
            type: 'remove'
          })
        } else {
          lines.push({
            lineNumber: i + 1,
            content: current,
            type: 'context'
          })
        }
      } else {
        lines.push({
          lineNumber: i + 1,
          content: current,
          type: 'context'
        })
      }
    }

    return lines
  }, [conflictData])

  const handleResolutionSelect = (lineNumber: number, resolution: 'original' | 'incoming' | 'custom') => {
    setSelectedResolutions(prev => ({
      ...prev,
      [lineNumber]: resolution
    }))

    if (resolution === 'custom') {
      const conflictLine = parseDiffLines.find(line => line.lineNumber === lineNumber)
      if (conflictLine?.conflictInfo) {
        setCustomEdits(prev => ({
          ...prev,
          [lineNumber]: conflictLine.conflictInfo!.current
        }))
      }
    }

    onResolveConflict(lineNumber, resolution, customEdits[lineNumber])
  }

  const handleCustomEdit = (lineNumber: number, content: string) => {
    setCustomEdits(prev => ({
      ...prev,
      [lineNumber]: content
    }))
    onResolveConflict(lineNumber, 'custom', content)
  }

  const getLineClassName = (line: DiffLine) => {
    const baseClasses = 'px-2 py-1 font-mono text-sm border-l-4'

    switch (line.type) {
      case 'conflict':
        return `${baseClasses} bg-red-50 border-red-400 text-red-900`
      case 'add':
        return `${baseClasses} bg-green-50 border-green-400 text-green-900`
      case 'remove':
        return `${baseClasses} bg-red-50 border-red-400 text-red-900`
      case 'resolved':
        return `${baseClasses} bg-blue-50 border-blue-400 text-blue-900`
      default:
        return `${baseClasses} bg-gray-50 border-gray-200 text-gray-900`
    }
  }

  const conflictLines = parseDiffLines.filter(line => line.type === 'conflict')
  const resolvedCount = Object.keys(selectedResolutions).length

  return (
    <div className="bg-white rounded-lg shadow-lg border border-gray-200">
      {/* Header */}
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <GitMerge className="w-5 h-5 text-orange-500" />
            <h3 className="font-semibold text-gray-900">三方差异比较 - {conflictData.filePath}</h3>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600">
              {conflictLines.length} 个冲突，已解决 {resolvedCount} 个
            </span>
            <button
              onClick={() => setShowResolved(!showResolved)}
              className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
            >
              {showResolved ? '隐藏已解决' : '显示已解决'}
            </button>
          </div>
        </div>
      </div>

      {/* Three-way comparison */}
      <div className="flex h-96">
        {/* Original (Base) */}
        <div className="flex-1 border-r border-gray-200">
          <div className="px-3 py-2 bg-gray-100 border-b border-gray-200 flex items-center">
            <FileText className="w-4 h-4 mr-2 text-gray-600" />
            <span className="text-sm font-medium text-gray-700">原始版本 (Base)</span>
          </div>
          <div className="overflow-auto h-full p-2">
            {parseDiffLines.map((line) => (
              <div key={`original-${line.lineNumber}`} className="flex">
                <div className="w-8 text-xs text-gray-500 text-right pr-2">
                  {line.lineNumber}
                </div>
                <div className={`flex-1 ${line.conflictInfo ? 'bg-red-100' : ''}`}>
                  {line.conflictInfo ? (
                    <div className="p-1 text-sm font-mono bg-red-50 text-red-900">
                      {line.conflictInfo.original}
                    </div>
                  ) : (
                    <div className="p-1 text-sm font-mono text-gray-700">
                      {line.content}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Incoming (Patch) */}
        <div className="flex-1 border-r border-gray-200">
          <div className="px-3 py-2 bg-gray-100 border-b border-gray-200 flex items-center">
            <ArrowLeftRight className="w-4 h-4 mr-2 text-green-600" />
            <span className="text-sm font-medium text-gray-700">传入版本 (Patch)</span>
          </div>
          <div className="overflow-auto h-full p-2">
            {parseDiffLines.map((line) => (
              <div key={`incoming-${line.lineNumber}`} className="flex">
                <div className="w-8 text-xs text-gray-500 text-right pr-2">
                  {line.lineNumber}
                </div>
                <div className={`flex-1 ${line.conflictInfo ? 'bg-green-100' : ''}`}>
                  {line.conflictInfo ? (
                    <div className="p-1 text-sm font-mono bg-green-50 text-green-900">
                      {line.conflictInfo.incoming}
                    </div>
                  ) : (
                    <div className="p-1 text-sm font-mono text-gray-700">
                      {line.content}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Current (Target) + Resolution */}
        <div className="flex-1">
          <div className="px-3 py-2 bg-gray-100 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center">
              <AlertTriangle className="w-4 h-4 mr-2 text-orange-600" />
              <span className="text-sm font-medium text-gray-700">当前版本 + 解决</span>
            </div>
          </div>
          <div className="overflow-auto h-full p-2">
            {parseDiffLines.map((line) => {
              const isConflict = line.type === 'conflict'
              const selectedResolution = selectedResolutions[line.lineNumber]

              if (!showResolved && isConflict && selectedResolution) {
                return null // 隐藏已解决的冲突
              }

              return (
                <div key={`current-${line.lineNumber}`} className="flex">
                  <div className="w-8 text-xs text-gray-500 text-right pr-2">
                    {line.lineNumber}
                  </div>
                  <div className="flex-1">
                    {isConflict ? (
                      <div className="border border-orange-300 rounded mb-1">
                        <div className="bg-orange-100 px-2 py-1 text-xs text-orange-800 flex items-center justify-between">
                          <span>冲突需要解决</span>
                          <AlertTriangle className="w-3 h-3" />
                        </div>

                        {/* Resolution options */}
                        <div className="p-2 space-y-2">
                          <div className="flex space-x-2">
                            <button
                              onClick={() => handleResolutionSelect(line.lineNumber, 'original')}
                              className={`px-2 py-1 text-xs rounded flex items-center ${
                                selectedResolution === 'original'
                                  ? 'bg-red-500 text-white'
                                  : 'bg-red-100 text-red-700 hover:bg-red-200'
                              }`}
                            >
                              <X className="w-3 h-3 mr-1" />
                              使用原始
                            </button>
                            <button
                              onClick={() => handleResolutionSelect(line.lineNumber, 'incoming')}
                              className={`px-2 py-1 text-xs rounded flex items-center ${
                                selectedResolution === 'incoming'
                                  ? 'bg-green-500 text-white'
                                  : 'bg-green-100 text-green-700 hover:bg-green-200'
                              }`}
                            >
                              <Check className="w-3 h-3 mr-1" />
                              使用传入
                            </button>
                            <button
                              onClick={() => handleResolutionSelect(line.lineNumber, 'custom')}
                              className={`px-2 py-1 text-xs rounded flex items-center ${
                                selectedResolution === 'custom'
                                  ? 'bg-blue-500 text-white'
                                  : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                              }`}
                            >
                              <ArrowLeftRight className="w-3 h-3 mr-1" />
                              自定义
                            </button>
                          </div>

                          {/* Custom edit area */}
                          {selectedResolution === 'custom' && (
                            <div className="mt-2">
                              <textarea
                                value={customEdits[line.lineNumber] || line.conflictInfo!.current}
                                onChange={(e) => handleCustomEdit(line.lineNumber, e.target.value)}
                                className="w-full p-2 text-xs font-mono border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                rows={2}
                              />
                            </div>
                          )}

                          {/* Show selected resolution */}
                          {selectedResolution && selectedResolution !== 'custom' && (
                            <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded">
                              <div className="text-xs font-mono text-blue-900">
                                {selectedResolution === 'original'
                                  ? line.conflictInfo!.original
                                  : line.conflictInfo!.incoming
                                }
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className={getLineClassName(line)}>
                        {line.content}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex justify-between items-center">
        <div className="text-sm text-gray-600">
          进度: {resolvedCount} / {conflictLines.length} 冲突已解决
        </div>
        <div className="flex space-x-2">
          <button
            onClick={onRejectAll}
            className="px-4 py-2 text-sm text-gray-700 bg-gray-200 rounded hover:bg-gray-300 flex items-center"
          >
            <X className="w-4 h-4 mr-1" />
            全部拒绝
          </button>
          <button
            onClick={onAcceptAll}
            disabled={resolvedCount < conflictLines.length}
            className="px-4 py-2 text-sm text-white bg-green-600 rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
          >
            <Check className="w-4 h-4 mr-1" />
            应用解决
          </button>
        </div>
      </div>
    </div>
  )
}

export default ThreeWayDiffViewer