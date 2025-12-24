import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Settings, Plus, Edit, Trash2, TestTube, Moon, Sun, ArrowLeft, Server, Key, Lock, Globe, Mail, Send, ShieldAlert, Brain, Save } from 'lucide-react'
import useRemoteNodeStore from '@/stores/remoteNodeStore'
import { useTheme } from '@/hooks/useTheme'
import { useAuthStore } from '@/stores/authStore'
import type { RemoteNode, RemoteNodeFormData } from '@/types'
import packageInfo from '../../package.json'

export default function SettingsPage() {
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const { isAdmin } = useAuthStore()
  const { nodes, isLoading, error, fetchNodes, addNode, updateNode, deleteNode, testConnection, testConnectionConfig, setError } = useRemoteNodeStore()
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingNode, setEditingNode] = useState<RemoteNode | null>(null)
  const [formData, setFormData] = useState<RemoteNodeFormData>({
    name: '',
    host: '',
    port: 22,
    username: '',
    authType: 'key',
    sshKey: '',
    password: '',
    workingHome: '',
    sshServiceApiUrl: '',
    sshServiceApiKey: ''
  })
  const [testingNodeId, setTestingNodeId] = useState<string | null>(null)
  const [testingConfig, setTestingConfig] = useState(false)
  const [testConfigResult, setTestConfigResult] = useState<{ success: boolean; message: string } | null>(null)
  const [testEmail, setTestEmail] = useState('')
  const [testingEmail, setTestingEmail] = useState(false)
  const [emailTestResult, setEmailTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [litellmBaseUrl, setLitellmBaseUrl] = useState('')
  const [litellmApiKey, setLitellmApiKey] = useState('')
  const [litellmModel, setLitellmModel] = useState('')
  const [loadingSettings, setLoadingSettings] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)
  const [settingsError, setSettingsError] = useState<string | null>(null)
  const [settingsSuccess, setSettingsSuccess] = useState(false)
  const [testingLiteLLM, setTestingLiteLLM] = useState(false)
  const [liteLLMTestResult, setLiteLLMTestResult] = useState<{ success: boolean; message: string } | null>(null)

  // Redirect non-admin users
  useEffect(() => {
    if (!isAdmin()) {
      navigate('/submit', { replace: true })
    }
  }, [isAdmin, navigate])

  useEffect(() => {
    if (isAdmin()) {
      fetchNodes()
      // Note: LiteLLM settings are not fetched automatically
      // Users can enter values manually or use Test Connection to verify
    }
  }, [fetchNodes, isAdmin])

  const fetchSettings = async () => {
    setLoadingSettings(true)
    setSettingsError(null)
    try {
      const response = await fetch('/api/settings', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      const contentType = response.headers.get('content-type') || ''
      const isJson = contentType.includes('application/json')

      if (!response.ok) {
        if (isJson) {
          try {
            const errorData = await response.json() as { error?: string }
            throw new Error(errorData.error || `Failed to load settings: ${response.status} ${response.statusText}`)
          } catch (parseErr) {
            throw new Error(`Failed to load settings: ${response.status} ${response.statusText}`)
          }
        } else {
          // Non-JSON error response (likely HTML error page)
          const text = await response.text()
          console.error('Non-JSON error response:', text.substring(0, 200))
          throw new Error(`Failed to load settings: ${response.status} ${response.statusText}. The API endpoint may not be configured correctly.`)
        }
      }

      if (!isJson) {
        // Non-JSON success response (shouldn't happen, but handle gracefully)
        const text = await response.text()
        console.error('Non-JSON success response:', text.substring(0, 200))
        throw new Error('Invalid response format from server. Please ensure the API endpoint is configured correctly.')
      }

      const data = await response.json() as { success: boolean; data?: Record<string, string>; error?: string }

      if (data.success) {
        // Handle empty settings gracefully - it's OK if no settings exist yet
        setLitellmBaseUrl(data.data?.['litellm_base_url'] || '')
        setLitellmApiKey(data.data?.['litellm_api_key'] || '')
        setLitellmModel(data.data?.['litellm_model'] || '')
      } else {
        // Only show error if there's an actual error message
        if (data.error) {
          setSettingsError(data.error)
        }
        // If no error message, just leave fields empty (settings don't exist yet)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load settings'
      setSettingsError(errorMessage)
      console.error('Failed to fetch LiteLLM settings:', err)
    } finally {
      setLoadingSettings(false)
    }
  }

  const handleTestLiteLLM = async () => {
    if (!litellmBaseUrl.trim() || !litellmApiKey.trim()) {
      setLiteLLMTestResult({
        success: false,
        message: 'Please enter Base URL and API Key before testing'
      })
      return
    }

    setTestingLiteLLM(true)
    setLiteLLMTestResult(null)
    setSettingsError(null)

    try {
      const response = await fetch('/api/settings/test-litellm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          litellm_base_url: litellmBaseUrl.trim(),
          litellm_api_key: litellmApiKey.trim(),
          litellm_model: litellmModel.trim()
        })
      })

      if (!response.ok) {
        const contentType = response.headers.get('content-type')
        if (contentType && contentType.includes('application/json')) {
          const errorData = await response.json().catch(() => ({ error: 'LiteLLM connection test failed' })) as { error?: string }
          throw new Error(errorData.error || `LiteLLM connection test failed: ${response.status} ${response.statusText}`)
        } else {
          throw new Error(`LiteLLM connection test failed: ${response.status} ${response.statusText}`)
        }
      }

      const contentType = response.headers.get('content-type')
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Invalid response format from server')
      }

      const data = await response.json() as { success: boolean; message?: string; error?: string }

      if (data.success) {
        setLiteLLMTestResult({
          success: true,
          message: data.message || 'LiteLLM connection test successful!'
        })
      } else {
        setLiteLLMTestResult({
          success: false,
          message: data.error || 'LiteLLM connection test failed'
        })
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to test LiteLLM connection'
      setLiteLLMTestResult({
        success: false,
        message: errorMessage
      })
      console.error('Failed to test LiteLLM connection:', err)
    } finally {
      setTestingLiteLLM(false)
    }
  }

  const handleSaveSettings = async () => {
    setSavingSettings(true)
    setSettingsError(null)
    setSettingsSuccess(false)
    setLiteLLMTestResult(null)

    // Validate required fields
    if (!litellmBaseUrl.trim() || !litellmApiKey.trim() || !litellmModel.trim()) {
      setSettingsError('Base URL, API Key, and Model Name are required')
      setSavingSettings(false)
      return
    }

    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          litellm_base_url: litellmBaseUrl.trim(),
          litellm_api_key: litellmApiKey.trim(),
          litellm_model: litellmModel.trim()
        })
      })

      if (!response.ok) {
        const contentType = response.headers.get('content-type')
        if (contentType && contentType.includes('application/json')) {
          const errorData = await response.json().catch(() => ({ error: 'Failed to save settings' })) as { error?: string }
          throw new Error(errorData.error || `Failed to save settings: ${response.status} ${response.statusText}`)
        } else {
          throw new Error(`Failed to save settings: ${response.status} ${response.statusText}`)
        }
      }

      const contentType = response.headers.get('content-type')
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Invalid response format from server')
      }

      const data = await response.json() as { success: boolean; message?: string; error?: string }

      if (data.success) {
        setSettingsSuccess(true)
        setTimeout(() => setSettingsSuccess(false), 3000)
        // Settings saved successfully - no need to fetch, values are already in state
      } else {
        throw new Error(data.error || 'Failed to save settings')
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save settings'
      setSettingsError(errorMessage)
      console.error('Failed to save LiteLLM settings:', err)
    } finally {
      setSavingSettings(false)
    }
  }

  const handleAddNode = () => {
    setEditingNode(null)
    setFormData({
      name: '',
      host: '',
      port: 22,
      username: '',
      authType: 'key',
      sshKey: '',
      password: '',
      workingHome: '',
      sshServiceApiUrl: '',
      sshServiceApiKey: ''
    })
    setShowAddModal(true)
    setError(null)
    setTestConfigResult(null)
  }

  const handleEditNode = (node: RemoteNode) => {
    setEditingNode(node)
    setFormData({
      name: node.name,
      host: node.host,
      port: node.port,
      username: node.username,
      authType: node.authType,
      sshKey: node.sshKey || '',
      password: '', // Don't show password, user needs to re-enter
      workingHome: node.workingHome || '',
      sshServiceApiUrl: node.sshServiceApiUrl || '',
      sshServiceApiKey: node.sshServiceApiKey || ''
    })
    setShowAddModal(true)
    setError(null)
    setTestConfigResult(null)
  }

  const handleDeleteNode = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this remote node?')) {
      try {
        await deleteNode(id)
      } catch (err) {
        // Error is handled by store
      }
    }
  }

  const handleTestConnection = async (id: string) => {
    setTestingNodeId(id)
    try {
      const success = await testConnection(id)
      if (success) {
        alert('Connection test successful!')
      } else {
        alert('Connection test failed. Please check the error message.')
      }
    } catch (err) {
      alert('Connection test failed. Please check the error message.')
    } finally {
      setTestingNodeId(null)
    }
  }

  const handleTestNewNodeConnection = async () => {
    setError(null)
    setTestConfigResult(null)
    setTestingConfig(true)
    try {
      const result = await testConnectionConfig(formData)
      setTestConfigResult(result)
    } catch (err) {
      setTestConfigResult({
        success: false,
        message: err instanceof Error ? err.message : 'Connection test failed'
      })
    } finally {
      setTestingConfig(false)
    }
  }

  const handleTestEmail = async () => {
    if (!testEmail.trim()) {
      setEmailTestResult({ success: false, message: 'Please enter an email address' })
      return
    }

    setTestingEmail(true)
    setEmailTestResult(null)

    try {
      const response = await fetch('/api/email/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email: testEmail.trim() })
      })

      const data = await response.json() as { success: boolean; message?: string; error?: string }

      if (data.success) {
        setEmailTestResult({ success: true, message: data.message || 'Test email sent successfully!' })
        setTestEmail('')
      } else {
        setEmailTestResult({ success: false, message: data.error || 'Failed to send test email' })
      }
    } catch (err) {
      setEmailTestResult({
        success: false,
        message: err instanceof Error ? err.message : 'Failed to send test email'
      })
    } finally {
      setTestingEmail(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    try {
      if (editingNode) {
        await updateNode(editingNode.id, formData)
      } else {
        await addNode(formData)
      }
      // Clear any errors and close modal only if operation was successful
      setError(null)
      setShowAddModal(false)
      setEditingNode(null)
      setTestConfigResult(null)
      setFormData({
        name: '',
        host: '',
        port: 22,
        username: '',
        authType: 'key',
        sshKey: '',
        password: '',
        workingHome: '',
        sshServiceApiUrl: '',
        sshServiceApiKey: ''
      })
    } catch (err) {
      // Error is handled by store and will be displayed in the modal
      // The modal will remain open so user can fix the issue
      console.error('Failed to save remote node:', err)
      // Error state is already set by the store, so it will be displayed
    }
  }

  const inputBase = 'block w-full pl-10 pr-3 py-2 rounded-md leading-5 placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500'
  const inputLight = 'bg-white border border-gray-300 focus:border-blue-500'
  const inputDark = 'input-gradient border focus:border-blue-500'

  // Don't render if not admin (will redirect)
  if (!isAdmin()) {
    return (
      <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8 flex items-center justify-center">
        <div className={`${theme === 'dark' ? 'gradient-card' : 'bg-white'} max-w-md mx-auto rounded-lg shadow-lg p-6 text-center`}>
          <ShieldAlert className={`w-12 h-12 mx-auto mb-4 ${theme === 'dark' ? 'text-gradient-primary' : 'text-red-600'}`} />
          <h2 className={`text-xl font-bold mb-2 ${theme === 'dark' ? 'text-gradient-primary' : 'text-gray-900'}`}>
            Access Denied
          </h2>
          <p className={`mb-4 ${theme === 'dark' ? 'text-gradient-secondary' : 'text-gray-600'}`}>
            This page is only accessible to administrators.
          </p>
          <button
            onClick={() => navigate('/submit')}
            className={`${theme === 'dark' ? 'btn-gradient' : 'bg-blue-600 hover:bg-blue-700 text-white'} px-4 py-2 rounded-lg transition-colors duration-200`}
          >
            Go to Submit Page
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className={`${theme === 'dark' ? 'gradient-card' : 'bg-white'} max-w-4xl w-full rounded-lg shadow-lg overflow-hidden`}>
        <div className="px-6 py-6">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center space-x-3">
              <Settings className={`w-6 h-6 ${theme === 'dark' ? 'text-gradient-primary' : 'text-gray-700'}`} />
              <h1 className={`text-2xl font-bold ${theme === 'dark' ? 'text-gradient-primary' : 'text-gray-900'}`}>
                Settings
              </h1>
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => navigate('/submit')}
                className={`${theme === 'dark' ? 'btn-gradient' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'} px-3 py-1 rounded-lg text-sm transition-colors duration-200 flex items-center`}
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                Return
              </button>
              <button
                onClick={toggleTheme}
                className={`${theme === 'dark' ? 'btn-gradient' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'} p-2 rounded-lg transition-colors duration-200`}
              >
                {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Add Node Button */}
          <div className="mb-6">
            <button
              onClick={handleAddNode}
              className={`${theme === 'dark' ? 'btn-gradient' : 'bg-blue-600 hover:bg-blue-700 text-white'} px-4 py-2 rounded-lg transition-colors duration-200 flex items-center`}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Remote Node
            </button>
          </div>

          {/* Nodes List */}
          {isLoading && nodes.length === 0 ? (
            <div className={`text-center py-8 ${theme === 'dark' ? 'text-gradient-secondary' : 'text-gray-600'}`}>
              Loading nodes...
            </div>
          ) : nodes.length === 0 ? (
            <div className={`text-center py-8 ${theme === 'dark' ? 'text-gradient-secondary' : 'text-gray-600'}`}>
              No remote nodes configured. Click "Add Remote Node" to get started.
            </div>
          ) : (
            <div className="space-y-4">
              {nodes.map((node) => (
                <div
                  key={node.id}
                  className={`${theme === 'dark' ? 'bg-gradient-dark-subtle border border-gray-700/40' : 'bg-gray-50 border border-gray-200'} rounded-lg p-4`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <Server className={`w-5 h-5 ${theme === 'dark' ? 'text-gradient-primary' : 'text-gray-700'}`} />
                        <h3 className={`text-lg font-semibold ${theme === 'dark' ? 'text-gradient-primary' : 'text-gray-900'}`}>
                          {node.name}
                        </h3>
                      </div>
                      <div className={`space-y-1 text-sm ${theme === 'dark' ? 'text-gradient-secondary' : 'text-gray-600'}`}>
                        <div className="flex items-center space-x-2">
                          <Globe className="w-4 h-4" />
                          <span>{node.username}@{node.host}:{node.port}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          {node.authType === 'key' ? (
                            <>
                              <Key className="w-4 h-4" />
                              <span>SSH Key Authentication</span>
                            </>
                          ) : (
                            <>
                              <Lock className="w-4 h-4" />
                              <span>Password Authentication</span>
                            </>
                          )}
                        </div>
                        {node.workingHome && (
                          <div className="flex items-center space-x-2">
                            <Globe className="w-4 h-4" />
                            <span>Working Home: {node.workingHome}</span>
                          </div>
                        )}
                        <div className="text-xs opacity-75">
                          Created: {new Date(node.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                    <div className="flex space-x-2 ml-4">
                      <button
                        onClick={() => handleTestConnection(node.id)}
                        disabled={testingNodeId === node.id || isLoading}
                        className={`${theme === 'dark' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-600 hover:bg-blue-700'} text-white px-3 py-1 rounded text-sm transition-colors duration-200 flex items-center disabled:opacity-50`}
                      >
                        <TestTube className="w-4 h-4 mr-1" />
                        {testingNodeId === node.id ? 'Testing...' : 'Test'}
                      </button>
                      <button
                        onClick={() => handleEditNode(node)}
                        className={`${theme === 'dark' ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-yellow-600 hover:bg-yellow-700'} text-white px-3 py-1 rounded text-sm transition-colors duration-200 flex items-center`}
                      >
                        <Edit className="w-4 h-4 mr-1" />
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteNode(node.id)}
                        className={`${theme === 'dark' ? 'bg-red-600 hover:bg-red-700' : 'bg-red-600 hover:bg-red-700'} text-white px-3 py-1 rounded text-sm transition-colors duration-200 flex items-center`}
                      >
                        <Trash2 className="w-4 h-4 mr-1" />
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* LiteLLM Configuration Section */}
          <div className={`mt-8 pt-8 border-t ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
            <div className="flex items-center space-x-3 mb-4">
              <Brain className={`w-6 h-6 ${theme === 'dark' ? 'text-gradient-primary' : 'text-gray-700'}`} />
              <h2 className={`text-xl font-semibold ${theme === 'dark' ? 'text-gradient-primary' : 'text-gray-900'}`}>
                LiteLLM Configuration
              </h2>
            </div>

            {loadingSettings ? (
              <div className={`text-center py-4 ${theme === 'dark' ? 'text-gradient-secondary' : 'text-gray-600'}`}>
                Loading settings...
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label htmlFor="litellmBaseUrl" className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gradient-primary' : 'text-gray-700'}`}>
                    Base URL *
                  </label>
                  <input
                    type="url"
                    id="litellmBaseUrl"
                    value={litellmBaseUrl}
                    onChange={(e) => {
                      setLitellmBaseUrl(e.target.value)
                      setSettingsError(null)
                      setSettingsSuccess(false)
                    }}
                    placeholder="https://your-litellm-server.com"
                    className={`${inputBase} ${theme === 'dark' ? inputDark : inputLight}`}
                  />
                </div>

                <div>
                  <label htmlFor="litellmApiKey" className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gradient-primary' : 'text-gray-700'}`}>
                    API Key *
                  </label>
                  <input
                    type="password"
                    id="litellmApiKey"
                    value={litellmApiKey}
                    onChange={(e) => {
                      setLitellmApiKey(e.target.value)
                      setSettingsError(null)
                      setSettingsSuccess(false)
                    }}
                    placeholder="Enter your LiteLLM API key"
                    className={`${inputBase} ${theme === 'dark' ? inputDark : inputLight}`}
                  />
                </div>

                <div>
                  <label htmlFor="litellmModel" className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gradient-primary' : 'text-gray-700'}`}>
                    Model Name *
                  </label>
                  <input
                    type="text"
                    id="litellmModel"
                    value={litellmModel}
                    onChange={(e) => {
                      setLitellmModel(e.target.value)
                      setSettingsError(null)
                      setSettingsSuccess(false)
                    }}
                    placeholder="Enter your LiteLLM model name"
                    className={`${inputBase} ${theme === 'dark' ? inputDark : inputLight}`}
                  />
                </div>

                {liteLLMTestResult && (
                  <div
                    className={`p-3 rounded-lg ${
                      liteLLMTestResult.success
                        ? theme === 'dark'
                          ? 'bg-green-900/30 border border-green-700/50'
                          : 'bg-green-50 border border-green-200'
                        : theme === 'dark'
                          ? 'bg-red-900/30 border border-red-700/50'
                          : 'bg-red-50 border border-red-200'
                    }`}
                  >
                    <p
                      className={`text-sm ${
                        liteLLMTestResult.success
                          ? theme === 'dark'
                            ? 'text-green-400'
                            : 'text-green-800'
                          : theme === 'dark'
                            ? 'text-red-400'
                            : 'text-red-800'
                      }`}
                    >
                      {liteLLMTestResult.success ? '✓ ' : '✗ '}
                      {liteLLMTestResult.message}
                    </p>
                  </div>
                )}

                {settingsError && (
                  <div
                    className={`p-3 rounded-lg ${
                      theme === 'dark'
                        ? 'bg-red-900/30 border border-red-700/50'
                        : 'bg-red-50 border border-red-200'
                    }`}
                  >
                    <div className={`text-sm ${theme === 'dark' ? 'text-red-400' : 'text-red-800'} whitespace-pre-wrap`}>
                      ✗ {settingsError}
                    </div>
                  </div>
                )}

                {settingsSuccess && (
                  <div
                    className={`p-3 rounded-lg ${
                      theme === 'dark'
                        ? 'bg-green-900/30 border border-green-700/50'
                        : 'bg-green-50 border border-green-200'
                    }`}
                  >
                    <p className={`text-sm ${theme === 'dark' ? 'text-green-400' : 'text-green-800'}`}>
                      ✓ Settings saved successfully!
                    </p>
                  </div>
                )}

                <div className="flex space-x-3">
                  <button
                    onClick={handleTestLiteLLM}
                    disabled={testingLiteLLM || !litellmBaseUrl.trim() || !litellmApiKey.trim()}
                    className={`${theme === 'dark' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-600 hover:bg-blue-700'} text-white px-4 py-2 rounded-lg transition-colors duration-200 flex items-center disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {testingLiteLLM ? (
                      <>
                        <TestTube className="w-4 h-4 mr-2 animate-pulse" />
                        Testing...
                      </>
                    ) : (
                      <>
                        <TestTube className="w-4 h-4 mr-2" />
                        Test Connection
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleSaveSettings}
                    disabled={savingSettings || !litellmBaseUrl.trim() || !litellmApiKey.trim() || !litellmModel.trim()}
                    className={`${theme === 'dark' ? 'btn-gradient' : 'bg-blue-600 hover:bg-blue-700'} text-white px-4 py-2 rounded-lg transition-colors duration-200 flex items-center disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {savingSettings ? (
                      <>
                        <Save className="w-4 h-4 mr-2 animate-pulse" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        Save LiteLLM Settings
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Email Test Section */}
          <div className={`mt-8 pt-8 border-t ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
            <div className="flex items-center space-x-3 mb-4">
              <Mail className={`w-6 h-6 ${theme === 'dark' ? 'text-gradient-primary' : 'text-gray-700'}`} />
              <h2 className={`text-xl font-semibold ${theme === 'dark' ? 'text-gradient-primary' : 'text-gray-900'}`}>
                Email Test
              </h2>
            </div>

            <div className="space-y-4">
              <div>
                <label htmlFor="testEmail" className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gradient-primary' : 'text-gray-700'}`}>
                  Test Email Address *
                </label>
                <div className="flex space-x-2">
                  <input
                    type="email"
                    id="testEmail"
                    value={testEmail}
                    onChange={(e) => {
                      setTestEmail(e.target.value)
                      setEmailTestResult(null)
                    }}
                    placeholder="your-email@example.com"
                    disabled={testingEmail}
                    className={`flex-1 ${inputBase} ${theme === 'dark' ? inputDark : inputLight} ${testingEmail ? 'opacity-50' : ''}`}
                  />
                  <button
                    onClick={handleTestEmail}
                    disabled={testingEmail || !testEmail.trim()}
                    className={`${theme === 'dark' ? 'btn-gradient' : 'bg-blue-600 hover:bg-blue-700'} text-white px-4 py-2 rounded-lg transition-colors duration-200 flex items-center disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {testingEmail ? (
                      <>
                        <TestTube className="w-4 h-4 mr-2 animate-pulse" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4 mr-2" />
                        Send Test Email
                      </>
                    )}
                  </button>
                </div>
              </div>

              {emailTestResult && (
                <div
                  className={`p-3 rounded-lg ${
                    emailTestResult.success
                      ? theme === 'dark'
                        ? 'bg-green-900/30 border border-green-700/50'
                        : 'bg-green-50 border border-green-200'
                      : theme === 'dark'
                        ? 'bg-red-900/30 border border-red-700/50'
                        : 'bg-red-50 border border-red-200'
                  }`}
                >
                  <p
                    className={`text-sm ${
                      emailTestResult.success
                        ? theme === 'dark'
                          ? 'text-green-400'
                          : 'text-green-800'
                        : theme === 'dark'
                          ? 'text-red-400'
                          : 'text-red-800'
                    }`}
                  >
                    {emailTestResult.success ? '✓ ' : '✗ '}
                    {emailTestResult.message}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className={`${theme === 'dark' ? 'gradient-card' : 'bg-white'} rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto`}>
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className={`text-xl font-semibold ${theme === 'dark' ? 'text-gradient-primary' : 'text-gray-900'}`}>
                {editingNode ? 'Edit Remote Node' : 'Add Remote Node'}
              </h2>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
              <div>
                <label htmlFor="name" className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gradient-primary' : 'text-gray-700'}`}>
                  Name *
                </label>
                <input
                  type="text"
                  id="name"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className={`${inputBase} ${theme === 'dark' ? inputDark : inputLight}`}
                  placeholder="e.g., Ubuntu Build Server 1"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="host" className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gradient-primary' : 'text-gray-700'}`}>
                    Host *
                  </label>
                  <input
                    type="text"
                    id="host"
                    required
                    value={formData.host}
                    onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                    className={`${inputBase} ${theme === 'dark' ? inputDark : inputLight}`}
                    placeholder="192.168.1.100 or hostname"
                  />
                </div>
                <div>
                  <label htmlFor="port" className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gradient-primary' : 'text-gray-700'}`}>
                    Port *
                  </label>
                  <input
                    type="number"
                    id="port"
                    required
                    min="1"
                    max="65535"
                    value={formData.port}
                    onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) || 22 })}
                    className={`${inputBase} ${theme === 'dark' ? inputDark : inputLight}`}
                    placeholder="22"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="username" className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gradient-primary' : 'text-gray-700'}`}>
                  Username *
                </label>
                <input
                  type="text"
                  id="username"
                  required
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className={`${inputBase} ${theme === 'dark' ? inputDark : inputLight}`}
                  placeholder="ubuntu"
                />
              </div>

              <div>
                <label htmlFor="workingHome" className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gradient-primary' : 'text-gray-700'}`}>
                  Working Home
                </label>
                <input
                  type="text"
                  id="workingHome"
                  value={formData.workingHome || ''}
                  onChange={(e) => setFormData({ ...formData, workingHome: e.target.value })}
                  className={`${inputBase} ${theme === 'dark' ? inputDark : inputLight}`}
                  placeholder="/home/username"
                />
              </div>

              <div>
                <label htmlFor="sshServiceApiUrl" className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gradient-primary' : 'text-gray-700'}`}>
                  SSH Service API URL
                </label>
                <input
                  type="url"
                  id="sshServiceApiUrl"
                  value={formData.sshServiceApiUrl || ''}
                  onChange={(e) => setFormData({ ...formData, sshServiceApiUrl: e.target.value })}
                  className={`${inputBase} ${theme === 'dark' ? inputDark : inputLight}`}
                  placeholder="https://your-ssh-service.com (optional)"
                />
              </div>

              <div>
                <label htmlFor="sshServiceApiKey" className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gradient-primary' : 'text-gray-700'}`}>
                  SSH Service API Key
                </label>
                <input
                  type="password"
                  id="sshServiceApiKey"
                  value={formData.sshServiceApiKey || ''}
                  onChange={(e) => setFormData({ ...formData, sshServiceApiKey: e.target.value })}
                  className={`${inputBase} ${theme === 'dark' ? inputDark : inputLight}`}
                  placeholder={editingNode ? 'Leave empty to keep current key' : 'Enter API key (optional)'}
                />
              </div>

              <div>
                <label htmlFor="authType" className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gradient-primary' : 'text-gray-700'}`}>
                  Authentication Type *
                </label>
                <select
                  id="authType"
                  required
                  value={formData.authType}
                  onChange={(e) => setFormData({ ...formData, authType: e.target.value as 'key' | 'password', sshKey: '', password: '' })}
                  className={`${inputBase} ${theme === 'dark' ? inputDark : inputLight}`}
                >
                  <option value="key">SSH Key</option>
                  <option value="password">Password</option>
                </select>
              </div>

              {formData.authType === 'key' ? (
                <div>
                  <label htmlFor="sshKey" className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gradient-primary' : 'text-gray-700'}`}>
                    SSH Private Key *
                  </label>
                  <textarea
                    id="sshKey"
                    required
                    rows={8}
                    value={formData.sshKey}
                    onChange={(e) => setFormData({ ...formData, sshKey: e.target.value })}
                    className={`${inputBase} ${theme === 'dark' ? inputDark : inputLight} font-mono text-xs`}
                    placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;...&#10;-----END OPENSSH PRIVATE KEY-----"
                  />
                  <p className={`mt-1 text-xs ${theme === 'dark' ? 'text-gradient-secondary' : 'text-gray-500'}`}>
                    Paste your private SSH key here. It will be stored securely.
                  </p>
                </div>
              ) : (
                <div>
                  <label htmlFor="password" className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gradient-primary' : 'text-gray-700'}`}>
                    Password *
                  </label>
                  <input
                    type="password"
                    id="password"
                    required={!editingNode}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className={`${inputBase} ${theme === 'dark' ? inputDark : inputLight}`}
                    placeholder={editingNode ? 'Leave empty to keep current password' : 'Enter password'}
                  />
                  {editingNode && (
                    <p className={`mt-1 text-xs ${theme === 'dark' ? 'text-gradient-secondary' : 'text-gray-500'}`}>
                      Leave empty to keep the current password.
                    </p>
                  )}
                </div>
              )}

              {testConfigResult && (
                <div
                  className={`p-3 rounded-lg ${
                    testConfigResult.success
                      ? theme === 'dark'
                        ? 'bg-green-900/30 border border-green-700/50'
                        : 'bg-green-50 border border-green-200'
                      : theme === 'dark'
                        ? 'bg-red-900/30 border border-red-700/50'
                        : 'bg-red-50 border border-red-200'
                  }`}
                >
                  <p
                    className={`text-sm ${
                      testConfigResult.success
                        ? theme === 'dark'
                          ? 'text-green-400'
                          : 'text-green-800'
                        : theme === 'dark'
                          ? 'text-red-400'
                          : 'text-red-800'
                    }`}
                  >
                    {testConfigResult.success ? '✓ ' : '✗ '}
                    {testConfigResult.message}
                  </p>
                </div>
              )}

              {error && (
                <div
                  className={`p-3 rounded-lg ${
                    theme === 'dark'
                      ? 'bg-red-900/30 border border-red-700/50'
                      : 'bg-red-50 border border-red-200'
                  }`}
                >
                  <p
                    className={`text-sm ${
                      theme === 'dark' ? 'text-red-400' : 'text-red-800'
                    }`}
                  >
                    ✗ {error}
                  </p>
                </div>
              )}

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false)
                    setEditingNode(null)
                    setError(null)
                    setTestConfigResult(null)
                  }}
                  className={`${theme === 'dark' ? 'bg-gray-600 hover:bg-gray-700' : 'bg-gray-200 hover:bg-gray-300'} text-gray-800 dark:text-white px-4 py-2 rounded-lg transition-colors duration-200`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={testingConfig}
                  onClick={handleTestNewNodeConnection}
                  className={`${theme === 'dark' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-600 hover:bg-blue-700'} text-white px-4 py-2 rounded-lg transition-colors duration-200 disabled:opacity-50`}
                >
                  {testingConfig ? 'Testing...' : 'Test Connection'}
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className={`${theme === 'dark' ? 'btn-gradient' : 'bg-blue-600 hover:bg-blue-700'} text-white px-4 py-2 rounded-lg transition-colors duration-200 disabled:opacity-50`}
                >
                  {isLoading ? 'Saving...' : editingNode ? 'Update' : 'Add'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Version and build time information - Bottom left */}
      <div className="fixed bottom-4 left-4 z-10">
        <div className={`text-xs space-y-1 ${
          theme === 'dark' ? 'text-gradient-secondary opacity-70' : 'text-gray-500'
        }`}>
          <div>Version: v{packageInfo.version}</div>
          <div>Commit: {import.meta.env.GIT_HASH}</div>
          <div>Build Time: {new Date(import.meta.env.BUILD_TIME).toLocaleString('en-US')}</div>
        </div>
      </div>
    </div>
  )
}

