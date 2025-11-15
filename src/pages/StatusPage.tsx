import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { Clock, CheckCircle, XCircle, AlertCircle, ExternalLink, RefreshCw } from 'lucide-react'
import { getSubmissionStatus } from '../services/api'
import type { StatusResponse } from '../types'

const StatusPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
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

        // 如果状态是已完成或失败，停止自动刷新
        if (response.data.status === 'completed' || response.data.status === 'failed') {
          setAutoRefresh(false)
        }
      } else {
        setError(response.error || '获取状态失败')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取状态失败')
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
    }, 3000) // 每3秒刷新一次

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
        return '等待处理'
      case 'processing':
        return '正在处理'
      case 'completed':
        return '提交成功'
      case 'failed':
        return '提交失败'
      default:
        return '未知状态'
    }
  }

  const getStatusColor = () => {
    switch (status?.status) {
      case 'pending':
        return 'text-yellow-600 bg-yellow-50'
      case 'processing':
        return 'text-blue-600 bg-blue-50'
      case 'completed':
        return 'text-green-600 bg-green-50'
      case 'failed':
        return 'text-red-600 bg-red-50'
      default:
        return 'text-gray-600 bg-gray-50'
    }
  }

  if (loading && !status) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">正在加载状态...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full mx-4">
          <div className="text-center">
            <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">获取状态失败</h2>
            <p className="text-gray-600 mb-4">{error}</p>
            <button
              onClick={fetchStatus}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              重试
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-4">提交状态</h1>

            <div className="flex justify-center mb-6">
              {getStatusIcon()}
            </div>

            <div className={`inline-flex items-center px-4 py-2 rounded-full ${getStatusColor()}`}>
              <span className="text-lg font-medium">{getStatusText()}</span>
            </div>
          </div>

          {/* 状态详情 */}
          <div className="bg-gray-50 rounded-lg p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">详细信息</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">提交ID:</span>
                <span className="font-mono text-sm">{id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">状态:</span>
                <span className={`font-medium ${getStatusColor().split(' ')[0]}`}>
                  {getStatusText()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">创建时间:</span>
                <span className="text-sm">
                  {status?.createdAt ? new Date(status.createdAt).toLocaleString() : '-'}
                </span>
              </div>

              {status?.changeId && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Change ID:</span>
                  <span className="font-mono text-sm">{status.changeId}</span>
                </div>
              )}
            </div>
          </div>

          {/* Gerrit链接 */}
          {status?.changeUrl && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-6">
              <h3 className="text-lg font-semibold text-green-900 mb-4">Gerrit Change</h3>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-green-700 mb-2">您的patch已成功提交到AOSP Gerrit</p>
                  <p className="text-sm text-green-600">点击链接查看详细信息并跟踪审核进度</p>
                </div>
                <a
                  href={status.changeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                >
                  <span>查看Change</span>
                  <ExternalLink className="w-4 h-4 ml-2" />
                </a>
              </div>
            </div>
          )}

          {/* 错误信息 */}
          {status?.error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-6">
              <h3 className="text-lg font-semibold text-red-900 mb-4">错误信息</h3>
              <p className="text-red-700">{status.error}</p>
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex justify-center space-x-4">
            <button
              onClick={fetchStatus}
              disabled={loading}
              className="inline-flex items-center px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              <span>刷新状态</span>
            </button>

            <a
              href="/"
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              返回首页
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

export default StatusPage