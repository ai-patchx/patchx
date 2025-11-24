import React, { useState } from 'react'
import { AlertTriangle, GitMerge, Play, Download, Eye } from 'lucide-react'
import EnhancedConflictResolutionModal from './EnhancedConflictResolutionModal'
import { ConflictData } from '../types/ui'
import { ConflictResolutionResponse } from '../types/ai'

// 模拟冲突数据
const mockConflictData: ConflictData = {
  filePath: 'src/components/ExampleComponent.tsx',
  originalCode: `function ExampleComponent() {
  const [count, setCount] = useState(0);

  const handleClick = () => {
    setCount(count + 1);
  };

  return (
    <div>
      <h1>Count: {count}</h1>
      <button onClick={handleClick}>Increment</button>
    </div>
  );
}`,
  incomingCode: `function ExampleComponent() {
  const [count, setCount] = useState(0);
  const [message, setMessage] = useState('');

  const handleClick = () => {
    setCount(count + 1);
    setMessage('Button clicked!');
  };

  return (
    <div>
      <h2>Count: {count}</h2>
      <p>{message}</p>
      <button onClick={handleClick}>Increment</button>
    </div>
  );
}`,
  currentCode: `function ExampleComponent() {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    setCount(count + 1);
    setLoading(false);
  };

  return (
    <div>
      <h1>Count: {count}</h1>
      {loading && <p>Loading...</p>}
      <button onClick={handleClick} disabled={loading}>
        {loading ? 'Processing...' : 'Increment'}
      </button>
    </div>
  );
}`,
  conflicts: [
    {
      lineNumber: 2,
      type: 'add_add',
      description: 'Both versions add different state variables',
      original: '  const [count, setCount] = useState(0);',
      incoming: '  const [count, setCount] = useState(0);\n  const [message, setMessage] = useState(\'\');',
      current: '  const [count, setCount] = useState(0);\n  const [loading, setLoading] = useState(false);'
    },
    {
      lineNumber: 4,
      type: 'modify_modify',
      description: 'Different implementations of handleClick',
      original: '  const handleClick = () => {\n    setCount(count + 1);\n  };',
      incoming: '  const handleClick = () => {\n    setCount(count + 1);\n    setMessage(\'Button clicked!\');\n  };',
      current: '  const handleClick = async () => {\n    setLoading(true);\n    await new Promise(resolve => setTimeout(resolve, 1000));\n    setCount(count + 1);\n    setLoading(false);\n  };'
    },
    {
      lineNumber: 8,
      type: 'context_conflict',
      description: 'Different return statements',
      original: '  return (\n    <div>\n      <h1>Count: {count}</h1>\n      <button onClick={handleClick}>Increment</button>\n    </div>\n  );',
      incoming: '  return (\n    <div>\n      <h2>Count: {count}</h2>\n      <p>{message}</p>\n      <button onClick={handleClick}>Increment</button>\n    </div>\n  );',
      current: '  return (\n    <div>\n      <h1>Count: {count}</h1>\n      {loading && <p>Loading...</p>}\n      <button onClick={handleClick} disabled={loading}>\n        {loading ? \'Processing...\' : \'Increment\'}\n      </button>\n    </div>\n  );'
    }
  ]
}

