import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  GitMerge,
  AlertTriangle,
  Play,
  Download,
  Eye,
  Settings,
  FileText,
  Code,
  CheckCircle,
  XCircle
} from 'lucide-react'
import ConflictResolutionDemo from '../components/ConflictResolutionDemo'
import EnhancedConflictResolutionModal from '../components/EnhancedConflictResolutionModal'
import { ConflictData } from '../types/ui'
import { ConflictResolutionResponse } from '../types/ai'

// 更复杂的冲突场景
const complexConflictData: ConflictData = {
  filePath: 'src/services/apiService.ts',
  originalCode: [
    "import axios from 'axios';",
    '',
    'class ApiService {',
    "  private baseURL = 'https://api.example.com';",
    '  ',
    '  async getUser(id: string) {',
    '    const response = await axios.get(`${this.baseURL}/users/${id}`);',
    '    return response.data;',
    '  }',
    '  ',
    '  async createUser(userData: any) {',
    '    const response = await axios.post(`${this.baseURL}/users`, userData);',
    '    return response.data;',
    '  }',
    '}'
  ].join('\n'),
  incomingCode: [
    "import axios from 'axios';",
    "import { User, CreateUserRequest } from '../types/user';",
    '',
    'class ApiService {',
    "  private baseURL = 'https://api.example.com';",
    '  private timeout = 5000;',
    '  ',
    '  async getUser(id: string): Promise<User> {',
    '    const response = await axios.get(`${this.baseURL}/users/${id}`, {',
    '      timeout: this.timeout',
    '    });',
    '    return response.data;',
    '  }',
    '  ',
    '  async createUser(userData: CreateUserRequest): Promise<User> {',
    '    const response = await axios.post(`${this.baseURL}/users`, userData, {',
    '      timeout: this.timeout,',
    '      headers: {',
    "        'Content-Type': 'application/json'",
    '      }',
    '    });',
    '    return response.data;',
    '  }',
    '  ',
    '  async updateUser(id: string, userData: Partial<User>): Promise<User> {',
    '    const response = await axios.patch(`${this.baseURL}/users/${id}`, userData);',
    '    return response.data;',
    '  }',
    '}'
  ].join('\n'),
  currentCode: [
    "import axios from 'axios';",
    "import { authStore } from '../stores/authStore';",
    '',
    'class ApiService {',
    "  private baseURL = 'https://api.example.com';",
    '  private retryCount = 3;',
    '  ',
    '  private async requestWithRetry(request: () => Promise<any>) {',
    '    for (let i = 0; i < this.retryCount; i++) {',
    '      try {',
    '        return await request();',
    '      } catch (error) {',
    '        if (i === this.retryCount - 1) throw error;',
    '        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));',
    '      }',
    '    }',
    '  }',
    '  ',
    '  async getUser(id: string) {',
    '    return this.requestWithRetry(async () => {',
    '      const token = authStore.getToken();',
    '      const response = await axios.get(`${this.baseURL}/users/${id}`, {',
    '        headers: { Authorization: `Bearer ${token}` }',
    '      });',
    '      return response.data;',
    '    });',
    '  }',
    '  ',
    '  async createUser(userData: any) {',
    '    return this.requestWithRetry(async () => {',
    '      const token = authStore.getToken();',
    '      const response = await axios.post(`${this.baseURL}/users`, userData, {',
    '        headers: { Authorization: `Bearer ${token}` }',
    '      });',
    '      return response.data;',
    '    });',
    '  }',
    '}'
  ].join('\n'),
  conflicts: [
    {
      lineNumber: 1,
      type: 'add_add',
      description: 'Different import statements',
      original: "import axios from 'axios';",
      incoming: "import axios from 'axios';\nimport { User, CreateUserRequest } from '../types/user';",
      current: "import axios from 'axios';\nimport { authStore } from '../stores/authStore';"
    },
    {
      lineNumber: 3,
      type: 'add_add',
      description: 'Different class properties',
      original: 'class ApiService {\n  private baseURL = \'https://api.example.com\';',
      incoming: 'class ApiService {\n  private baseURL = \'https://api.example.com\';\n  private timeout = 5000;',
      current: 'class ApiService {\n  private baseURL = \'https://api.example.com\';\n  private retryCount = 3;'
    },
    {
      lineNumber: 6,
      type: 'modify_modify',
      description: 'Different getUser implementations',
      original: '  async getUser(id: string)\n    const response = await axios.get(`${this.baseURL}/users/${id}`);\n    return response.data;\n  }',
      incoming: '  async getUser(id: string): Promise<User>\n    const response = await axios.get(`${this.baseURL}/users/${id}`, {\n      timeout: this.timeout\n    });\n    return response.data;\n  }',
      current: '  async getUser(id: string)\n    return this.requestWithRetry(async () => {\n      const token = authStore.getToken();\n      const response = await axios.get(`${this.baseURL}/users/${id}`, {\n        headers: { Authorization: `Bearer ${token}` }\n      });\n      return response.data;\n    });\n  }'
    }
  ]
}

