import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Settings, Send, Moon, Sun, Eye, Terminal, Github, Code, RefreshCw, Folder, GitBranch, MessageSquare, AlignLeft, User, Mail, Bell, Server } from 'lucide-react'
import FileUpload from '../components/FileUpload'
import SearchableSelect from '../components/SearchableSelect'
import useFileUploadStore from '../stores/fileUploadStore'
import useGitAuthorStore from '../stores/gitAuthorStore'
import useProjectCacheStore from '../stores/projectCacheStore'
import useRemoteNodeStore from '../stores/remoteNodeStore'
import { useTheme } from '../hooks/useTheme'
import { useAuthStore } from '../stores/authStore'
import UserInfo from '../components/UserInfo'
import packageInfo from '../../package.json'

// Projects and branches will be fetched from Gerrit API

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i

const splitEmails = (value: string): string[] => {
  return value
    .split(/[,\n;]/)
    .map(part => part.trim())
    .filter(Boolean)
}

const SubmitPage: React.FC = () => {
  const navigate = useNavigate()
  const { file, setUploadStatus, setUploadId, setError } = useFileUploadStore()
  const { theme, toggleTheme } = useTheme()
  const { isAdmin } = useAuthStore()
  const { authorName, authorEmail, setAuthorName, setAuthorEmail, loadFromStorage } = useGitAuthorStore()
  const {
    getCachedProjects,
    setCachedProjects,
    getCachedBranches,
    setCachedBranches,
    clearBranchesCache,
    loadFromStorage: loadCacheFromStorage
  } = useProjectCacheStore()
  const { nodes, fetchNodes } = useRemoteNodeStore()

  const [selectedProject, setSelectedProject] = useState('')
  const [selectedBranch, setSelectedBranch] = useState('main')
  const [selectedRemoteNode, setSelectedRemoteNode] = useState('')
  const [projects, setProjects] = useState<Array<{ id: string; name: string; description?: string }>>([])
  const [isLoadingProjects, setIsLoadingProjects] = useState(false)
  const [branches, setBranches] = useState<Array<{ ref: string; revision: string; name: string }>>([])
  const [isLoadingBranches, setIsLoadingBranches] = useState(false)
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [consoleOutput, setConsoleOutput] = useState<string[]>([])
  const [currentProcess, setCurrentProcess] = useState('')
  const [notificationReceiversInput, setNotificationReceiversInput] = useState('')
  const [emailValidationError, setEmailValidationError] = useState<string | null>(null)

  useEffect(() => {
    loadFromStorage()
    loadCacheFromStorage()

    // Try to load projects from cache first
    const cachedProjects = getCachedProjects()
    if (cachedProjects) {
      setProjects(cachedProjects)
    }

    fetchProjects()
    fetchNodes()
  }, [loadFromStorage, loadCacheFromStorage, getCachedProjects, fetchNodes])

  useEffect(() => {
    if (selectedProject) {
      // Try to load branches from cache first
      const cachedBranches = getCachedBranches(selectedProject)
      if (cachedBranches) {
        setBranches(cachedBranches)
        // Auto-select the first branch if available
        if (cachedBranches.length > 0) {
          setSelectedBranch(cachedBranches[0].name)
        }
        // Still fetch in background to refresh cache if needed, but don't show loading
        fetchBranches(selectedProject)
      } else {
        // No cache, fetch from API
        fetchBranches(selectedProject)
      }
    } else {
      // Reset branches when no project is selected
      setBranches([])
      setSelectedBranch('main')
    }
  }, [selectedProject, getCachedBranches])

  useEffect(() => {
    if (authorEmail && !notificationReceiversInput) {
      setNotificationReceiversInput(authorEmail)
    }
  }, [authorEmail, notificationReceiversInput])

  const fetchProjects = async (forceRefresh: boolean = false) => {
    // Check cache first unless forcing refresh
    if (!forceRefresh) {
      const cachedProjects = getCachedProjects()
      if (cachedProjects) {
        setProjects(cachedProjects)
        setIsLoadingProjects(false)
        return
      }
    }

    setIsLoadingProjects(true)
    try {
      const response = await fetch('/api/projects?description=true')

      // Check if response is JSON before parsing
      const contentType = response.headers.get('content-type') || ''
      const isJson = contentType.includes('application/json')

      type ProjectsResponse = {
        success: boolean
        data?: Array<{ id: string; name: string; description?: string }>
        error?: string
      }

      let result: ProjectsResponse

      if (isJson) {
        result = await response.json()
      } else {
        const text = await response.text()
        throw new Error(`Server returned non-JSON response. Content-Type: ${contentType}. Response: ${text.substring(0, 200)}`)
      }

      if (!response.ok) {
        // If response is not OK, use the error from JSON if available
        throw new Error(result.error || `Failed to fetch projects: ${response.status} ${response.statusText}`)
      }

      if (result.success && result.data) {
        setProjects(result.data)
        // Cache the projects
        setCachedProjects(result.data)
      } else if (result.error) {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('Error fetching projects:', error)
      let errorMessage = 'Failed to load projects from Gerrit'
      if (error instanceof Error) {
        errorMessage = error.message
        // Provide more helpful error messages
        if (errorMessage.includes('all option is disabled')) {
          errorMessage = 'Gerrit API: "all" option is disabled. Loading visible projects only.'
        } else if (errorMessage.includes('401') || errorMessage.includes('403')) {
          errorMessage = 'Authentication failed. Please check GERRIT_USERNAME and GERRIT_PASSWORD configuration.'
        } else if (errorMessage.includes('404')) {
          errorMessage = 'Gerrit API endpoint not found. Please check GERRIT_BASE_URL configuration.'
        }
      }
      addConsoleOutput(`Failed to load projects: ${errorMessage}`, 'warning')
      // Fallback to empty array - user can still manually type project name
      setProjects([])
    } finally {
      setIsLoadingProjects(false)
    }
  }

  const fetchBranches = async (projectName: string, forceRefresh: boolean = false) => {
    // Check cache first unless forcing refresh
    if (!forceRefresh) {
      const cachedBranches = getCachedBranches(projectName)
      if (cachedBranches) {
        setBranches(cachedBranches)
        // Auto-select the first branch (usually main or master)
        if (cachedBranches.length > 0) {
          setSelectedBranch(cachedBranches[0].name)
        }
        setIsLoadingBranches(false)
        return
      }
    }

    setIsLoadingBranches(true)
    try {
      // URL encode the project name for the API call
      const encodedProjectName = encodeURIComponent(projectName)
      const response = await fetch(`/api/projects/${encodedProjectName}/branches`)

      // Check if response is JSON before parsing
      const contentType = response.headers.get('content-type') || ''
      const isJson = contentType.includes('application/json')

      type BranchesResponse = {
        success: boolean
        data?: Array<{ ref: string; revision: string; name: string }>
        error?: string
      }

      let result: BranchesResponse

      if (isJson) {
        result = await response.json()
      } else {
        const text = await response.text()
        throw new Error(`Server returned non-JSON response. Content-Type: ${contentType}. Response: ${text.substring(0, 200)}`)
      }

      if (!response.ok) {
        // If response is not OK, use the error from JSON if available
        throw new Error(result.error || `Failed to fetch branches: ${response.status} ${response.statusText}`)
      }

      if (result.success && result.data) {
        setBranches(result.data)
        // Cache the branches
        setCachedBranches(projectName, result.data)
        // Auto-select the first branch (usually main or master)
        if (result.data.length > 0) {
          setSelectedBranch(result.data[0].name)
        }
      } else if (result.error) {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('Error fetching branches:', error)
      let errorMessage = 'Failed to load branches from Gerrit'
      if (error instanceof Error) {
        errorMessage = error.message
        // Provide more helpful error messages
        if (errorMessage.includes('401') || errorMessage.includes('403')) {
          errorMessage = 'Authentication failed. Please check GERRIT_USERNAME and GERRIT_PASSWORD configuration.'
        } else if (errorMessage.includes('404')) {
          errorMessage = 'Project or branches not found. Please check the project name.'
        }
      }
      addConsoleOutput(`Failed to load branches: ${errorMessage}`, 'warning')
      // Fallback to default branches
      setBranches([])
    } finally {
      setIsLoadingBranches(false)
    }
  }

  const handleFileSelect = async (selectedFile: File) => {
    // File preview logic can be added here
    console.log('Selected file:', selectedFile)
  }

  const addConsoleOutput = (message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') => {
    const timestamp = new Date().toLocaleTimeString('en-US')
    const prefix = type === 'error' ? '[Error]' : type === 'success' ? '[Success]' : type === 'warning' ? '[Warning]' : '[Info]'
    setConsoleOutput(prev => [...prev, `[${timestamp}] ${prefix} ${message}`])
  }

  const clearConsole = () => {
    setConsoleOutput([])
    setCurrentProcess('')
  }

  const pollSubmissionLogs = async (submissionId: string) => {
    let lastLogCount = 0
    let pollCount = 0
    const maxPolls = 300 // Poll for up to 5 minutes (300 * 1 second)

    const pollInterval = setInterval(async () => {
      pollCount++

      try {
        const response = await fetch(`/api/status/${submissionId}`)

        if (!response.ok) {
          if (pollCount >= maxPolls) {
            clearInterval(pollInterval)
            addConsoleOutput('Polling timeout: Could not retrieve submission status', 'warning')
            setIsSubmitting(false)
            setCurrentProcess('')
          }
          return
        }

        const result = await response.json() as { success: boolean; data?: { status: string; logs?: string[]; changeId?: string; changeUrl?: string; error?: string } }

        if (result.success && result.data) {
          const { status, logs, changeId, changeUrl, error } = result.data

          // Add new logs to console output (logs from server already have timestamps)
          if (logs && logs.length > lastLogCount) {
            const newLogs = logs.slice(lastLogCount)
            setConsoleOutput(prev => [...prev, ...newLogs])
            lastLogCount = logs.length
          }

          // Update current process based on status
          if (status === 'processing') {
            setCurrentProcess('Processing')
          } else if (status === 'completed') {
            setCurrentProcess('Completed')
            if (changeId) {
              addConsoleOutput(`Change ID: ${changeId}`, 'success')
            }
            if (changeUrl) {
              addConsoleOutput(`Change URL: ${changeUrl}`, 'success')
            }
            clearInterval(pollInterval)
            setIsSubmitting(false)
            setCurrentProcess('')
          } else if (status === 'failed') {
            setCurrentProcess('Failed')
            if (error) {
              addConsoleOutput(`Error: ${error}`, 'error')
            }
            clearInterval(pollInterval)
            setIsSubmitting(false)
            setCurrentProcess('')
          }
        }

        // Stop polling after max attempts
        if (pollCount >= maxPolls) {
          clearInterval(pollInterval)
          addConsoleOutput('Polling timeout: Maximum polling attempts reached', 'warning')
          setIsSubmitting(false)
          setCurrentProcess('')
        }
      } catch (error) {
        console.error('Error polling submission status:', error)
        if (pollCount >= maxPolls) {
          clearInterval(pollInterval)
          addConsoleOutput('Polling error: Could not retrieve submission status', 'error')
          setIsSubmitting(false)
          setCurrentProcess('')
        }
      }
    }, 1000) // Poll every second
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

  const normalizeEmailList = (value: string): string[] => {
    const normalized = splitEmails(value).map(email => email.toLowerCase())
    return Array.from(new Set(normalized.filter(email => EMAIL_REGEX.test(email))))
  }

  const findInvalidEmail = (value: string): string | undefined => {
    return splitEmails(value).find(email => !EMAIL_REGEX.test(email))
  }

  const notificationReceivers = normalizeEmailList(notificationReceiversInput)

  const renderEmailChips = (emails: string[]) => {
    if (emails.length === 0) {
      return null
    }
    return (
      <div className="flex flex-wrap gap-2 mt-2">
        {emails.map(email => (
          <span
            key={email}
            className={`px-2 py-1 rounded-full text-xs ${
              theme === 'dark'
                ? 'bg-gradient-highlight text-gradient-primary'
                : 'bg-gray-200 text-gray-700'
            }`}
          >
            {email}
          </span>
        ))}
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!file || !selectedProject || !subject) {
      setError('Please fill in all required fields')
      return
    }

    // Validate: if remote node is selected, project is required to construct repository URL
    if (selectedRemoteNode && !selectedProject) {
      setError('Target Project is required when a remote node is selected')
      return
    }

    const invalidReceiver = findInvalidEmail(notificationReceiversInput)
    if (invalidReceiver) {
      setEmailValidationError(`Invalid receiver email: ${invalidReceiver}`)
      return
    }

    setEmailValidationError(null)

    setIsSubmitting(true)
    setUploadStatus('uploading')
    setError(null)
    clearConsole()

    try {
      addConsoleOutput('Starting submission process...', 'info')
      setCurrentProcess('File Upload')
      addConsoleOutput('Uploading file to server...', 'info')

      // 1. 上传文件
      const formData = new FormData()
      formData.append('file', file)
      formData.append('project', selectedProject)

      const uploadResponse = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      })

      if (!uploadResponse.ok) {
        throw new Error('File upload failed')
      }

      const uploadResult: { success: boolean; data?: { uploadId: string; status: string; message: string } } = await uploadResponse.json()

      if (!uploadResult.success || !uploadResult.data?.uploadId) {
        throw new Error(uploadResult.data?.message || 'File upload failed')
      }

      const uploadId = uploadResult.data.uploadId
      setUploadId(uploadId)
      addConsoleOutput(`File uploaded successfully, Upload ID: ${uploadId}`, 'success')

      // 2. Submit patch
      setCurrentProcess('Patch Submission')
      addConsoleOutput('Submitting patch to Gerrit...', 'info')

      const submitResponse = await fetch('/api/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          uploadId,
          subject,
          description,
          branch: selectedBranch,
          notificationEmails: notificationReceivers,
          remoteNodeId: selectedRemoteNode || undefined,
          project: selectedProject
        })
      })

      if (!submitResponse.ok) {
        const errorData = await submitResponse.json().catch(() => ({ error: 'Patch submission failed' })) as { error?: string; message?: string }
        throw new Error(errorData.error || errorData.message || 'Patch submission failed')
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
      const submissionId = submitResult.data?.submissionId || submitResult.data?.changeId || null

      if (submissionId) {
        addConsoleOutput(`Submission ID: ${submissionId}`, 'success')
        addConsoleOutput('Polling for submission logs...', 'info')

        // Start polling for logs
        pollSubmissionLogs(submissionId)
      } else {
        addConsoleOutput('Warning: No submission ID received', 'warning')
        setIsSubmitting(false)
        setCurrentProcess('')
      }

    } catch (error) {
      console.error('Submission failed:', error)
      setError(error instanceof Error ? error.message : 'Submission failed')
      setUploadStatus('error')
      addConsoleOutput(`Error: ${error instanceof Error ? error.message : 'Submission failed'}`, 'error')
    } finally {
      setIsSubmitting(false)
      setCurrentProcess('')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center py-8 px-4 relative">
      <div className="max-w-4xl w-full">
        {/* Theme toggle, GitHub and Gerrit buttons */}
        <div className="flex justify-end mb-4 space-x-2">
          {isAdmin() && (
            <button
              onClick={() => navigate('/settings')}
              className={`p-2 rounded-lg transition-colors duration-200 ${
                theme === 'dark'
                  ? 'bg-gradient-accent text-gradient-primary hover:bg-gradient-highlight'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
              title="Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
          )}
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
          <a
            href="https://android-review.googlesource.com/"
            target="_blank"
            rel="noopener noreferrer"
            className={`p-2 rounded-lg transition-colors duration-200 ${
              theme === 'dark'
                ? 'bg-gradient-accent text-gradient-primary hover:bg-gradient-highlight'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            <Code className="w-5 h-5" />
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
          <UserInfo />
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
              Upload your Git patch file, and we'll help you submit it to AOSP Gerrit for code review
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-8">
            {/* File Upload */}
            <div>
              <label className={`block text-sm font-medium mb-4 ${
                theme === 'dark' ? 'text-gradient-primary' : 'text-gray-700'
              }`}>
                <div className="flex items-center space-x-2">
                  <FileText className="w-5 h-5" />
                  <span>Patch File</span>
                  <span className="text-red-500">*</span>
                </div>
              </label>
              <FileUpload onFileSelect={handleFileSelect} />
            </div>

            {/* Separator */}
            <div className={`border-t ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}></div>

            {/* Project Selection */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className={`block text-sm font-medium ${
                  theme === 'dark' ? 'text-gradient-primary' : 'text-gray-700'
                }`}>
                  <div className="flex items-center space-x-2">
                    <Folder className="w-5 h-5" />
                    <span>Target Project</span>
                    <span className="text-red-500">*</span>
                  </div>
                </label>
                <button
                  type="button"
                  onClick={() => fetchProjects(true)}
                  disabled={isLoadingProjects}
                  className={`p-1.5 rounded-md transition-colors duration-200 ${
                    theme === 'dark'
                      ? 'text-gradient-secondary hover:text-gradient-primary hover:bg-gradient-accent'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'
                  } ${isLoadingProjects ? 'opacity-50 cursor-not-allowed' : ''}`}
                  title="Refresh projects list"
                >
                  <RefreshCw className={`w-4 h-4 ${isLoadingProjects ? 'animate-spin' : ''}`} />
                </button>
              </div>
              <SearchableSelect
                options={projects.map((project) => ({
                  value: project.id,
                  label: `${project.name}${project.description ? ` - ${project.description}` : ''}`
                }))}
                value={selectedProject}
                onChange={setSelectedProject}
                placeholder="Please select an AOSP project"
                disabled={isLoadingProjects}
                isLoading={isLoadingProjects}
                emptyMessage="No projects available (check Gerrit configuration)"
                loadingMessage="Loading projects from Gerrit..."
                theme={theme}
              />
              {projects.length > 0 && (
                <p className={`text-xs mt-1 ${
                  theme === 'dark' ? 'text-gradient-secondary opacity-70' : 'text-gray-500'
                }`}>
                  {projects.length} project{projects.length !== 1 ? 's' : ''} loaded from Gerrit
                </p>
              )}
            </div>

            {/* Branch Selection */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className={`block text-sm font-medium ${
                  theme === 'dark' ? 'text-gradient-primary' : 'text-gray-700'
                }`}>
                  <div className="flex items-center space-x-2">
                    <GitBranch className="w-5 h-5" />
                    <span>Target Branch</span>
                  </div>
                </label>
                {selectedProject && (
                  <button
                    type="button"
                    onClick={() => fetchBranches(selectedProject, true)}
                    disabled={isLoadingBranches || !selectedProject}
                    className={`p-1.5 rounded-md transition-colors duration-200 ${
                      theme === 'dark'
                        ? 'text-gradient-secondary hover:text-gradient-primary hover:bg-gradient-accent'
                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'
                    } ${isLoadingBranches || !selectedProject ? 'opacity-50 cursor-not-allowed' : ''}`}
                    title="Refresh branches list"
                  >
                    <RefreshCw className={`w-4 h-4 ${isLoadingBranches ? 'animate-spin' : ''}`} />
                  </button>
                )}
              </div>
              <SearchableSelect
                options={branches.map((branch) => ({
                  value: branch.name,
                  label: branch.name
                }))}
                value={selectedBranch}
                onChange={setSelectedBranch}
                placeholder={!selectedProject ? "Please select a project first" : "Please select a branch"}
                disabled={!selectedProject || isLoadingBranches}
                isLoading={isLoadingBranches}
                emptyMessage="No branches available"
                loadingMessage="Loading branches..."
                theme={theme}
              />
              {selectedProject && branches.length > 0 && (
                <p className={`text-xs mt-1 ${
                  theme === 'dark' ? 'text-gradient-secondary opacity-70' : 'text-gray-500'
                }`}>
                  {branches.length} branch{branches.length !== 1 ? 'es' : ''} loaded for {selectedProject}
                </p>
              )}
            </div>

            {/* Separator */}
            <div className={`border-t ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}></div>

            {/* Remote Node Selection */}
            <div>
              <label className={`block text-sm font-medium mb-2 ${
                theme === 'dark' ? 'text-gradient-primary' : 'text-gray-700'
              }`}>
                <div className="flex items-center space-x-2">
                  <Server className="w-5 h-5" />
                  <span>Remote Node</span>
                </div>
              </label>
              <SearchableSelect
                options={nodes.map((node) => ({
                  value: node.id,
                  // Only show the display name to avoid exposing connection details
                  label: node.name
                }))}
                value={selectedRemoteNode}
                onChange={setSelectedRemoteNode}
                placeholder="Select a remote node (optional)"
                disabled={nodes.length === 0}
                isLoading={false}
                emptyMessage="No remote nodes available. Configure nodes in Settings page."
                loadingMessage="Loading remote nodes..."
                theme={theme}
              />
            </div>


            {/* Separator */}
            <div className={`border-t ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}></div>

            {/* Commit Subject */}
            <div>
              <label className={`block text-sm font-medium mb-2 ${
                theme === 'dark' ? 'text-gradient-primary' : 'text-gray-700'
              }`}>
                <div className="flex items-center space-x-2">
                  <MessageSquare className="w-5 h-5" />
                  <span>Commit Subject</span>
                  <span className="text-red-500">*</span>
                </div>
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Briefly describe your changes, e.g.: Fix memory leak in ActivityManager"
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent ${
                  theme === 'dark'
                    ? 'input-gradient border-gradient-accent'
                    : 'border-gray-300 bg-white'
                }`}
                required
              />
            </div>

            {/* Detailed Description */}
            <div>
              <label className={`block text-sm font-medium mb-2 ${
                theme === 'dark' ? 'text-gradient-primary' : 'text-gray-700'
              }`}>
                <div className="flex items-center space-x-2">
                  <AlignLeft className="w-5 h-5" />
                  <span>Detailed Description</span>
                </div>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe your changes in detail, including reasons and impact..."
                rows={4}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent ${
                  theme === 'dark'
                    ? 'input-gradient border-gradient-accent'
                    : 'border-gray-300 bg-white'
                }`}
              />
            </div>

            {/* Separator */}
            <div className={`border-t ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}></div>

            {/* Commit Author Name */}
            <div>
              <label className={`block text-sm font-medium mb-2 ${
                theme === 'dark' ? 'text-gradient-primary' : 'text-gray-700'
              }`}>
                <div className="flex items-center space-x-2">
                  <User className="w-5 h-5" />
                  <span>Author Name</span>
                </div>
              </label>
              <input
                type="text"
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                placeholder="Enter author name for git commit --author"
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent ${
                  theme === 'dark'
                    ? 'input-gradient border-gradient-accent'
                    : 'border-gray-300 bg-white'
                }`}
              />
            </div>

            {/* Commit Author Email */}
            <div>
              <label className={`block text-sm font-medium mb-2 ${
                theme === 'dark' ? 'text-gradient-primary' : 'text-gray-700'
              }`}>
                <div className="flex items-center space-x-2">
                  <Mail className="w-5 h-5" />
                  <span>Author Email</span>
                </div>
              </label>
              <input
                type="email"
                value={authorEmail}
                onChange={(e) => setAuthorEmail(e.target.value)}
                placeholder="Enter author email for git commit --author"
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent ${
                  theme === 'dark'
                    ? 'input-gradient border-gradient-accent'
                    : 'border-gray-300 bg-white'
                }`}
              />
            </div>

            {/* Separator */}
            <div className={`border-t ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}></div>

            {/* Notification Emails */}
            <div>
              <label className={`block text-sm font-medium mb-2 ${
                theme === 'dark' ? 'text-gradient-primary' : 'text-gray-700'
              }`}>
                <div className="flex items-center space-x-2">
                  <Bell className="w-5 h-5" />
                  <span>Email Notifications</span>
                </div>
              </label>
              <textarea
                value={notificationReceiversInput}
                onChange={(e) => setNotificationReceiversInput(e.target.value)}
                placeholder="Add email receivers, e.g. alice@example.com, bob@example.com"
                rows={2}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent ${
                  theme === 'dark'
                    ? 'input-gradient border-gradient-accent'
                    : 'border-gray-300 bg-white'
                }`}
              />
              {renderEmailChips(notificationReceivers)}
            </div>

            {emailValidationError && (
              <div className="text-sm text-red-500">
                {emailValidationError}
              </div>
            )}

            {/* Commit Message Preview */}
            {showPreview && (
              <div className={`border rounded-md p-4 ${
                theme === 'dark'
                  ? 'bg-gradient-highlight border-gradient-accent'
                  : 'bg-gray-50 border-gray-200'
              }`}>
                <h3 className={`text-sm font-medium mb-2 ${
                  theme === 'dark' ? 'text-gradient-primary' : 'text-gray-700'
                }`}>
                  Commit Message Preview:
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
                <span>{showPreview ? 'Hide Preview' : 'Preview Commit'}</span>
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
                <span>{isSubmitting ? 'Submitting...' : 'Submit Patch'}</span>
              </button>
            </div>

            {/* Console Output */}
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
                      Console Output
                      {currentProcess && (
                        <span className={`ml-2 text-xs ${
                          theme === 'dark' ? 'text-gradient-secondary' : 'text-gray-500'
                        }`}>
                          Current Process: {currentProcess}
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
                    Clear
                  </button>
                </div>
                <div className={`p-4 max-h-64 overflow-y-auto font-mono text-sm ${
                  theme === 'dark' ? 'text-gradient-secondary' : 'text-gray-600'
                }`}>
                  {consoleOutput.length === 0 ? (
                    <div className={`text-center py-8 ${
                      theme === 'dark' ? 'text-gradient-secondary opacity-50' : 'text-gray-400'
                    }`}>
                      Waiting for submission process to start...
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
                          Processing...
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
          <div>Version: v{packageInfo.version}</div>
          <div>Commit: {import.meta.env.GIT_HASH}</div>
          <div>Build Time: {new Date(import.meta.env.BUILD_TIME).toLocaleString('en-US')}</div>
        </div>
      </div>
    </div>
  )
}

export default SubmitPage