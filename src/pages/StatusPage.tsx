import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { Clock, CheckCircle, XCircle, AlertCircle, ExternalLink, RefreshCw, Moon, Sun } from 'lucide-react'
import { getSubmissionStatus } from '../services/api'
import type { StatusResponse } from '../types'
import { useTheme } from '../hooks/useTheme'

const StatusPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const { theme, toggleTheme } = useTheme()
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)

  const fetchStatus = useCallback(async () => {
    if (!id) return

    try {
      setLoading(true)
      setError(null)
      const response = await getSubmissionStatus(id)

      if (response.success && response.data) {
        setStatus(response.data)

        // If status is completed or failed, stop auto refresh
        if (response.data.status === 'completed' || response.data.status === 'failed') {
          setAutoRefresh(false)
        }
      } else {
        setError(response.error || 'Failed to get status')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get status')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(() => {
      fetchStatus()
    }, 3000) // Refresh every 3 seconds

    return () => clearInterval(interval)
  }, [autoRefresh, fetchStatus])

  const getStatusIcon = () => {
    switch (status?.status) {
      case 'pending':
        return <Clock className="w-16 h-16 text-yellow-500 animate-pulse" />
      case 'processing':
        return <RefreshCw className="w-16 h-16 text-blue-500 animate-spin" />
      case 'completed':
        return <CheckCircle className="w-16 h-16 text-green-500" />
      case 'failed':
        return <XCircle className="w-16 h-16 text-red-500" />
      default:
        return <AlertCircle className="w-16 h-16 text-gray-500" />
    }
  }

  const getStatusText = () => {
    switch (status?.status) {
      case 'pending':
        return 'Pending'
      case 'processing':
        return 'Processing'
      case 'completed':
        return 'Submitted Successfully'
      case 'failed':
        return 'Submission Failed'
      default:
        return 'Unknown Status'
    }
  }

  const getStatusColor = () => {
    switch (status?.status) {
      case 'pending':
        return theme === 'dark'
          ? 'text-yellow-400 bg-yellow-900/20 border border-yellow-700/30'
          : 'text-yellow-600 bg-yellow-50'
      case 'processing':
        return theme === 'dark'
          ? 'text-blue-400 bg-blue-900/20 border border-blue-700/30'
          : 'text-blue-600 bg-blue-50'
      case 'completed':
        return theme === 'dark'
          ? 'text-green-400 bg-green-900/20 border border-green-700/30'
          : 'text-green-600 bg-green-50'
      case 'failed':
        return theme === 'dark'
          ? 'text-red-400 bg-red-900/20 border border-red-700/30'
          : 'text-red-600 bg-red-50'
      default:
        return theme === 'dark'
          ? 'text-gray-400 bg-gray-900/20 border border-gray-700/30'
          : 'text-gray-600 bg-gray-50'
    }
  }

  if (loading && !status) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className={`w-12 h-12 animate-spin mx-auto mb-4 ${
            theme === 'dark' ? 'text-blue-400' : 'text-blue-500'
          }`} />
          <p className={theme === 'dark' ? 'text-gradient-secondary' : 'text-gray-600'}>
            Loading status...
          </p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className={`rounded-lg shadow-lg p-8 max-w-md w-full mx-4 ${
          theme === 'dark' ? 'gradient-card' : 'bg-white'
        }`}>
          <div className="text-center">
            <XCircle className={`w-16 h-16 mx-auto mb-4 ${
              theme === 'dark' ? 'text-red-400' : 'text-red-500'
            }`} />
            <h2 className={`text-xl font-semibold mb-2 ${
              theme === 'dark' ? 'text-gradient-primary' : 'text-gray-900'
            }`}>Failed to Get Status</h2>
            <p className={`mb-4 ${
              theme === 'dark' ? 'text-gradient-secondary' : 'text-gray-600'
            }`}>{error}</p>
            <button
              onClick={fetchStatus}
              className={theme === 'dark'
                ? 'btn-gradient px-4 py-2 rounded-md'
                : 'px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700'
              }
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* Theme toggle button */}
        <div className="flex justify-end mb-4">
          <button
            onClick={toggleTheme}
            className={`p-2 rounded-lg transition-colors duration-200 ${
              theme === 'dark'
                ? 'bg-gradient-accent text-gradient-primary hover:bg-gradient-highlight'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </div>

        <div className={`rounded-lg shadow-lg p-8 ${
          theme === 'dark' ? 'gradient-card' : 'bg-white'
        }`}>
          <div className="text-center mb-8">
            <h1 className={`text-3xl font-bold mb-4 ${
              theme === 'dark' ? 'text-gradient-primary' : 'text-gray-900'
            }`}>Submission Status</h1>

            <div className="flex justify-center mb-6">
              {getStatusIcon()}
            </div>

            <div className={`inline-flex items-center px-4 py-2 rounded-full ${getStatusColor()}`}>
              <span className="text-lg font-medium">{getStatusText()}</span>
            </div>
          </div>

          {/* Status Details */}
          <div className={`rounded-lg p-6 mb-6 ${
            theme === 'dark'
              ? 'bg-gradient-start/50 border border-gradient-accent/30'
              : 'bg-gray-50'
          }`}>
            <h3 className={`text-lg font-semibold mb-4 ${
              theme === 'dark' ? 'text-gradient-primary' : 'text-gray-900'
            }`}>Details</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className={theme === 'dark' ? 'text-gradient-secondary' : 'text-gray-600'}>
                  Submission ID:
                </span>
                <span className={`font-mono text-sm ${
                  theme === 'dark' ? 'text-gradient-primary' : 'text-gray-900'
                }`}>{id}</span>
              </div>
              <div className="flex justify-between">
                <span className={theme === 'dark' ? 'text-gradient-secondary' : 'text-gray-600'}>
                  Status:
                </span>
                <span className={`font-medium ${getStatusColor().split(' ')[0]}`}>
                  {getStatusText()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className={theme === 'dark' ? 'text-gradient-secondary' : 'text-gray-600'}>
                  Created At:
                </span>
                <span className={`text-sm ${
                  theme === 'dark' ? 'text-gradient-primary' : 'text-gray-900'
                }`}>
                  {status?.createdAt ? new Date(status.createdAt).toLocaleString() : '-'}
                </span>
              </div>

              {status?.changeId && (
                <div className="flex justify-between">
                  <span className={theme === 'dark' ? 'text-gradient-secondary' : 'text-gray-600'}>
                    Change ID:
                  </span>
                  <span className={`font-mono text-sm ${
                    theme === 'dark' ? 'text-gradient-primary' : 'text-gray-900'
                  }`}>{status.changeId}</span>
                </div>
              )}
            </div>
          </div>

          {/* Gerrit Link */}
          {status?.changeUrl && (
            <div className={`border rounded-lg p-6 mb-6 ${
              theme === 'dark'
                ? 'bg-green-900/20 border-green-700/30'
                : 'bg-green-50 border-green-200'
            }`}>
              <h3 className={`text-lg font-semibold mb-4 ${
                theme === 'dark' ? 'text-green-400' : 'text-green-900'
              }`}>Gerrit Change</h3>
              <div className="flex items-center justify-between">
                <div>
                  <p className={`mb-2 ${
                    theme === 'dark' ? 'text-green-300' : 'text-green-700'
                  }`}>Your patch has been successfully submitted to AOSP Gerrit</p>
                  <p className={`text-sm ${
                    theme === 'dark' ? 'text-green-400' : 'text-green-600'
                  }`}>Click the link to view details and track review progress</p>
                </div>
                <a
                  href={status.changeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={theme === 'dark'
                    ? 'btn-gradient inline-flex items-center px-4 py-2 rounded-md'
                    : 'inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700'
                  }
                >
                  <span>View Change</span>
                  <ExternalLink className="w-4 h-4 ml-2" />
                </a>
              </div>
            </div>
          )}

          {/* Error Message */}
          {status?.error && (
            <div className={`border rounded-lg p-6 mb-6 ${
              theme === 'dark'
                ? 'bg-red-900/20 border-red-700/30'
                : 'bg-red-50 border-red-200'
            }`}>
              <h3 className={`text-lg font-semibold mb-4 ${
                theme === 'dark' ? 'text-red-400' : 'text-red-900'
              }`}>Error Message</h3>
              <p className={theme === 'dark' ? 'text-red-300' : 'text-red-700'}>
                {status.error}
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-center space-x-4">
            <button
              onClick={fetchStatus}
              disabled={loading}
              className={`
                inline-flex items-center px-4 py-2 rounded-md disabled:opacity-50
                ${theme === 'dark'
                  ? 'btn-gradient'
                  : 'bg-gray-600 text-white hover:bg-gray-700'
                }
              `}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh Status</span>
            </button>

            <a
              href="/"
              className={`
                inline-flex items-center px-4 py-2 rounded-md
                ${theme === 'dark'
                  ? 'btn-gradient'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
                }
              `}
            >
              Back to Home
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

export default StatusPage