const ConflictResolutionTestPage: React.FC = () => {
  const navigate = useNavigate()
  const [activeDemo, setActiveDemo] = useState<'simple' | 'complex' | 'custom'>('simple')
  const [showComplexModal, setShowComplexModal] = useState(false)
  const [testResults, setTestResults] = useState<{
    autoResolve?: boolean
    manualResolve?: boolean
    aiResolve?: boolean
    resolvedCode?: string
  }>({})

  const handleBack = () => {
    navigate('/')
  }

  const handleTestComplexScenario = async () => {
    try {
      // 首先尝试自动解决
      const autoResolveResponse = await fetch('/api/conflict-resolution', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'auto-resolve',
          originalCode: complexConflictData.originalCode,
          incomingCode: complexConflictData.incomingCode,
          currentCode: complexConflictData.currentCode,
          filePath: complexConflictData.filePath,
          conflicts: complexConflictData.conflicts
        })
      })

      const autoResolveResult = await autoResolveResponse.json() as { success: boolean; data: { autoResolved: boolean; resolvedCode?: string } }

      if (autoResolveResult.success && autoResolveResult.data.autoResolved) {
        setTestResults({
          autoResolve: true,
          resolvedCode: autoResolveResult.data.resolvedCode
        })
      } else {
        // 如果自动解决失败，打开手动解决模态框
        setShowComplexModal(true)
      }
    } catch (error) {
      console.error('Complex conflict test failed:', error)
      setTestResults({ autoResolve: false })
    }
  }

  const handleComplexResolve = (resolution: ConflictResolutionResponse) => {
    console.log('Complex conflict resolution completed:', resolution)
    setTestResults({
      manualResolve: true,
      resolvedCode: resolution.resolvedCode
    })
    setShowComplexModal(false)
  }

  const handleCloseComplexModal = () => {
    setShowComplexModal(false)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <button
                onClick={handleBack}
                className="mr-4 p-2 text-gray-400 hover:text-gray-600 rounded-md"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="flex items-center">
                <GitMerge className="w-6 h-6 text-orange-500 mr-2" />
                <h1 className="text-xl font-semibold text-gray-900">冲突解决测试</h1>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button className="p-2 text-gray-400 hover:text-gray-600 rounded-md">
                <Settings className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Test Scenario Selection */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">选择测试场景</h2>
          <div className="flex space-x-4">
            <button
              onClick={() => setActiveDemo('simple')}
              className={`px-4 py-2 rounded-md text-sm font-medium ${
                activeDemo === 'simple'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              简单冲突场景
            </button>
            <button
              onClick={() => setActiveDemo('complex')}
              className={`px-4 py-2 rounded-md text-sm font-medium ${
                activeDemo === 'complex'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              复杂冲突场景
            </button>
            <button
              onClick={() => setActiveDemo('custom')}
              className={`px-4 py-2 rounded-md text-sm font-medium ${
                activeDemo === 'custom'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              自定义冲突
            </button>
          </div>
        </div>

        {/* Simple Demo */}
        {activeDemo === 'simple' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <FileText className="w-5 h-5 mr-2 text-blue-500" />
                简单冲突解决演示
              </h3>
              <ConflictResolutionDemo />
            </div>
          </div>
        )}

        {/* Complex Demo */}
        {activeDemo === 'complex' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                  <Code className="w-5 h-5 mr-2 text-purple-500" />
                  复杂冲突场景测试
                </h3>
                <button
                  onClick={handleTestComplexScenario}
                  className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 flex items-center"
                >
                  <Play className="w-4 h-4 mr-2" />
                  测试复杂冲突
                </button>
              </div>

              {/* Complex Conflict Overview */}
              <div className="mb-6 p-4 bg-orange-50 border border-orange-200 rounded-lg">
                <div className="flex items-center mb-3">
                  <AlertTriangle className="w-5 h-5 text-orange-500 mr-2" />
                  <h4 className="font-semibold text-orange-900">复杂冲突场景</h4>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="bg-white p-3 rounded border">
                    <h5 className="font-medium text-gray-900 mb-2 flex items-center">
                      <FileText className="w-4 h-4 mr-1" />
                      原始版本
                    </h5>
                    <pre className="text-xs bg-gray-50 p-2 rounded overflow-auto max-h-40">
                      <code>{complexConflictData.originalCode}</code>
                    </pre>
                  </div>
                  <div className="bg-white p-3 rounded border">
                    <h5 className="font-medium text-gray-900 mb-2 flex items-center">
                      <GitMerge className="w-4 h-4 mr-1" />
                      传入版本
                    </h5>
                    <pre className="text-xs bg-green-50 p-2 rounded overflow-auto max-h-40">
                      <code>{complexConflictData.incomingCode}</code>
                    </pre>
                  </div>
                  <div className="bg-white p-3 rounded border">
                    <h5 className="font-medium text-gray-900 mb-2 flex items-center">
                      <AlertTriangle className="w-4 h-4 mr-1" />
                      当前版本
                    </h5>
                    <pre className="text-xs bg-blue-50 p-2 rounded overflow-auto max-h-40">
                      <code>{complexConflictData.currentCode}</code>
                    </pre>
                  </div>
                </div>
              </div>

              {/* Test Results */}
              {testResults.autoResolve !== undefined && (
                <div className={`p-4 rounded-lg border ${
                  testResults.autoResolve
                    ? 'bg-green-50 border-green-200'
                    : 'bg-yellow-50 border-yellow-200'
                }`}>
                  <div className="flex items-center mb-3">
                    {testResults.autoResolve ? (
                      <CheckCircle className="w-5 h-5 text-green-500 mr-2" />
                    ) : (
                      <XCircle className="w-5 h-5 text-yellow-500 mr-2" />
                    )}
                    <h4 className="font-semibold text-gray-900">
                      {testResults.autoResolve ? '自动解决成功' : '需要手动解决'}
                    </h4>
                  </div>

                  {testResults.resolvedCode && (
                    <div>
                      <h5 className="font-medium text-gray-900 mb-2">解决结果:</h5>
                      <pre className="text-xs bg-white p-3 rounded border overflow-auto max-h-64">
                        <code>{testResults.resolvedCode}</code>
                      </pre>
                      <div className="mt-3 flex space-x-2">
                        <button
                          onClick={() => {
                            const blob = new Blob([testResults.resolvedCode!], { type: 'text/plain' })
                            const url = URL.createObjectURL(blob)
                            const a = document.createElement('a')
                            a.href = url
                            a.download = 'resolved-api-service.ts'
                            a.click()
                            URL.revokeObjectURL(url)
                          }}
                          className="px-3 py-1 text-sm text-blue-700 bg-blue-100 rounded hover:bg-blue-200 flex items-center"
                        >
                          <Download className="w-4 h-4 mr-1" />
                          下载
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Custom Demo */}
        {activeDemo === 'custom' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <Settings className="w-5 h-5 mr-2 text-green-500" />
                自定义冲突测试
              </h3>
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Code className="w-8 h-8 text-green-600" />
                </div>
                <h4 className="text-lg font-medium text-gray-900 mb-2">自定义冲突场景</h4>
                <p className="text-gray-600 mb-4">
                  上传您自己的代码文件来测试冲突解决功能
                </p>
                <div className="flex justify-center space-x-3">
                  <button className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700">
                    上传原始文件
                  </button>
                  <button className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
                    上传传入文件
                  </button>
                  <button className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700">
                    上传当前文件
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Features Overview */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
              <GitMerge className="w-6 h-6 text-blue-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">三向差异比较</h3>
            <p className="text-gray-600 text-sm">
              直观显示原始版本、传入版本和当前版本之间的差异，帮助快速识别冲突点。
            </p>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
              <Play className="w-6 h-6 text-green-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">自动冲突解决</h3>
            <p className="text-gray-600 text-sm">
              智能算法自动检测并解决简单冲突，减少手动操作，提高解决效率。
            </p>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
              <Eye className="w-6 h-6 text-purple-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">可视化解决</h3>
            <p className="text-gray-600 text-sm">
              提供可视化界面进行手动冲突解决，支持自定义编辑和实时预览。
            </p>
          </div>
        </div>
      </div>

      {/* Complex Conflict Modal */}
      <EnhancedConflictResolutionModal
        isOpen={showComplexModal}
        conflictData={complexConflictData}
        onClose={handleCloseComplexModal}
        onResolve={handleComplexResolve}
        aiProviders={['OpenAI', 'Claude', 'Gemini']}
        isAIEnabled={true}
      />
    </div>
  )
}

export default ConflictResolutionTestPage