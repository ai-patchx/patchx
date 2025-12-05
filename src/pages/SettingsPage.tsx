import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Settings, Plus, Edit, Trash2, TestTube, Moon, Sun, ArrowLeft, Server, Key, Lock, Globe, Mail, Send } from 'lucide-react'
import useRemoteNodeStore from '@/stores/remoteNodeStore'
import { useTheme } from '@/hooks/useTheme'
import type { RemoteNode, RemoteNodeFormData } from '@/types'
import packageInfo from '../../package.json'

export default function SettingsPage() {
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const { nodes, isLoading, error, fetchNodes, addNode, updateNode, deleteNode, testConnection, setError } = useRemoteNodeStore()
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingNode, setEditingNode] = useState<RemoteNode | null>(null)
  const [formData, setFormData] = useState<RemoteNodeFormData>({
    name: '',
    host: '',
    port: 22,
    username: '',
    authType: 'key',
    sshKey: '',
    password: ''
  })
  const [testingNodeId, setTestingNodeId] = useState<string | null>(null)
  const [testEmail, setTestEmail] = useState('')
  const [testingEmail, setTestingEmail] = useState(false)
  const [emailTestResult, setEmailTestResult] = useState<{ success: boolean; message: string } | null>(null)

  useEffect(() => {
    fetchNodes()
  }, [fetchNodes])

  const handleAddNode = () => {
    setEditingNode(null)
    setFormData({
      name: '',
      host: '',
      port: 22,
      username: '',
      authType: 'key',
      sshKey: '',
      password: ''
    })
    setShowAddModal(true)
    setError(null)
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
      password: '' // Don't show password, user needs to re-enter
    })
    setShowAddModal(true)
    setError(null)
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
      setShowAddModal(false)
      setEditingNode(null)
      setFormData({
        name: '',
        host: '',
        port: 22,
        username: '',
        authType: 'key',
        sshKey: '',
        password: ''
      })
    } catch (err) {
      // Error is handled by store
    }
  }

  const inputBase = 'block w-full pl-10 pr-3 py-2 rounded-md leading-5 placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500'
  const inputLight = 'bg-white border border-gray-300 focus:border-blue-500'
  const inputDark = 'input-gradient border focus:border-blue-500'

  return (
    <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8">
      <div className={`${theme === 'dark' ? 'gradient-card' : 'bg-white'} max-w-4xl mx-auto rounded-lg shadow-lg overflow-hidden`}>
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

          {/* Email Test Section */}
          <div className={`mt-8 pt-8 border-t ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
            <div className="flex items-center space-x-3 mb-4">
              <Mail className={`w-6 h-6 ${theme === 'dark' ? 'text-gradient-primary' : 'text-gray-700'}`} />
              <h2 className={`text-xl font-semibold ${theme === 'dark' ? 'text-gradient-primary' : 'text-gray-900'}`}>
                Email Configuration Test
              </h2>
            </div>
            <p className={`text-sm mb-4 ${theme === 'dark' ? 'text-gradient-secondary' : 'text-gray-600'}`}>
              Test your email configuration by sending a test email. The test will use Resend (if configured) or fall back to MailChannels API.
            </p>

            <div className={`${theme === 'dark' ? 'bg-gradient-dark-subtle border border-gray-700/40' : 'bg-gray-50 border border-gray-200'} rounded-lg p-4 mb-4`}>
              <div className={`space-y-2 text-sm ${theme === 'dark' ? 'text-gradient-secondary' : 'text-gray-600'}`}>
                <div className="flex items-center space-x-2">
                  <span className="font-semibold">Resend Configuration (Recommended):</span>
                </div>
                <div className="pl-4 space-y-1">
                  <div>• RESEND_API_KEY: Set in wrangler.toml (free tier: 3,000 emails/month)</div>
                  <div>• RESEND_FROM_EMAIL: Set in wrangler.toml</div>
                  <div>• RESEND_FROM_NAME: Set in wrangler.toml</div>
                  <div>• RESEND_REPLY_TO_EMAIL: Set in wrangler.toml (optional)</div>
                </div>
                <div className={`mt-3 pt-3 border-t ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
                  <div className="flex items-center space-x-2">
                    <span className="font-semibold">MailChannels Configuration (Fallback):</span>
                  </div>
                  <div className="pl-4 space-y-1 mt-1">
                    <div>• MAILCHANNELS_FROM_EMAIL: Set in wrangler.toml</div>
                    <div>• MAILCHANNELS_FROM_NAME: Set in wrangler.toml</div>
                    <div>• MAILCHANNELS_API_ENDPOINT: Set in wrangler.toml (optional)</div>
                    <div>• MAILCHANNELS_API_KEY: Set in wrangler.toml (required for paid plans)</div>
                  </div>
                </div>
              </div>
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

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false)
                    setEditingNode(null)
                    setError(null)
                  }}
                  className={`${theme === 'dark' ? 'bg-gray-600 hover:bg-gray-700' : 'bg-gray-200 hover:bg-gray-300'} text-gray-800 dark:text-white px-4 py-2 rounded-lg transition-colors duration-200`}
                >
                  Cancel
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

