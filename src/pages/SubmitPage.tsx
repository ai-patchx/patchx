import { useState } from 'react'
import { FileText, Settings, Send, Moon, Sun } from 'lucide-react'
import FileUpload from '../components/FileUpload'
import useFileUploadStore from '../stores/fileUploadStore'
import { useTheme } from '../hooks/useTheme'

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

  const [selectedProject, setSelectedProject] = useState('')
  const [selectedBranch, setSelectedBranch] = useState('main')
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleFileSelect = async (selectedFile: File) => {
    // 这里可以添加文件预览逻辑
    console.log('Selected file:', selectedFile)
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

    try {
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

      // 2. 提交patch
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

      await submitResponse.json()

      // 3. 跳转到状态页面
      window.location.href = `/status/${uploadId}`

    } catch (error) {
      console.error('提交失败:', error)
      setError(error instanceof Error ? error.message : '提交失败')
      setUploadStatus('error')
    } finally {
      setIsSubmitting(false)
    }
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

            {/* 提交按钮 */}
            <div className="flex justify-end">
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
          </form>
        </div>
      </div>
    </div>
  )
}

export default SubmitPage