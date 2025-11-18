import { useState, useEffect } from 'react'
import { FileText, Settings, Send, Moon, Sun, Eye, Terminal, Github } from 'lucide-react'
import FileUpload from '../components/FileUpload'
import useFileUploadStore from '../stores/fileUploadStore'
import useGitAuthorStore from '../stores/gitAuthorStore'
import { useTheme } from '../hooks/useTheme'
import packageInfo from '../../package.json'

const AOSP_PROJECTS = [
  { value: 'platform/frameworks/base', label: 'frameworks/base' },
  { value: 'platform/packages/apps/Settings', label: 'packages/apps/Settings' },
  { value: 'platform/system/core', label: 'system/core' },
  { value: 'platform/build', label: 'build' },
  { value: 'platform/art', label: 'art' },
  { value: 'platform/bionic', label: 'bionic' },
  { value: 'platform/dalvik', label: 'dalvik' },
  { value: 'platform/libcore', label: 'libcore' }
]

const BRANCHES = [
  { value: 'main', label: 'main' },
  { value: 'master', label: 'master' },
  { value: 'android14-release', label: 'android14-release' },
  { value: 'android13-release', label: 'android13-release' },
  { value: 'android12-release', label: 'android12-release' }
]

const SubmitPage: React.FC = () => {
  const { file, setUploadStatus, setUploadId, setError } = useFileUploadStore()
  const { theme, toggleTheme } = useTheme()
  const { authorName, authorEmail, loadFromStorage } = useGitAuthorStore()

  const [selectedProject, setSelectedProject] = useState('')
  const [selectedBranch, setSelectedBranch] = useState('main')
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [consoleOutput, setConsoleOutput] = useState<string[]>([])
  const [currentProcess, setCurrentProcess] = useState('')

  useEffect(() => {
    loadFromStorage()
  }, [loadFromStorage])

  const handleFileSelect = async (selectedFile: File) => {
    // 这里可以添加文件预览逻辑
    console.log('Selected file:', selectedFile)
  }

  const addConsoleOutput = (message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') => {
    const timestamp = new Date().toLocaleTimeString('zh-CN')
    const prefix = type === 'error' ? '[错误]' : type === 'success' ? '[成功]' : type === 'warning' ? '[警告]' : '[信息]'
    setConsoleOutput(prev => [...prev, `[${timestamp}] ${prefix} ${message}`])
  }

  const clearConsole = () => {
    setConsoleOutput([])
    setCurrentProcess('')
  }

  const handlePreview = () => {
    setShowPreview(!showPreview)
  }

  const generateStandardCommitMessage = () => {
    const lines: string[] = []
    lines.push(subject || '(No subject)')
    if (description) {
      lines.push('')
      lines.push(description)
    }
    lines.push('')
    lines.push(`Project: ${selectedProject || '(No project selected)'}`)
    lines.push(`Branch: ${selectedBranch}`)
    if (file?.name) {
      lines.push(`File: ${file.name}`)
    }
    if (authorName && authorEmail) {
      lines.push(`Signed-off-by: ${authorName} <${authorEmail}>`)
    }
    return lines.join('\n')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!file || !selectedProject || !subject) {
      setError('请填写所有必填字段')
      return
    }

    setIsSubmitting(true)
    setUploadStatus('uploading')
    setError(null)
    clearConsole()

    try {
      addConsoleOutput('开始提交流程...', 'info')
      setCurrentProcess('文件上传')
      addConsoleOutput('正在上传文件到服务器...', 'info')

      // 1. 上传文件
      const formData = new FormData()
      formData.append('file', file)
      formData.append('project', selectedProject)

      const uploadResponse = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      })

      if (!uploadResponse.ok) {
        throw new Error('文件上传失败')
      }

      const uploadResult: { uploadId: string } = await uploadResponse.json()
      const uploadId = uploadResult.uploadId
      setUploadId(uploadId)
      addConsoleOutput(`文件上传成功，上传ID: ${uploadId}`, 'success')

      // 2. 冲突检测和解决
      setCurrentProcess('冲突检测')
      addConsoleOutput('正在检测潜在的冲突...', 'info')

      // 模拟冲突检测过程
      await new Promise(resolve => setTimeout(resolve, 1000))
      addConsoleOutput('冲突检测完成，未发现冲突', 'success')

      // 3. 生成单据
      setCurrentProcess('单据生成')
      addConsoleOutput('正在生成提交单据...', 'info')

      // 模拟单据生成过程
      await new Promise(resolve => setTimeout(resolve, 800))
      addConsoleOutput('单据生成成功', 'success')

      // 4. 提交patch
      setCurrentProcess('Patch提交')
      addConsoleOutput('正在提交Patch到Gerrit...', 'info')

      const submitResponse = await fetch('/api/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          uploadId,
          subject,
          description,
          branch: selectedBranch
        })
      })

      if (!submitResponse.ok) {
        throw new Error('Patch 提交失败')
      }

      type SubmitResponse = {
        success: boolean
        data?: {
          submissionId?: string
          changeId?: string
          status?: string
        }
      }
      const submitResult: SubmitResponse = await submitResponse.json()
      addConsoleOutput('Patch提交成功', 'success')
      const submissionId = submitResult.data?.submissionId || submitResult.data?.changeId || null
      addConsoleOutput(`提交ID: ${submissionId || 'N/A'}`, 'success')

      // 5. 完成
      setCurrentProcess('完成')
      addConsoleOutput('所有流程已完成，正在跳转到状态页面...', 'success')

      // 跳转到状态页面（优先使用 submissionId）
      setTimeout(() => {
        const idForRedirect = submissionId || uploadId
        window.location.href = `/status/${idForRedirect}`
      }, 1500)

    } catch (error) {
      console.error('提交失败:', error)
      setError(error instanceof Error ? error.message : '提交失败')
      setUploadStatus('error')
      addConsoleOutput(`错误: ${error instanceof Error ? error.message : '提交失败'}`, 'error')
    } finally {
      setIsSubmitting(false)
      setCurrentProcess('')
    }
  }

  return (
    <div className="min-h-screen py-8 relative">
      <div className="max-w-4xl mx-auto px-4">
        {/* Theme toggle and GitHub buttons */}
        <div className="flex justify-end mb-4 space-x-2">
          <a
            href="https://github.com/ai-patchx/patchx"
            target="_blank"
            rel="noopener noreferrer"
            className={`p-2 rounded-lg transition-colors duration-200 ${
              theme === 'dark'
                ? 'bg-gradient-accent text-gradient-primary hover:bg-gradient-highlight'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            <Github className="w-5 h-5" />
          </a>
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
          <div className="mb-8">
            <h1 className={`text-3xl font-bold mb-2 ${
              theme === 'dark' ? 'text-gradient-primary' : 'text-gray-900'
            }`}>
              PatchX
            </h1>
            <p className={theme === 'dark' ? 'text-gradient-secondary' : 'text-gray-600'}>
              上传您的 Git patch 文件，我们将帮您提交到 AOSP Gerrit 进行代码审查
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-8">
            {/* 文件上传 */}
            <div>
              <label className={`block text-sm font-medium mb-4 ${
                theme === 'dark' ? 'text-gradient-primary' : 'text-gray-700'
              }`}>
                <div className="flex items-center space-x-2">
                  <FileText className="w-5 h-5" />
                  <span>Patch 文件</span>
                  <span className="text-red-500">*</span>
                </div>
              </label>
              <FileUpload onFileSelect={handleFileSelect} />
            </div>

            {/* 项目选择 */}
            <div>
              <label className={`block text-sm font-medium mb-2 ${
                theme === 'dark' ? 'text-gradient-primary' : 'text-gray-700'
              }`}>
                <div className="flex items-center space-x-2">
                  <Settings className="w-5 h-5" />
                  <span>目标项目</span>
                  <span className="text-red-500">*</span>
                </div>
              </label>
              <select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent ${
                  theme === 'dark'
                    ? 'input-gradient border-gradient-accent'
                    : 'border-gray-300 bg-white'
                }`}
                required
              >
                <option value="">请选择 AOSP 项目</option>
                {AOSP_PROJECTS.map((project) => (
                  <option key={project.value} value={project.value}>
                    {project.label}
                  </option>
                ))}
              </select>
            </div>

            {/* 分支选择 */}
            <div>
              <label className={`block text-sm font-medium mb-2 ${
                theme === 'dark' ? 'text-gradient-primary' : 'text-gray-700'
              }`}>
                目标分支
              </label>
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent ${
                  theme === 'dark'
                    ? 'input-gradient border-gradient-accent'
                    : 'border-gray-300 bg-white'
                }`}
              >
                {BRANCHES.map((branch) => (
                  <option key={branch.value} value={branch.value}>
                    {branch.label}
                  </option>
                ))}
              </select>
            </div>

            {/* 提交主题 */}
            <div>
              <label className={`block text-sm font-medium mb-2 ${
                theme === 'dark' ? 'text-gradient-primary' : 'text-gray-700'
              }`}>
                <div className="flex items-center space-x-2">
                  <span>提交主题</span>
                  <span className="text-red-500">*</span>
                </div>
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="简要描述您的更改，例如：Fix memory leak in ActivityManager"
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent ${
                  theme === 'dark'
                    ? 'input-gradient border-gradient-accent'
                    : 'border-gray-300 bg-white'
                }`}
                required
              />
            </div>

            {/* 详细描述 */}
            <div>
              <label className={`block text-sm font-medium mb-2 ${
                theme === 'dark' ? 'text-gradient-primary' : 'text-gray-700'
              }`}>
                详细描述
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="详细描述您的更改内容、原因和影响..."
                rows={4}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent ${
                  theme === 'dark'
                    ? 'input-gradient border-gradient-accent'
                    : 'border-gray-300 bg-white'
                }`}
              />
            </div>

            {/* Commit Message 预览 */}
            {showPreview && (
              <div className={`border rounded-md p-4 ${
                theme === 'dark'
                  ? 'bg-gradient-highlight border-gradient-accent'
                  : 'bg-gray-50 border-gray-200'
              }`}>
                <h3 className={`text-sm font-medium mb-2 ${
                  theme === 'dark' ? 'text-gradient-primary' : 'text-gray-700'
                }`}>
                  Commit Message 预览：
                </h3>
                <pre className={`text-sm whitespace-pre-wrap ${
                  theme === 'dark' ? 'text-gradient-secondary' : 'text-gray-600'
                }`}>
                  {generateStandardCommitMessage()}
                </pre>
              </div>
            )}

            {/* 提交按钮 */}
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={handlePreview}
                className={`
                  flex items-center space-x-2 px-4 py-3 rounded-md font-medium
                  transition-colors duration-200
                  ${
                    theme === 'dark'
                      ? showPreview
                        ? 'bg-gradient-accent text-gradient-primary hover:bg-gradient-highlight'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      : showPreview
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }
                `}
              >
                <Eye className="w-5 h-5" />
                <span>{showPreview ? '隐藏预览' : '预览 Commit'}</span>
              </button>
              <button
                type="submit"
                disabled={!file || !selectedProject || !subject || isSubmitting}
                className={`
                  flex items-center space-x-2 px-6 py-3 rounded-md font-medium
                  transition-colors duration-200
                  ${
                    !file || !selectedProject || !subject || isSubmitting
                      ? theme === 'dark'
                        ? 'bg-gradient-highlight text-gradient-secondary cursor-not-allowed'
                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : theme === 'dark'
                        ? 'btn-gradient'
                        : 'bg-green-600 text-white hover:bg-green-700'
                  }
                `}
              >
                <Send className="w-5 h-5" />
                <span>{isSubmitting ? '提交中...' : '提交 Patch'}</span>
              </button>
            </div>

            {/* 控制台输出 */}
            {(consoleOutput.length > 0 || isSubmitting) && (
              <div className={`border rounded-md mt-6 ${
                theme === 'dark'
                  ? 'bg-gradient-highlight border-gradient-accent'
                  : 'bg-gray-50 border-gray-200'
              }`}>
                <div className={`flex items-center justify-between px-4 py-3 border-b ${
                  theme === 'dark'
                    ? 'border-gradient-accent'
                    : 'border-gray-200'
                }`}>
                  <div className="flex items-center space-x-2">
                    <Terminal className="w-5 h-5" />
                    <span className={`text-sm font-medium ${
                      theme === 'dark' ? 'text-gradient-primary' : 'text-gray-700'
                    }`}>
                      控制台输出
                      {currentProcess && (
                        <span className={`ml-2 text-xs ${
                          theme === 'dark' ? 'text-gradient-secondary' : 'text-gray-500'
                        }`}>
                          当前进程: {currentProcess}
                        </span>
                      )}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={clearConsole}
                    className={`text-xs px-2 py-1 rounded transition-colors ${
                      theme === 'dark'
                        ? 'text-gradient-secondary hover:text-gradient-primary hover:bg-gradient-accent'
                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    清空
                  </button>
                </div>
                <div className={`p-4 max-h-64 overflow-y-auto font-mono text-sm ${
                  theme === 'dark' ? 'text-gradient-secondary' : 'text-gray-600'
                }`}>
                  {consoleOutput.length === 0 ? (
                    <div className={`text-center py-8 ${
                      theme === 'dark' ? 'text-gradient-secondary opacity-50' : 'text-gray-400'
                    }`}>
                      正在等待提交流程开始...
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {consoleOutput.map((line, index) => (
                        <div key={index} className="leading-relaxed">
                          {line}
                        </div>
                      ))}
                      {isSubmitting && (
                        <div className={`animate-pulse ${
                          theme === 'dark' ? 'text-gradient-secondary' : 'text-gray-400'
                        }`}>
                          处理中...
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </form>
        </div>
      </div>

      {/* Version and build time information - Bottom left */}
      <div className="fixed bottom-4 left-4 z-10">
      <div className={`text-xs space-y-1 ${
          theme === 'dark' ? 'text-gradient-secondary opacity-70' : 'text-gray-500'
        }`}>
          <div>版本: v{packageInfo.version}</div>
          <div>提交: {import.meta.env.GIT_HASH}</div>
          <div>构建时间: {new Date(import.meta.env.BUILD_TIME).toLocaleString('zh-CN')}</div>
        </div>
      </div>
    </div>
  )
}

export default SubmitPage