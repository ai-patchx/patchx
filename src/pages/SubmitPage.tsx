import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Settings, Send, Moon, Sun, Eye, Terminal, Github, Code, RefreshCw, Folder, GitBranch, MessageSquare, AlignLeft, User, Mail, Bell, Server, X } from 'lucide-react'
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
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null)
  const [currentSubmissionId, setCurrentSubmissionId] = useState<string | null>(null)
  const [commandIds, setCommandIds] = useState<string[]>([]) // Track command IDs for cancellation

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

    // Restore active submission state if returning from another page
    const restoreActiveSubmission = async () => {
      try {
        const savedSubmissionId = localStorage.getItem('activeSubmissionId')
        const savedRemoteNode = localStorage.getItem('activeSubmissionRemoteNode')
        const savedCommandIds = localStorage.getItem('activeSubmissionCommandIds')

        if (savedSubmissionId) {
          // Check if submission is still active
          const response = await fetch(`/api/status/${savedSubmissionId}`)
          if (response.ok) {
            const result = await response.json() as { success: boolean; data?: { status: string; logs?: string[] } }
            if (result.success && result.data) {
              const { status, logs } = result.data
              // Only restore if still processing
              if (status === 'processing' || status === 'pending') {
                setCurrentSubmissionId(savedSubmissionId)
                setIsSubmitting(true)
                if (savedRemoteNode) {
                  setSelectedRemoteNode(savedRemoteNode)
                }
                if (savedCommandIds) {
                  try {
                    const commandIdsArray = JSON.parse(savedCommandIds)
                    if (Array.isArray(commandIdsArray)) {
                      setCommandIds(commandIdsArray)
                    }
                  } catch (e) {
                    console.error('Failed to parse saved command IDs:', e)
                  }
                }
                // Restore logs if available
                if (logs && Array.isArray(logs)) {
                  setConsoleOutput(logs)
                }
                // Resume polling
                pollSubmissionLogs(savedSubmissionId)
                addConsoleOutput('[Info] Resumed monitoring active submission', 'info')
              } else {
                // Submission completed or failed, clear saved state
                localStorage.removeItem('activeSubmissionId')
                localStorage.removeItem('activeSubmissionRemoteNode')
                localStorage.removeItem('activeSubmissionCommandIds')
              }
            }
          } else {
            // Submission not found or error, clear saved state
            localStorage.removeItem('activeSubmissionId')
            localStorage.removeItem('activeSubmissionRemoteNode')
            localStorage.removeItem('activeSubmissionCommandIds')
          }
        }
      } catch (error) {
        console.error('Error restoring active submission:', error)
        // Clear saved state on error
        localStorage.removeItem('activeSubmissionId')
        localStorage.removeItem('activeSubmissionRemoteNode')
        localStorage.removeItem('activeSubmissionCommandIds')
      }
    }

    restoreActiveSubmission()
  }, [loadFromStorage, loadCacheFromStorage, getCachedProjects, fetchNodes])

  // Cleanup polling interval on unmount
  useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval)
      }
    }
  }, [pollingInterval])

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


  // Save commandIds to localStorage whenever they change
  useEffect(() => {
    if (commandIds.length > 0 && currentSubmissionId) {
      localStorage.setItem('activeSubmissionCommandIds', JSON.stringify(commandIds))
    }
  }, [commandIds, currentSubmissionId])

  // Extract command IDs from logs if they contain command ID information
  useEffect(() => {
    if (consoleOutput.length > 0 && currentSubmissionId) {
      // Try to extract command IDs from logs (look for patterns like "commandId: xxx" or similar)
      const commandIdPattern = /commandId[:\s]+([a-f0-9-]{8,})/gi
      const extractedIds: string[] = []
      consoleOutput.forEach(log => {
        const matches = log.matchAll(commandIdPattern)
        for (const match of matches) {
          if (match[1] && !extractedIds.includes(match[1])) {
            extractedIds.push(match[1])
          }
        }
      })
      if (extractedIds.length > 0) {
        setCommandIds(prev => {
          const combined = [...new Set([...prev, ...extractedIds])]
          return combined
        })
      }
    }
  }, [consoleOutput, currentSubmissionId])

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

  const handleFileSelect = (selectedFile: File) => {
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
    let lastLogUpdateTime = Date.now()
    let consecutiveErrors = 0
    const maxPolls = 300 // Poll for up to 5 minutes (300 * 1 second)
    const maxNoProgressTime = 120000 // 2 minutes without new logs = timeout
    const maxConsecutiveErrors = 5 // Stop after 5 consecutive errors
    const fetchTimeout = 10000 // 10 seconds timeout for each fetch

    const pollInterval = setInterval(async () => {
      pollCount++

      try {
        // Create AbortController for timeout
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), fetchTimeout)

        const response = await fetch(`/api/status/${submissionId}`, {
          signal: controller.signal
        })

        clearTimeout(timeoutId)
        consecutiveErrors = 0 // Reset error count on success

        if (!response.ok) {
          if (pollCount >= maxPolls) {
            clearInterval(pollInterval)
            setPollingInterval(null)
            addConsoleOutput('Polling timeout: Could not retrieve submission status', 'warning')
            setIsSubmitting(false)
            setCurrentProcess('')
            setCurrentSubmissionId(null)
          }
          return
        }

        const result = await response.json() as { success: boolean; data?: { status: string; logs?: string[]; changeId?: string; changeUrl?: string; error?: string } }

        if (result.success && result.data) {
          const { status, logs, changeId, changeUrl, error } = result.data

          // Debug: Log polling info
          if (pollCount % 10 === 0) { // Log every 10 polls (every 10 seconds)
            console.log(`[Polling] Poll #${pollCount}, Status: ${status}, Logs count: ${logs?.length || 0}, Last log count: ${lastLogCount}`)
          }

          // Add new logs to console output (logs from server already have timestamps)
          if (logs && Array.isArray(logs)) {
            if (logs.length > lastLogCount) {
              const newLogs = logs.slice(lastLogCount)
              console.log(`[Polling] Adding ${newLogs.length} new logs (total: ${logs.length}, previous: ${lastLogCount})`)
              setConsoleOutput(prev => [...prev, ...newLogs])
              lastLogCount = logs.length
              lastLogUpdateTime = Date.now() // Update timestamp when new logs arrive
            } else if (logs.length < lastLogCount) {
              // Log count decreased (shouldn't happen, but log it)
              console.warn(`[Polling] Log count decreased from ${lastLogCount} to ${logs.length}, resetting`)
              lastLogCount = logs.length
            }
          } else if (!logs) {
            // No logs array in response
            if (pollCount % 10 === 0) {
              console.warn(`[Polling] No logs array in response (poll #${pollCount})`)
            }
          }

          // Check for stuck processing status (no new logs for too long)
          if (status === 'processing') {
            // Update lastLogUpdateTime if we have logs (even if count hasn't changed)
            if (logs && logs.length > 0) {
              lastLogUpdateTime = Date.now()
            }

            const timeSinceLastLog = Date.now() - lastLogUpdateTime
            if (timeSinceLastLog > maxNoProgressTime) {
              clearInterval(pollInterval)
              setPollingInterval(null)
              addConsoleOutput(`Polling timeout: No progress detected for ${Math.round(timeSinceLastLog / 1000)} seconds. The submission may be stuck.`, 'warning')
              addConsoleOutput('This may indicate a server-side issue. Please check the Worker logs or try submitting again.', 'warning')
              setIsSubmitting(false)
              setCurrentProcess('')
              setCurrentSubmissionId(null)
              // Clear saved submission state
              localStorage.removeItem('activeSubmissionId')
              localStorage.removeItem('activeSubmissionRemoteNode')
              localStorage.removeItem('activeSubmissionCommandIds')
              return
            }
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
            setPollingInterval(null)
            setIsSubmitting(false)
            setCurrentProcess('')
            setCurrentSubmissionId(null)
            // Clear saved submission state
            localStorage.removeItem('activeSubmissionId')
            localStorage.removeItem('activeSubmissionRemoteNode')
            localStorage.removeItem('activeSubmissionCommandIds')
          } else if (status === 'failed') {
            setCurrentProcess('Failed')
            if (error) {
              addConsoleOutput(`Error: ${error}`, 'error')
            }
            clearInterval(pollInterval)
            setPollingInterval(null)
            setIsSubmitting(false)
            setCurrentProcess('')
            setCurrentSubmissionId(null)
            // Clear saved submission state
            localStorage.removeItem('activeSubmissionId')
            localStorage.removeItem('activeSubmissionRemoteNode')
            localStorage.removeItem('activeSubmissionCommandIds')
          }
        }

        // Stop polling after max attempts
        if (pollCount >= maxPolls) {
          clearInterval(pollInterval)
          setPollingInterval(null)
          addConsoleOutput('Polling timeout: Maximum polling attempts reached', 'warning')
          setIsSubmitting(false)
          setCurrentProcess('')
          setCurrentSubmissionId(null)
          // Clear saved submission state
          localStorage.removeItem('activeSubmissionId')
          localStorage.removeItem('activeSubmissionRemoteNode')
          localStorage.removeItem('activeSubmissionCommandIds')
        }
      } catch (error) {
        consecutiveErrors++
        console.error('Error polling submission status:', error)

        // Handle abort/timeout errors
        if (error instanceof Error && error.name === 'AbortError') {
          addConsoleOutput(`Request timeout: Server did not respond within ${fetchTimeout / 1000} seconds`, 'warning')
        } else {
          addConsoleOutput(`Polling error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'warning')
        }

        // Stop polling after too many consecutive errors
        if (consecutiveErrors >= maxConsecutiveErrors) {
          clearInterval(pollInterval)
          setPollingInterval(null)
          addConsoleOutput(`Polling stopped: ${consecutiveErrors} consecutive errors. The submission may be stuck or the server is unavailable.`, 'error')
          setIsSubmitting(false)
          setCurrentProcess('')
          setCurrentSubmissionId(null)
          // Clear saved submission state
          localStorage.removeItem('activeSubmissionId')
          localStorage.removeItem('activeSubmissionRemoteNode')
          localStorage.removeItem('activeSubmissionCommandIds')
        } else if (pollCount >= maxPolls) {
          clearInterval(pollInterval)
          setPollingInterval(null)
          addConsoleOutput('Polling timeout: Maximum polling attempts reached', 'error')
          setIsSubmitting(false)
          setCurrentProcess('')
          setCurrentSubmissionId(null)
          // Clear saved submission state
          localStorage.removeItem('activeSubmissionId')
          localStorage.removeItem('activeSubmissionRemoteNode')
          localStorage.removeItem('activeSubmissionCommandIds')
        }
      }
    }, 1000) // Poll every second

    // Store the interval reference
    setPollingInterval(pollInterval)
  }

  const handleCancel = async () => {
    if (!isSubmitting) {
      return
    }

    addConsoleOutput('[Info] Cancelling submission...', 'warning')

    // Stop polling
    if (pollingInterval) {
      clearInterval(pollingInterval)
      setPollingInterval(null)
    }

    // Cancel SSH commands if we have command IDs and a remote node is selected
    if (commandIds.length > 0 && selectedRemoteNode) {
      try {
        // Get the remote node info to find SSH service API URL
        const nodesResponse = await fetch('/api/remote-nodes').catch(() => null)
        if (nodesResponse) {
          const nodesData = await nodesResponse.json().catch(() => ({ data: [] }))
          const node = nodesData.data?.find((n: any) => n.id === selectedRemoteNode)

          if (node?.sshServiceApiUrl) {
            for (const commandId of commandIds) {
              try {
                const headers: Record<string, string> = {
                  'Content-Type': 'application/json'
                }
                if (node.sshServiceApiKey) {
                  headers['Authorization'] = `Bearer ${node.sshServiceApiKey}`
                }

                await fetch(`${node.sshServiceApiUrl}/cancel`, {
                  method: 'POST',
                  headers,
                  body: JSON.stringify({ commandId })
                })
                addConsoleOutput(`[Info] Cancelled SSH command: ${commandId.substring(0, 8)}...`, 'info')
              } catch (error) {
                console.error('Error cancelling command:', error)
                addConsoleOutput(`[Warning] Failed to cancel command ${commandId.substring(0, 8)}...`, 'warning')
              }
            }
          }
        }
      } catch (error) {
        console.error('Error fetching remote nodes for cancellation:', error)
      }
      setCommandIds([])
    }

    // Reset state
    setIsSubmitting(false)
    setCurrentProcess('')
    setCurrentSubmissionId(null)
    // Clear saved submission state
    localStorage.removeItem('activeSubmissionId')
    localStorage.removeItem('activeSubmissionRemoteNode')
    localStorage.removeItem('activeSubmissionCommandIds')
    addConsoleOutput('[Warning] Submission cancelled by user', 'warning')
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
    if (authorName && authorEmail) {
      lines.push('')
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

    if (!file || !selectedProject || !subject || !selectedRemoteNode) {
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
    setCommandIds([]) // Clear any previous command IDs
    setCurrentSubmissionId(null) // Clear previous submission ID

    try {
      addConsoleOutput('Starting submission process...', 'info')
      setCurrentProcess('File Upload')
      addConsoleOutput('Uploading file to server...', 'info')

      // 1. Upload file
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
        setCurrentSubmissionId(submissionId)

        // Save submission state to localStorage for persistence across navigation
        localStorage.setItem('activeSubmissionId', submissionId)
        if (selectedRemoteNode) {
          localStorage.setItem('activeSubmissionRemoteNode', selectedRemoteNode)
        }

        // Start polling for logs - keep isSubmitting true during polling
        // The polling function will set isSubmitting to false when done
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
              <FileUpload onFileSelect={handleFileSelect} disabled={isSubmitting} />
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
                  disabled={isLoadingProjects || isSubmitting}
                  className={`p-1.5 rounded-md transition-colors duration-200 ${
                    theme === 'dark'
                      ? 'text-gradient-secondary hover:text-gradient-primary hover:bg-gradient-accent'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'
                  } ${isLoadingProjects || isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
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
                disabled={isLoadingProjects || isSubmitting}
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
                    disabled={isLoadingBranches || !selectedProject || isSubmitting}
                    className={`p-1.5 rounded-md transition-colors duration-200 ${
                      theme === 'dark'
                        ? 'text-gradient-secondary hover:text-gradient-primary hover:bg-gradient-accent'
                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'
                    } ${isLoadingBranches || !selectedProject || isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
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
                disabled={!selectedProject || isLoadingBranches || isSubmitting}
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
                  <span className="text-red-500">*</span>
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
                placeholder="Select a remote node"
                disabled={nodes.length === 0 || isSubmitting}
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
                disabled={isSubmitting}
                autoComplete="off"
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent ${
                  theme === 'dark'
                    ? 'input-gradient border-gradient-accent'
                    : 'border-gray-300 bg-white'
                } ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
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
                disabled={isSubmitting}
                autoComplete="off"
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent ${
                  theme === 'dark'
                    ? 'input-gradient border-gradient-accent'
                    : 'border-gray-300 bg-white'
                } ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
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
                disabled={isSubmitting}
                autoComplete="off"
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent ${
                  theme === 'dark'
                    ? 'input-gradient border-gradient-accent'
                    : 'border-gray-300 bg-white'
                } ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
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
                type="text"
                value={authorEmail}
                onChange={(e) => setAuthorEmail(e.target.value)}
                placeholder="Enter author email for git commit --author"
                disabled={isSubmitting}
                autoComplete="new-password"
                name="author-email-field"
                id="author-email-field"
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent ${
                  theme === 'dark'
                    ? 'input-gradient border-gradient-accent'
                    : 'border-gray-300 bg-white'
                } ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
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
              <input
                type="text"
                value={notificationReceiversInput}
                onChange={(e) => setNotificationReceiversInput(e.target.value)}
                placeholder="Add email receivers, e.g. alice@example.com, bob@example.com"
                disabled={isSubmitting}
                autoComplete="new-password"
                name="notification-emails-field"
                id="notification-emails-field"
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent ${
                  theme === 'dark'
                    ? 'input-gradient border-gradient-accent'
                    : 'border-gray-300 bg-white'
                } ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
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

            {/* Submit button */}
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={handlePreview}
                disabled={isSubmitting}
                className={`
                  flex items-center space-x-2 px-4 py-3 rounded-md font-medium
                  transition-colors duration-200
                  ${
                    isSubmitting
                      ? theme === 'dark'
                        ? 'bg-gray-700 text-gray-500 cursor-not-allowed opacity-50'
                        : 'bg-gray-200 text-gray-400 cursor-not-allowed opacity-50'
                      : theme === 'dark'
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
                disabled={!file || !selectedProject || !subject || !selectedRemoteNode || isSubmitting}
                className={`
                  flex items-center space-x-2 px-6 py-3 rounded-md font-medium
                  transition-colors duration-200
                  ${
                    !file || !selectedProject || !subject || !selectedRemoteNode || isSubmitting
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
              {isSubmitting && (
                <button
                  type="button"
                  onClick={handleCancel}
                  className={`
                    flex items-center space-x-2 px-6 py-3 rounded-md font-medium
                    transition-colors duration-200
                    ${
                      theme === 'dark'
                        ? 'bg-red-600 text-white hover:bg-red-700'
                        : 'bg-red-600 text-white hover:bg-red-700'
                    }
                  `}
                >
                  <X className="w-5 h-5" />
                  <span>Cancel</span>
                </button>
              )}
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