const ConflictResolutionDemo: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [resolutionResult, setResolutionResult] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleTestConflictResolution = async () => {
    setIsLoading(true)
    try {
      // 测试冲突分析
      const analyzeResponse = await fetch('/api/conflict-resolution', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'analyze',
          originalCode: mockConflictData.originalCode,
          incomingCode: mockConflictData.incomingCode,
          currentCode: mockConflictData.currentCode,
          filePath: mockConflictData.filePath,
          conflicts: mockConflictData.conflicts
        })
      })

      const analyzeResult = await analyzeResponse.json() as { success: boolean; data: { threeWayDiff: unknown; conflictCount: number; hasConflicts: boolean } }
      console.log('Conflict analysis result:', analyzeResult)

      if (analyzeResult.success) {
        // 自动解决简单冲突
        const autoResolveResponse = await fetch('/api/conflict-resolution', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            action: 'auto-resolve',
            originalCode: mockConflictData.originalCode,
            incomingCode: mockConflictData.incomingCode,
            currentCode: mockConflictData.currentCode,
            filePath: mockConflictData.filePath,
            conflicts: mockConflictData.conflicts
          })
        })

        const autoResolveResult = await autoResolveResponse.json() as { success: boolean; data: { autoResolved: boolean; resolvedCode?: string } }
        console.log('Auto-resolve result:', autoResolveResult)

        if (autoResolveResult.success && autoResolveResult.data.autoResolved) {
          setResolutionResult(autoResolveResult.data.resolvedCode)
        } else {
          // 如果自动解决失败，打开模态框进行手动解决
          setIsModalOpen(true)
        }
      }
    } catch (error) {
      console.error('Conflict resolution test failed:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleManualResolution = () => {
    setIsModalOpen(true)
  }

  const handleResolve = (resolution: ConflictResolutionResponse) => {
    console.log('Conflict resolution completed:', resolution)
    setResolutionResult(resolution.resolvedCode)
    setIsModalOpen(false)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
  }

  const downloadResolvedCode = () => {
    if (resolutionResult) {
      const blob = new Blob([resolutionResult], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'resolved-component.tsx'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2 flex items-center">
          <GitMerge className="w-6 h-6 mr-2 text-orange-500" />
          Patch Conflict Resolution Demo
        </h2>
        <p className="text-gray-600">
          Demonstrates three-way diff comparison and conflict resolution functionality. The system will first attempt to automatically resolve simple conflicts,
          and if automatic resolution is not possible, it will open an interactive conflict resolution interface.
        </p>
      </div>

      {/* Conflict Overview */}
      <div className="mb-6 p-4 bg-orange-50 border border-orange-200 rounded-lg">
        <div className="flex items-center mb-3">
          <AlertTriangle className="w-5 h-5 text-orange-500 mr-2" />
          <h3 className="text-lg font-semibold text-orange-900">Conflicts Detected</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-3 rounded border">
            <h4 className="font-medium text-gray-900 mb-2">Original Version</h4>
            <pre className="text-xs bg-gray-50 p-2 rounded overflow-auto max-h-32">
              <code>{mockConflictData.originalCode}</code>
            </pre>
          </div>
          <div className="bg-white p-3 rounded border">
            <h4 className="font-medium text-gray-900 mb-2">Incoming Version</h4>
            <pre className="text-xs bg-green-50 p-2 rounded overflow-auto max-h-32">
              <code>{mockConflictData.incomingCode}</code>
            </pre>
          </div>
          <div className="bg-white p-3 rounded border">
            <h4 className="font-medium text-gray-900 mb-2">Current Version</h4>
            <pre className="text-xs bg-blue-50 p-2 rounded overflow-auto max-h-32">
              <code>{mockConflictData.currentCode}</code>
            </pre>
          </div>
        </div>
        <div className="mt-3 text-sm text-orange-800">
          Number of conflicts: {mockConflictData.conflicts.length}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex space-x-3 mb-6">
        <button
          onClick={handleTestConflictResolution}
          disabled={isLoading}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center"
        >
          {isLoading ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
              Processing...
            </>
          ) : (
            <>
              <Play className="w-4 h-4 mr-2" />
              Auto Resolve Conflicts
            </>
          )}
        </button>
        <button
          onClick={handleManualResolution}
          className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 flex items-center"
        >
          <GitMerge className="w-4 h-4 mr-2" />
          Manual Resolve Conflicts
        </button>
      </div>

      {/* Resolution Result */}
      {resolutionResult && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center">
              <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center mr-2">
                <span className="text-white text-xs">✓</span>
              </div>
              <h3 className="text-lg font-semibold text-green-900">Conflicts Resolved</h3>
            </div>
            <button
              onClick={downloadResolvedCode}
              className="px-3 py-1 text-sm text-green-700 bg-green-100 rounded hover:bg-green-200 flex items-center"
            >
              <Download className="w-4 h-4 mr-1" />
              Download Resolution
            </button>
          </div>
          <pre className="text-xs bg-white p-3 rounded border overflow-auto max-h-64">
            <code>{resolutionResult}</code>
          </pre>
        </div>
      )}

      {/* Conflict Details */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
          <Eye className="w-5 h-5 mr-2 text-gray-500" />
          Conflict Details
        </h3>
        <div className="space-y-3">
          {mockConflictData.conflicts.map((conflict, index) => (
            <div key={index} className="p-3 bg-gray-50 border border-gray-200 rounded">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-900">
                  Line {conflict.lineNumber} - {conflict.type}
                </span>
                <span className="px-2 py-1 text-xs bg-red-100 text-red-800 rounded">
                  Conflict
                </span>
              </div>
              <p className="text-sm text-gray-600 mb-2">{conflict.description}</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                <div>
                  <span className="font-medium text-gray-700">Original:</span>
                  <pre className="bg-red-50 p-2 rounded mt-1">{conflict.original}</pre>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Incoming:</span>
                  <pre className="bg-green-50 p-2 rounded mt-1">{conflict.incoming}</pre>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Current:</span>
                  <pre className="bg-blue-50 p-2 rounded mt-1">{conflict.current}</pre>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 冲突解决模态框 */}
      <EnhancedConflictResolutionModal
        isOpen={isModalOpen}
        conflictData={mockConflictData}
        onClose={handleCloseModal}
        onResolve={handleResolve}
        aiProviders={['OpenAI', 'Claude', 'Gemini']}
        isAIEnabled={true}
      />
    </div>
  )
}

export default ConflictResolutionDemo