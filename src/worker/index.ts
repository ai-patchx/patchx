import { connect } from 'cloudflare:sockets'
import { Env } from './types'
import { UploadService } from './services/uploadService'
import { SubmissionService } from './services/submissionService'
import { EnhancedPatchService } from './services/enhancedPatchService'
import { GerritService } from './services/gerritService'
import { GitService } from './services/gitService'
import { getKvNamespace } from './kv'
import { executeSSHCommandDirect } from './ssh-client'
import { getD1Database, queryD1, queryD1First, executeD1, generateUUID } from './d1'

interface RemoteNodeData {
  id: string
  name: string
  host: string
  port: number
  username: string
  authType: 'key' | 'password'
  sshKey?: string
  password?: string
  workingHome?: string // Working directory path on the remote node
  sshServiceApiUrl?: string // SSH service API URL for command execution
  sshServiceApiKey?: string // SSH service API key for authentication
  createdAt: string
  updatedAt: string
}

// Cache configuration
const CACHE_TTL = 3600 // 1 hour in seconds for projects (they don't change often)
const BRANCHES_CACHE_TTL = 1800 // 30 minutes for branches
const CACHE_VERSION = 'v1' // Update this to invalidate all caches on deploy

// Helper function to create cache key with version
function createCacheKey(request: Request, env?: Env): Request {
  const url = new URL(request.url)
  // Add cache version to query params for cache key differentiation
  // This allows cache invalidation by updating CACHE_VERSION
  const cacheVersion = env?.CACHE_VERSION || CACHE_VERSION
  const cacheKeyUrl = new URL(url.toString())
  cacheKeyUrl.searchParams.set('_cache_version', cacheVersion)
  return new Request(cacheKeyUrl.toString(), request)
}

// Helper function to get cache key string for KV
function getCacheKeyString(path: string, queryParams: string, env?: Env): string {
  const cacheVersion = env?.CACHE_VERSION || CACHE_VERSION
  // Remove leading ? from queryParams if present
  const cleanQuery = queryParams.startsWith('?') ? queryParams.slice(1) : queryParams
  const params = new URLSearchParams(cleanQuery)
  params.set('_cache_version', cacheVersion)
  return `cache:${path}:${params.toString()}`
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname
    const method = request.method

    // Set CORS headers - more complete CORS support
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    }

    // Handle OPTIONS requests
    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders })
    }

    try {
      // Root path handling - return service information
      if (path === '/' && method === 'GET') {
        return new Response(
          JSON.stringify({
            service: 'AOSP Patch Submission Service',
            version: '1.0.0',
            status: 'running',
            endpoints: {
              upload: '/api/upload',
              submit: '/api/submit',
              status: '/api/status/:id',
              login: '/api/auth/login',
              aiResolveConflict: '/api/ai/resolve-conflict',
              aiProviders: '/api/ai/providers',
              aiTestProviders: '/api/ai/test-providers',
              models: '/api/models',
              projects: '/api/projects',
              projectBranches: '/api/projects/:project/branches',
              nodes: '/api/nodes',
              nodeTest: '/api/nodes/:id/test',
              emailTest: '/api/email/test',
              gitClone: '/api/git/clone'
            },
            documentation: 'https://github.com/your-repo/aosp-patch-service'
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          }
        )
      }

      // Existing API routes
      if (path === '/api/upload' && method === 'POST') {
        return await handleUpload(request, env, corsHeaders)
      } else if (path === '/api/submit' && method === 'POST') {
        return await handleSubmit(request, env, corsHeaders, ctx)
      } else if (path.startsWith('/api/status/') && method === 'GET') {
        return await handleStatus(path, env, corsHeaders)
      }

      // Login API route
      else if (path === '/api/auth/login' && method === 'POST') {
        return await handleLogin(request, env, corsHeaders)
      }

      // New AI conflict resolution API routes
      else if (path === '/api/ai/resolve-conflict' && method === 'POST') {
        return await handleAIConflictResolution(request, env, corsHeaders)
      } else if (path === '/api/ai/providers' && method === 'GET') {
        return await handleAIProviders(env, corsHeaders)
      } else if (path === '/api/ai/test-providers' && method === 'POST') {
        return await handleAITestProviders(env, corsHeaders)
      } else if (path === '/api/config/public' && method === 'GET') {
        return await handlePublicConfig(env, corsHeaders)
      } else if (path === '/api/models' && method === 'GET') {
        return await handleModels(env, corsHeaders)
      } else if (path === '/api/projects' && method === 'GET') {
        return await handleProjects(request, env, corsHeaders)
      } else if (path.startsWith('/api/projects/') && path.endsWith('/branches') && method === 'GET') {
        return await handleProjectBranches(path, env, corsHeaders, request)
      } else if (path === '/api/nodes' && method === 'GET') {
        return await handleGetNodes(env, corsHeaders)
      } else if (path === '/api/nodes' && method === 'POST') {
        return await handleCreateNode(request, env, corsHeaders)
      } else if (path === '/api/nodes/test-config' && method === 'POST') {
        return await handleTestNodeConfig(request, env, corsHeaders)
      } else if (path.startsWith('/api/nodes/') && method === 'PUT') {
        return await handleUpdateNode(path, request, env, corsHeaders)
      } else if (path.startsWith('/api/nodes/') && method === 'DELETE') {
        return await handleDeleteNode(path, env, corsHeaders)
      } else if (path.startsWith('/api/nodes/') && path.endsWith('/test') && method === 'POST') {
        return await handleTestNode(path, env, corsHeaders)
      } else if (path === '/api/email/test' && method === 'POST') {
        return await handleTestEmail(request, env, corsHeaders)
      } else if (path === '/api/git/clone' && method === 'POST') {
        return await handleGitClone(request, env, corsHeaders)
      } else if (path === '/api/settings/test-litellm' && method === 'POST') {
        return await handleTestLiteLLM(request, env, corsHeaders)
      } else if (path === '/api/settings' && method === 'GET') {
        return await handleGetSettings(env, corsHeaders)
      } else if (path === '/api/settings' && method === 'PUT') {
        console.log('Matched PUT /api/settings route')
        return await handleUpdateSettings(request, env, corsHeaders)
      }

      else {
        // Log unmatched routes for debugging
        console.log('Unmatched route:', { path, method, url: request.url })
        return new Response(JSON.stringify({
          error: 'Not Found',
          path,
          method
        }), {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        })
      }
    } catch (error) {
      console.error('Worker error:', error)
      return new Response(
        JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Internal server error'
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      )
    }
  }
}

// AI conflict resolution API handler function
async function handleAIConflictResolution(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  try {
    const body = await request.json() as {
      originalCode: string
      incomingCode: string
      currentCode: string
      filePath: string
      provider?: string
      useMultipleProviders?: boolean
    }

    const { originalCode, incomingCode, currentCode, filePath, provider, useMultipleProviders } = body

    if (!originalCode || !incomingCode || !currentCode || !filePath) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required parameters' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      )
    }

    const enhancedPatchService = new EnhancedPatchService(env)

    // Mock patch content
    const mockUpload = {
      id: 'conflict-resolution',
      filename: filePath,
      content: incomingCode,
      project: 'conflict-resolution',
      validationStatus: 'valid' as const,
      createdAt: new Date().toISOString()
    }

    const result = await enhancedPatchService.processPatchWithAI(
      mockUpload,
      currentCode,
      {
        useAI: true,
        provider,
        useMultipleProviders
      }
    )

    if (result.success) {
      return new Response(
        JSON.stringify({
          success: true,
          data: result.aiResolution
        }),
        {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      )
    } else {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Conflict resolution failed',
          data: result
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      )
    }
  } catch (error) {
    console.error('AI conflict resolution error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'AI conflict resolution failed'
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    )
  }
}

async function handleAIProviders(env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  try {
    const enhancedPatchService = new EnhancedPatchService(env)
    const providers = enhancedPatchService.getAvailableAIProviders()
    const isEnabled = enhancedPatchService.isAIEnabled()

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          enabled: isEnabled,
          providers,
          message: isEnabled ? 'AI conflict resolution is enabled' : 'AI conflict resolution is not enabled, please configure AI provider'
        }
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get AI providers'
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    )
  }
}

async function handleAITestProviders(env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  try {
    const enhancedPatchService = new EnhancedPatchService(env)

    if (!enhancedPatchService.isAIEnabled()) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'AI conflict resolution is not enabled'
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      )
    }

    const results = await enhancedPatchService.testAIProviders()

    return new Response(
      JSON.stringify({
        success: true,
        data: results
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to test AI providers'
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    )
  }
}

// Login handler function
async function handleLogin(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  try {
    const body = await request.json() as { username: string; password: string }
    const { username, password } = body

    // Validate input
    if (!username || !password) {
      return new Response(
        JSON.stringify({ message: 'Username and password cannot be empty' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      )
    }

    // Get test account password
    const getTestPassword = () => {
      // Support Cloudflare Workers environment variables
      if (env.TEST_USER_PASSWORD) {
        return env.TEST_USER_PASSWORD
      }
      // Default password
      return 'patchx'
    }

    // Get administrator account password
    const getAdminPassword = () => {
      // Support Cloudflare Workers environment variables
      if (env.ADMIN_USER_PASSWORD) {
        return env.ADMIN_USER_PASSWORD
      }
      // Default password
      return 'admin'
    }

    const VALID_CREDENTIALS = [
      {
        username: 'patchx',
        password: getTestPassword(),
        role: 'user'
      },
      {
        username: 'admin',
        password: getAdminPassword(),
        role: 'administrator'
      }
    ]

    // Validate credentials
    const validCredential = VALID_CREDENTIALS.find(
      cred => cred.username === username && cred.password === password
    )

    if (!validCredential) {
      return new Response(
        JSON.stringify({ message: 'Invalid username or password' }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      )
    }

    // Create user object and simple JWT token
    const user = {
      id: username === 'admin' ? 'admin-123' : 'user-123',
      username: username,
      role: validCredential.role
    }

    // Simple token generation (using base64 encoding)
    const token = btoa(JSON.stringify({
      userId: user.id,
      username: user.username,
      role: user.role,
      exp: Date.now() + 24 * 60 * 60 * 1000 // Expires after 24 hours
    }))

    const response = {
      user,
      token,
      message: 'Login successful'
    }

    return new Response(
      JSON.stringify(response),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    )
  } catch (error) {
    console.error('Login error:', error)
    return new Response(
      JSON.stringify({ message: 'Internal server error' }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    )
  }
}

// Original handler functions remain unchanged...
async function handleUpload(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const project = formData.get('project') as string

  if (!file || !project) {
    return new Response(
      JSON.stringify({ success: false, error: 'Missing required parameters' }),
      {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    )
  }

  // Check file size
  const maxFileSize = env.MAX_FILE_SIZE || 10 * 1024 * 1024 // 10MB
  if (file.size > maxFileSize) {
    return new Response(
      JSON.stringify({ success: false, error: 'File size exceeds limit' }),
      {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    )
  }

  const uploadService = new UploadService(env)
  const result = await uploadService.validateAndStoreUpload(file, project)

  return new Response(
    JSON.stringify({ success: true, data: result }),
    {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    }
  )
}

async function handleSubmit(request: Request, env: Env, corsHeaders: Record<string, string>, ctx?: ExecutionContext): Promise<Response> {
  const body = await request.json() as {
    uploadId: string
    subject: string
    description: string
    branch: string
    model?: string
    notificationEmails?: string[]
    notificationCc?: string[]
    remoteNodeId?: string
    project?: string
  }
  const { uploadId, subject, description, branch, model, remoteNodeId, project } = body

  if (!uploadId || !subject || !branch) {
    return new Response(
      JSON.stringify({ success: false, error: 'Missing required parameters' }),
      {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    )
  }

  // Validate: if remoteNodeId is provided, project is required to construct repository URL
  if (remoteNodeId && !project) {
    return new Response(
      JSON.stringify({ success: false, error: 'Target Project is required when remote node is selected' }),
      {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    )
  }

  // Construct repository URL from GERRIT_BASE_URL and project name
  // Format: https://android-review.googlesource.com/platform/frameworks/base
  let gitRepository: string | undefined
  if (remoteNodeId && project && env.GERRIT_BASE_URL) {
    // Remove trailing slash from GERRIT_BASE_URL if present
    const baseUrl = env.GERRIT_BASE_URL.replace(/\/$/, '')
    gitRepository = `${baseUrl}/${project}`
  }

  const submissionService = new SubmissionService(env)
  const notificationEmails = Array.isArray(body.notificationEmails) ? body.notificationEmails : undefined
  const notificationCc = Array.isArray(body.notificationCc) ? body.notificationCc : undefined

  try {
    // Create submission record
    const submission = await submissionService.createSubmission(
      uploadId,
      subject,
      description || '',
      branch,
      model,
      notificationEmails,
      notificationCc,
      remoteNodeId,
      gitRepository
    )

    // Asynchronously submit to Gerrit or execute git commands (don't wait for completion)
    console.log(`[Submit Handler] Starting async submission processing for ID: ${submission.id}`)

    // Create the async processing promise
    const processingPromise = (async () => {
      try {
        await submissionService.submitToGerrit(submission.id)
        console.log(`[Submit Handler] Submission ${submission.id} completed successfully`)
      } catch (error) {
        console.error(`[Submit Handler] Submission ${submission.id} processing failed:`, error)
        // Try to log the error to the submission
        try {
          const failedSubmission = await submissionService.getSubmission(submission.id)
          if (failedSubmission) {
            failedSubmission.status = 'failed'
            failedSubmission.error = error instanceof Error ? error.message : String(error)
            failedSubmission.updatedAt = new Date().toISOString()
            if (!failedSubmission.logs) {
              failedSubmission.logs = []
            }
            const errorMsg = error instanceof Error ? error.message : String(error)
            const errorStack = error instanceof Error ? error.stack : undefined
            failedSubmission.logs.push(`[${new Date().toLocaleTimeString('en-US')}] [Error] Submission processing failed: ${errorMsg}`)
            if (errorStack) {
              failedSubmission.logs.push(`[${new Date().toLocaleTimeString('en-US')}] [Error] Stack: ${errorStack.substring(0, 500)}`)
            }
            // Use SubmissionService's internal KV access instead of direct env.KV
            const kv = getKvNamespace(env)
            await kv.put(`submissions:${submission.id}`, JSON.stringify(failedSubmission))
          } else {
            console.error(`[Submit Handler] Could not retrieve submission ${submission.id} to log error`)
          }
        } catch (logError) {
          console.error(`[Submit Handler] Failed to log error to submission ${submission.id}:`, logError)
        }
      }
    })().catch((unhandledError) => {
      console.error(`[Submit Handler] Unhandled error in async submission processing for ${submission.id}:`, unhandledError)
    })

    // Use ctx.waitUntil() to keep the execution context alive for async processing
    if (ctx) {
      ctx.waitUntil(processingPromise)
    } else {
      // Fallback if ctx is not available (shouldn't happen in production)
      console.warn('[Submit Handler] ExecutionContext not available, async processing may not complete')
      processingPromise.catch((err) => {
        console.error('[Submit Handler] Async processing failed without ctx:', err)
      })
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          submissionId: submission.id,
          status: 'processing'
        }
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Submission failed'
      }),
      {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    )
  }
}

async function handleStatus(path: string, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  const id = path.split('/').pop()

  if (!id) {
    return new Response(
      JSON.stringify({ success: false, error: 'Missing submission ID' }),
      {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    )
  }

  const submissionService = new SubmissionService(env)

  try {
    const status = await submissionService.getSubmissionStatus(id)

    return new Response(
      JSON.stringify({ success: true, data: status }),
      {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get status'
      }),
      {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    )
  }
}
async function handlePublicConfig(env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  const data = {
    publicSiteUrl: env.VITE_PUBLIC_SITE_URL || ''
  }

  return new Response(
    JSON.stringify({ success: true, data }),
    {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    }
  )
}

async function handleModels(env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  try {
    // Get LiteLLM configuration from database
    const db = getD1Database(env)
    const settings = await queryD1<{ key: string; value: string | null }>(
      db,
      'SELECT key, value FROM app_settings WHERE key IN (?, ?)',
      ['litellm_base_url', 'litellm_api_key']
    )

    if (!settings.success) {
      console.error('Error fetching LiteLLM settings')
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to fetch LiteLLM configuration from database.'
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      )
    }

    // Convert settings array to object
    const settingsMap: Record<string, string> = {}
    if (settings.results) {
      for (const setting of settings.results) {
        settingsMap[setting.key] = setting.value || ''
      }
    }

    const litellmBaseUrl = settingsMap['litellm_base_url'] || ''
    const litellmApiKey = settingsMap['litellm_api_key'] || ''

    // Check if litellm is configured
    if (!litellmBaseUrl || !litellmApiKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'LiteLLM is not configured. Please configure LiteLLM in the Settings page.'
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      )
    }

    // Fetch models from litellm
    const baseUrl = litellmBaseUrl.replace(/\/$/, '') // Remove trailing slash
    // Try /models first, fallback to /v1/models for OpenAI compatibility
    let modelsUrl = `${baseUrl}/models`

    // Log the request (without sensitive data)
    console.log(`Fetching models from LiteLLM: ${modelsUrl}`)
    console.log(`API Key present: ${!!litellmApiKey}, length: ${litellmApiKey?.length || 0}`)

    // Make request exactly like curl - minimal headers, just Authorization
    // This matches: curl -H "Authorization: Bearer sk-1234" http://litellm.example.com/models
    let response = await fetch(modelsUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${litellmApiKey}`
      }
    })

    // If 403, try with API key in different formats
    if (response.status === 403) {
      console.log(`403 error, trying alternative authentication methods...`)

      // Try without Bearer prefix
      response = await fetch(modelsUrl, {
        method: 'GET',
        headers: {
          'Authorization': litellmApiKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; Cloudflare-Worker/1.0)',
          'Origin': baseUrl,
          'Referer': baseUrl
        }
      })

      // If still 403, try x-api-key header
      if (response.status === 403) {
        response = await fetch(modelsUrl, {
          method: 'GET',
          headers: {
            'x-api-key': litellmApiKey,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (compatible; Cloudflare-Worker/1.0)',
            'Origin': baseUrl,
            'Referer': baseUrl
          }
        })
      }

      // If still 403, try with api-key header (some LiteLLM configs use this)
      if (response.status === 403) {
        response = await fetch(modelsUrl, {
          method: 'GET',
          headers: {
            'api-key': litellmApiKey,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (compatible; Cloudflare-Worker/1.0)',
            'Origin': baseUrl,
            'Referer': baseUrl
          }
        })
      }

      // If still 403, try with both Authorization Bearer and x-api-key
      if (response.status === 403) {
        response = await fetch(modelsUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${litellmApiKey}`,
            'x-api-key': litellmApiKey,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (compatible; Cloudflare-Worker/1.0)',
            'Origin': baseUrl,
            'Referer': baseUrl
          }
        })
      }
    }

    // If /models returns 400/404, try /v1/models (OpenAI-compatible endpoint)
    if (!response.ok && (response.status === 400 || response.status === 404)) {
      console.log(`Trying /v1/models endpoint as fallback...`)
      modelsUrl = `${baseUrl}/v1/models`
      response = await fetch(modelsUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${litellmApiKey}`
        }
      })
    }

    if (!response.ok) {
      let errorText = ''
      let errorDetails = ''
      try {
        errorText = await response.text()
        // Try to parse as JSON for better error message
        try {
          const errorJson = JSON.parse(errorText)
          // Extract detailed error information
          errorDetails = errorJson.error?.message ||
                        errorJson.message ||
                        errorJson.detail ||
                        errorJson.error?.code ||
                        errorText

          // Include additional context for 403 errors
          if (response.status === 403) {
            const errorCode = errorJson.error?.code || errorJson.code || ''
            const errorType = errorJson.error?.type || errorJson.type || ''
            errorDetails = `403 Forbidden${errorCode ? ` (code: ${errorCode})` : ''}${errorType ? ` - ${errorType}` : ''}. ${errorDetails}`

            // Provide helpful suggestions for common 403 issues
            if (errorCode === '1003' || errorText.includes('1003')) {
              errorDetails += ' This may indicate: invalid API key, insufficient permissions, or IP restrictions. Please verify LiteLLM API key is correct and has proper permissions in Settings.'
            }
          }

          errorText = errorDetails
        } catch (e) {
          // Not JSON, use as-is
          errorDetails = errorText
          if (response.status === 403) {
            errorDetails = `403 Forbidden: ${errorText}. Please verify LiteLLM API key is correct and has proper permissions in Settings.`
          }
        }
      } catch (e) {
        errorText = `Status ${response.status}: ${response.statusText}`
        errorDetails = errorText
      }
      console.error(`LiteLLM API error (${response.status}) at ${modelsUrl}:`, errorDetails)
      console.error('Full error response:', errorText)

      // Return error response with proper JSON format
      return new Response(
        JSON.stringify({
          success: false,
          error: `Failed to fetch models from LiteLLM: ${errorDetails}`
        }),
        {
          status: response.status,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      )
    }

    // Check if response is JSON before parsing
    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) {
      const text = await response.text()
      throw new Error(`LiteLLM returned non-JSON response (${contentType}). Response: ${text.substring(0, 200)}`)
    }

    const data = await response.json() as unknown

    // Handle different response formats from LiteLLM
    // LiteLLM /models endpoint may return:
    // - { data: [{ id, ... }] } (OpenAI-compatible format)
    // - [{ id, ... }] (direct array)
    // - { models: [{ id, ... }] } (alternative format)
    let modelsArray: any[] = []

    if (Array.isArray(data)) {
      modelsArray = data
    } else if (typeof data === 'object' && data !== null) {
      const dataObj = data as Record<string, any>
      if (Array.isArray(dataObj.data)) {
        modelsArray = dataObj.data
      } else if (Array.isArray(dataObj.models)) {
        modelsArray = dataObj.models
      }
    }

    // Extract model IDs and format them
    // Provider can be extracted from model ID (e.g., "ollama-deepseek-v3.1" -> "ollama")
    const extractProvider = (modelId: string, ownedBy?: string): string => {
      if (ownedBy && ownedBy !== 'openai') {
        return ownedBy
      }
      // Extract provider from model ID prefix (e.g., "ollama-", "openrouter-", "claude-")
      const parts = modelId.split('-')
      if (parts.length > 1) {
        const provider = parts[0]
        // Map common prefixes to readable names
        const providerMap: Record<string, string> = {
          'ollama': 'Ollama',
          'openrouter': 'OpenRouter',
          'claude': 'Anthropic Claude',
          'cloudflare': 'Cloudflare',
          'qiniu': 'Qiniu',
          'siliconflow': 'SiliconFlow',
          'vercel': 'Vercel',
          'volcengine': 'VolcEngine',
          'cerebras': 'Cerebras'
        }
        return providerMap[provider.toLowerCase()] || provider
      }
      return ownedBy || 'unknown'
    }

    const models = modelsArray.map((model: any) => {
      const modelId = model.id || model.model_id || model.name || String(model)
      return {
        id: modelId,
        name: modelId,
        provider: extractProvider(modelId, model.owned_by || model.provider)
      }
    })

    return new Response(
      JSON.stringify({
        success: true,
        data: models
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    )
  } catch (error) {
    console.error('Error fetching models from LiteLLM:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch models from LiteLLM'
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    )
  }
}

async function handleProjects(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  try {
    // Check if Gerrit is configured
    if (!env.GERRIT_BASE_URL || !env.GERRIT_USERNAME || !env.GERRIT_PASSWORD) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Gerrit is not configured. Please set GERRIT_BASE_URL, GERRIT_USERNAME, and GERRIT_PASSWORD in environment variables.'
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      )
    }

    // Check cache first - try both Worker cache and KV cache
    const cacheKey = createCacheKey(request, env)
    const cache = (caches as any).default as Cache
    let cachedResponse = await cache.match(cacheKey)
    let cacheSource = 'worker'

    // If not in Worker cache, try KV cache (for longer persistence)
    if (!cachedResponse && env.PATCHX_KV) {
      const url = new URL(request.url)
      const kvKey = getCacheKeyString(url.pathname, url.search, env)
      try {
        const kvData = await env.PATCHX_KV.get(kvKey, 'json')
        if (kvData && typeof kvData === 'object' && 'data' in kvData && 'timestamp' in kvData) {
          const kvCache = kvData as { data: any; timestamp: number }
          const age = Date.now() - kvCache.timestamp
          // KV cache valid for 1 hour
          if (age < CACHE_TTL * 1000) {
            cachedResponse = new Response(JSON.stringify(kvCache.data), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            })
            cacheSource = 'kv'
          }
        }
      } catch (err) {
        console.warn('KV cache read error:', err)
      }
    }

    if (cachedResponse) {
      // Return cached response with CORS headers
      const cachedData = await cachedResponse.clone().json()
      return new Response(
        JSON.stringify(cachedData),
        {
          status: cachedResponse.status,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': `public, max-age=${CACHE_TTL}, s-maxage=${CACHE_TTL}`, // 1 hour, also cache at edge
            'X-Cache': `HIT-${cacheSource.toUpperCase()}`,
            ...corsHeaders
          }
        }
      )
    }

    // Parse query parameters for filtering options
    const url = new URL(request.url)
    const prefix = url.searchParams.get('prefix') || undefined
    const substring = url.searchParams.get('substring') || undefined
    const regex = url.searchParams.get('regex') || undefined
    const limit = url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!) : undefined
    const skip = url.searchParams.get('skip') ? parseInt(url.searchParams.get('skip')!) : undefined
    const all = url.searchParams.get('all') === 'true'
    const state = url.searchParams.get('state') as 'ACTIVE' | 'READ_ONLY' | 'HIDDEN' | undefined
    const type = url.searchParams.get('type') as 'ALL' | 'CODE' | 'PERMISSIONS' | undefined
    const description = url.searchParams.get('description') === 'true'

    const gerritService = new GerritService(env)
    const projects = await gerritService.getProjects({
      prefix,
      substring,
      regex,
      limit,
      skip,
      all,
      state,
      type,
      description
    })

    const responseData = {
      success: true,
      data: projects
    }

    // Create response with cache headers
    const response = new Response(
      JSON.stringify(responseData),
      {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': `public, max-age=${CACHE_TTL}, s-maxage=${CACHE_TTL}`, // 1 hour, also cache at edge
          'X-Cache': 'MISS',
          ...corsHeaders
        }
      }
    )

    // Store in both Worker cache and KV cache (async, don't wait)
    cache.put(cacheKey, response.clone()).catch(err => {
      console.error('Failed to cache projects response in Worker cache:', err)
    })

    // Also store in KV for longer persistence
    if (env.PATCHX_KV) {
      const url = new URL(request.url)
      const kvKey = getCacheKeyString(url.pathname, url.search, env)
      env.PATCHX_KV.put(kvKey, JSON.stringify({
        data: responseData,
        timestamp: Date.now()
      })).catch(err => {
        console.error('Failed to cache projects response in KV:', err)
      })
    }

    return response
  } catch (error) {
    console.error('Error fetching projects from Gerrit:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch projects from Gerrit'
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    )
  }
}

async function handleProjectBranches(
  path: string,
  env: Env,
  corsHeaders: Record<string, string>,
  request?: Request
): Promise<Response> {
  try {
    // Check if Gerrit is configured
    if (!env.GERRIT_BASE_URL || !env.GERRIT_USERNAME || !env.GERRIT_PASSWORD) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Gerrit is not configured. Please set GERRIT_BASE_URL, GERRIT_USERNAME, and GERRIT_PASSWORD in environment variables.'
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      )
    }

    // Extract project name from path: /api/projects/{project}/branches
    const pathMatch = path.match(/^\/api\/projects\/(.+)\/branches$/)
    if (!pathMatch || !pathMatch[1]) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid project path. Expected format: /api/projects/{project}/branches'
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      )
    }

    // Decode the project name (it's already URL encoded in the path)
    const projectName = decodeURIComponent(pathMatch[1])

    // Check cache first if request is available
    if (request) {
      const cacheKey = createCacheKey(request, env)
      const cache = (caches as any).default as Cache
      let cachedResponse = await cache.match(cacheKey)
      let cacheSource = 'worker'

      // If not in Worker cache, try KV cache
      if (!cachedResponse && env.PATCHX_KV) {
        const url = new URL(request.url)
        const kvKey = getCacheKeyString(url.pathname, url.search, env)
        try {
          const kvData = await env.PATCHX_KV.get(kvKey, 'json')
          if (kvData && typeof kvData === 'object' && 'data' in kvData && 'timestamp' in kvData) {
            const kvCache = kvData as { data: any; timestamp: number }
            const age = Date.now() - kvCache.timestamp
            // KV cache valid for 30 minutes for branches
            if (age < BRANCHES_CACHE_TTL * 1000) {
              cachedResponse = new Response(JSON.stringify(kvCache.data), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              })
              cacheSource = 'kv'
            }
          }
        } catch (err) {
          console.warn('KV cache read error:', err)
        }
      }

      if (cachedResponse) {
        // Return cached response with CORS headers
        const cachedData = await cachedResponse.clone().json()
        return new Response(
          JSON.stringify(cachedData),
          {
            status: cachedResponse.status,
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': `public, max-age=${BRANCHES_CACHE_TTL}, s-maxage=${BRANCHES_CACHE_TTL}`, // 30 minutes, also cache at edge
              'X-Cache': `HIT-${cacheSource.toUpperCase()}`,
              ...corsHeaders
            }
          }
        )
      }
    }

    const gerritService = new GerritService(env)
    const branches = await gerritService.getBranches(projectName)

    const responseData = {
      success: true,
      data: branches
    }

    // Create response with cache headers
    const response = new Response(
      JSON.stringify(responseData),
      {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': `public, max-age=${BRANCHES_CACHE_TTL}, s-maxage=${BRANCHES_CACHE_TTL}`, // 30 minutes, also cache at edge
          'X-Cache': 'MISS',
          ...corsHeaders
        }
      }
    )

    // Store in both Worker cache and KV cache if request is available (async, don't wait)
    if (request) {
      const cacheKey = createCacheKey(request, env)
      const cache = (caches as any).default as Cache
      cache.put(cacheKey, response.clone()).catch(err => {
        console.error('Failed to cache branches response in Worker cache:', err)
      })

      // Also store in KV for longer persistence
      if (env.PATCHX_KV) {
        const url = new URL(request.url)
        const kvKey = getCacheKeyString(url.pathname, url.search, env)
        env.PATCHX_KV.put(kvKey, JSON.stringify({
          data: responseData,
          timestamp: Date.now()
        })).catch(err => {
          console.error('Failed to cache branches response in KV:', err)
        })
      }
    }

    return response
  } catch (error) {
    console.error('Error fetching branches from Gerrit:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch branches from Gerrit'
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    )
  }
}

// Remote Node Management Handlers
async function handleGetNodes(env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  try {
    const db = getD1Database(env)

    // Get all nodes from D1
    const result = await queryD1<{
      id: string
      name: string
      host: string
      port: number
      username: string
      auth_type: string
      working_home: string | null
      ssh_service_api_url: string | null
      ssh_service_api_key: string | null
      created_at: string
      updated_at: string
    }>(
      db,
      'SELECT id, name, host, port, username, auth_type, working_home, ssh_service_api_url, ssh_service_api_key, created_at, updated_at FROM remote_nodes ORDER BY created_at DESC'
    )

    if (!result.success) {
      console.error('[GetNodes] Database query failed')
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Database query failed. Please ensure the database is initialized.',
          data: []
        }),
        {
          status: 200, // Return 200 with empty data so UI doesn't break
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      )
    }

    // Map D1 data to RemoteNode format
    const nodesList = (result.results || []).map((node) => ({
      id: node.id,
      name: node.name,
      host: node.host,
      port: node.port,
      username: node.username,
      authType: node.auth_type as 'key' | 'password',
      workingHome: node.working_home,
      sshServiceApiUrl: node.ssh_service_api_url,
      sshServiceApiKey: node.ssh_service_api_key,
      createdAt: node.created_at,
      updatedAt: node.updated_at
    }))

    return new Response(
      JSON.stringify({
        success: true,
        data: nodesList
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    )
  } catch (error) {
    console.error('Error fetching nodes:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch nodes'
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    )
  }
}

/**
 * Normalize and validate SSH key before saving to database
 * Ensures the key has both BEGIN and END markers and is properly formatted
 */
function normalizeSshKey(sshKey: string | undefined | null): string | null {
  if (!sshKey || typeof sshKey !== 'string') {
    return null
  }

  // Trim and normalize line endings
  let normalized = sshKey.trim()

  // Replace escaped newlines with actual newlines (in case key was stored with \n as text)
  normalized = normalized.replace(/\\n/g, '\n')

  // Normalize line endings: convert \r\n and \r to \n
  normalized = normalized.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  // Ensure the key ends with a newline
  if (!normalized.endsWith('\n')) {
    normalized = normalized + '\n'
  }

  // Validate that the key has both BEGIN and END markers
  const hasBegin = normalized.includes('BEGIN') && normalized.includes('PRIVATE KEY')
  const hasEnd = normalized.includes('END') && normalized.includes('PRIVATE KEY')

  if (!hasBegin || !hasEnd) {
    console.error('Invalid SSH key format: missing BEGIN or END markers', {
      hasBegin,
      hasEnd,
      keyLength: normalized.length,
      firstChars: normalized.substring(0, 50),
      lastChars: normalized.substring(Math.max(0, normalized.length - 50))
    })
    throw new Error('Invalid SSH key format: The key must include both BEGIN and END markers (e.g., -----BEGIN OPENSSH PRIVATE KEY----- ... -----END OPENSSH PRIVATE KEY-----)')
  }

  return normalized
}

async function handleCreateNode(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  try {
    console.log('[CreateNode] Starting node creation')
    const db = getD1Database(env)

    const body = await request.json() as {
      name: string
      host: string
      port: number
      username: string
      authType: 'key' | 'password'
      sshKey?: string
      password?: string
      workingHome?: string
      sshServiceApiUrl?: string
      sshServiceApiKey?: string
    }

    // Validate required fields
    if (!body.name || !body.host || !body.username) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing required fields: name, host, username'
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      )
    }

    if (body.authType === 'key' && !body.sshKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'SSH key is required when using key authentication'
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      )
    }

    if (body.authType === 'password' && !body.password) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Password is required when using password authentication'
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      )
    }

    // Generate UUID for the node
    const nodeId = generateUUID()
    const now = new Date().toISOString()

    // Normalize SSH key if provided
    let normalizedSshKey: string | null = null
    if (body.authType === 'key' && body.sshKey) {
      try {
        normalizedSshKey = normalizeSshKey(body.sshKey)
      } catch (error) {
        return new Response(
          JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : 'Invalid SSH key format'
          }),
          {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          }
        )
      }
    }

    // Insert node into D1
    const insertResult = await executeD1(
      db,
      `INSERT INTO remote_nodes (
        id, name, host, port, username, auth_type, ssh_key, password,
        working_home, ssh_service_api_url, ssh_service_api_key, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nodeId,
        body.name,
        body.host,
        body.port || 22,
        body.username,
        body.authType,
        normalizedSshKey,
        body.authType === 'password' ? body.password : null,
        body.workingHome ? body.workingHome.trim() : null,
        body.sshServiceApiUrl ? body.sshServiceApiUrl.trim() : null,
        body.sshServiceApiKey ? body.sshServiceApiKey.trim() : null,
        now,
        now
      ]
    )

    if (!insertResult.success) {
      console.error('D1 insert error:', insertResult)
      throw new Error('Failed to create node in database')
    }

    // Fetch the created node
    const node = await queryD1First<{
      id: string
      name: string
      host: string
      port: number
      username: string
      auth_type: string
      working_home: string | null
      ssh_service_api_url: string | null
      ssh_service_api_key: string | null
      created_at: string
      updated_at: string
    }>(
      db,
      'SELECT id, name, host, port, username, auth_type, working_home, ssh_service_api_url, ssh_service_api_key, created_at, updated_at FROM remote_nodes WHERE id = ?',
      [nodeId]
    )

    if (!node) {
      console.error('No node data returned from D1 insert')
      throw new Error('Failed to create node: No data returned from database')
    }

    // Map D1 data to RemoteNode format
    const safeNode = {
      id: node.id,
      name: node.name,
      host: node.host,
      port: node.port,
      username: node.username,
      authType: node.auth_type as 'key' | 'password',
      workingHome: node.working_home,
      sshServiceApiUrl: node.ssh_service_api_url,
      sshServiceApiKey: node.ssh_service_api_key,
      createdAt: node.created_at,
      updatedAt: node.updated_at
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: safeNode
      }),
      {
        status: 201,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    )
  } catch (error) {
    console.error('Error creating node:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create node'
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    )
  }
}

async function handleUpdateNode(path: string, request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  try {
    const db = getD1Database(env)

    const nodeId = path.split('/')[3] // /api/nodes/{id}
    if (!nodeId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Node ID is required'
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      )
    }

    // Check if node exists
    const existingNode = await queryD1First<{
      id: string
      name: string
      host: string
      port: number
      username: string
      auth_type: string
      ssh_key: string | null
      password: string | null
      working_home: string | null
      ssh_service_api_url: string | null
      ssh_service_api_key: string | null
      created_at: string
      updated_at: string
    }>(
      db,
      'SELECT * FROM remote_nodes WHERE id = ?',
      [nodeId]
    )

    if (!existingNode) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Node not found'
        }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      )
    }

    const body = await request.json() as {
      name?: string
      host?: string
      port?: number
      username?: string
      authType?: 'key' | 'password'
      sshKey?: string
      password?: string
      workingHome?: string
      sshServiceApiUrl?: string
      sshServiceApiKey?: string
    }

    // Build update SQL and parameters
    const updateFields: string[] = []
    const updateParams: any[] = []

    if (body.name !== undefined) {
      updateFields.push('name = ?')
      updateParams.push(body.name)
    }
    if (body.host !== undefined) {
      updateFields.push('host = ?')
      updateParams.push(body.host)
    }
    if (body.port !== undefined) {
      updateFields.push('port = ?')
      updateParams.push(body.port)
    }
    if (body.username !== undefined) {
      updateFields.push('username = ?')
      updateParams.push(body.username)
    }
    if (body.authType !== undefined) {
      updateFields.push('auth_type = ?')
      updateParams.push(body.authType)
    }
    if (body.workingHome !== undefined) {
      updateFields.push('working_home = ?')
      updateParams.push(body.workingHome ? body.workingHome.trim() : null)
    }
    if (body.sshServiceApiUrl !== undefined) {
      updateFields.push('ssh_service_api_url = ?')
      updateParams.push(body.sshServiceApiUrl ? body.sshServiceApiUrl.trim() : null)
    }
    if (body.sshServiceApiKey !== undefined) {
      updateFields.push('ssh_service_api_key = ?')
      updateParams.push(body.sshServiceApiKey ? body.sshServiceApiKey.trim() : null)
    }

    // Handle authentication credentials
    if (body.authType === 'key') {
      if (body.sshKey !== undefined) {
        // Normalize SSH key before saving
        try {
          const normalizedSshKey = normalizeSshKey(body.sshKey)
          updateFields.push('ssh_key = ?')
          updateParams.push(normalizedSshKey)
        } catch (error) {
          return new Response(
            JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : 'Invalid SSH key format'
            }),
            {
              status: 400,
              headers: {
                'Content-Type': 'application/json',
                ...corsHeaders
              }
            }
          )
        }
      }
      updateFields.push('password = ?')
      updateParams.push(null) // Clear password when switching to key auth
    } else if (body.authType === 'password') {
      if (body.password !== undefined && body.password !== '') {
        updateFields.push('password = ?')
        updateParams.push(body.password)
      } else if (body.password === '' && existingNode.password) {
        // Keep existing password if empty string provided
        updateFields.push('password = ?')
        updateParams.push(existingNode.password)
      }
      updateFields.push('ssh_key = ?')
      updateParams.push(null) // Clear SSH key when switching to password auth
    } else if (body.sshKey !== undefined) {
      // Normalize SSH key before saving
      try {
        const normalizedSshKey = normalizeSshKey(body.sshKey)
        updateFields.push('ssh_key = ?')
        updateParams.push(normalizedSshKey)
      } catch (error) {
        return new Response(
          JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : 'Invalid SSH key format'
          }),
          {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          }
        )
      }
    } else if (body.password !== undefined && body.password !== '') {
      updateFields.push('password = ?')
      updateParams.push(body.password)
    }

    // Always update updated_at
    updateFields.push('updated_at = ?')
    updateParams.push(new Date().toISOString())
    updateParams.push(nodeId) // For WHERE clause

    // Update node in D1
    const updateResult = await executeD1(
      db,
      `UPDATE remote_nodes SET ${updateFields.join(', ')} WHERE id = ?`,
      updateParams
    )

    if (!updateResult.success) {
      throw new Error('Failed to update node in database')
    }

    // Fetch the updated node
    const updatedNode = await queryD1First<{
      id: string
      name: string
      host: string
      port: number
      username: string
      auth_type: string
      working_home: string | null
      ssh_service_api_url: string | null
      ssh_service_api_key: string | null
      created_at: string
      updated_at: string
    }>(
      db,
      'SELECT id, name, host, port, username, auth_type, working_home, ssh_service_api_url, ssh_service_api_key, created_at, updated_at FROM remote_nodes WHERE id = ?',
      [nodeId]
    )

    if (!updatedNode) {
      throw new Error('Failed to fetch updated node')
    }

    // Map D1 data to RemoteNode format
    const safeNode = {
      id: updatedNode.id,
      name: updatedNode.name,
      host: updatedNode.host,
      port: updatedNode.port,
      username: updatedNode.username,
      authType: updatedNode.auth_type,
      workingHome: updatedNode.working_home,
      sshServiceApiUrl: updatedNode.ssh_service_api_url,
      sshServiceApiKey: updatedNode.ssh_service_api_key,
      createdAt: updatedNode.created_at,
      updatedAt: updatedNode.updated_at
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: safeNode
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    )
  } catch (error) {
    console.error('Error updating node:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update node'
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    )
  }
}

async function handleDeleteNode(path: string, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  try {
    const db = getD1Database(env)

    const nodeId = path.split('/')[3] // /api/nodes/{id}
    if (!nodeId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Node ID is required'
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      )
    }

    // Delete node from D1
    const deleteResult = await executeD1(
      db,
      'DELETE FROM remote_nodes WHERE id = ?',
      [nodeId]
    )

    if (!deleteResult.success) {
      throw new Error('Failed to delete node from database')
    }

    return new Response(
      JSON.stringify({
        success: true
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    )
  } catch (error) {
    console.error('Error deleting node:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete node'
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    )
  }
}

const sshBannerEncoder = new TextEncoder()
const sshBannerDecoder = new TextDecoder()

// Helper to read SSH packet (simplified - assumes unencrypted for initial handshake)
async function readSSHPacket(reader: ReadableStreamDefaultReader<Uint8Array>, timeoutMs = 10000): Promise<Uint8Array> {
  const readResult = await Promise.race([
    reader.read(),
    new Promise<{ value?: Uint8Array; done?: boolean }>((_, reject) =>
      setTimeout(() => reject(new Error('Timeout reading SSH packet')), timeoutMs)
    )
  ])

  if (readResult.done || !readResult.value) {
    throw new Error('No data received from SSH server')
  }

  return readResult.value
}

// Helper to write SSH packet
async function writeSSHPacket(writer: WritableStreamDefaultWriter<Uint8Array>, data: Uint8Array): Promise<void> {
  await writer.write(data)
}

async function performSshConnectionTest(host: string, port: number, timeoutMs = 8000): Promise<{ banner: string; latencyMs: number }> {
  if (!host) {
    throw new Error('Host is required')
  }

  const targetPort = Number.isFinite(port) ? port : 22

  if (typeof connect !== 'function') {
    throw new Error('SSH testing is not supported in this runtime')
  }

  const startedAt = Date.now()
  const socket = connect({ hostname: host, port: targetPort })

  const timeoutId = setTimeout(() => {
    try {
      socket.close()
    } catch (closeError) {
      console.warn('Failed to close SSH socket after timeout:', closeError)
    }
  }, timeoutMs)

  try {
    // Send a client identification string to prompt the server banner
    const writer = socket.writable.getWriter()
    await writer.write(sshBannerEncoder.encode('SSH-2.0-PatchX\r\n'))
    writer.releaseLock()

    const reader = socket.readable.getReader()
    const readResult = await Promise.race([
      reader.read(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timed out waiting for SSH banner')), timeoutMs))
    ]) as { value?: Uint8Array; done?: boolean }
    reader.releaseLock()

    if (!readResult || readResult.done || !readResult.value || readResult.value.length === 0) {
      throw new Error('No response from SSH server')
    }

    const banner = sshBannerDecoder.decode(readResult.value).trim()
    if (!banner.startsWith('SSH-')) {
      throw new Error(`Unexpected response from server: ${banner || '<empty>'}`)
    }

    return { banner, latencyMs: Date.now() - startedAt }
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Failed to read SSH banner')
  } finally {
    clearTimeout(timeoutId)
    try {
      socket.close()
    } catch (closeError) {
      console.warn('Failed to close SSH socket:', closeError)
    }
  }
}

/**
 * Execute an SSH command on a remote host
 * Uses SSH service API if available, otherwise attempts direct execution
 */
async function executeSSHCommand(
  host: string,
  port: number,
  username: string,
  authType: 'key' | 'password',
  sshKey: string | undefined,
  password: string | undefined,
  command: string,
  sshServiceApiUrl?: string,
  sshServiceApiKey?: string,
  timeoutMs = 15000
): Promise<{ success: boolean; output: string; error?: string }> {
  // Check for SSH service API endpoint (if configured in node data)
  if (sshServiceApiUrl) {
    // Trim whitespace from URL and API key
    const trimmedUrl = sshServiceApiUrl.trim()
    const trimmedApiKey = sshServiceApiKey?.trim()

    if (!trimmedUrl) {
      return { success: false, output: '', error: 'SSH service API URL is empty' }
    }

    try {

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

      // Build headers with optional Authorization header if API key is provided
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'Cloudflare-Worker/1.0'
      }
      if (trimmedApiKey) {
        headers['Authorization'] = `Bearer ${trimmedApiKey}`
      }

      // Normalize the URL - remove trailing slashes
      const apiUrl = trimmedUrl.replace(/\/+$/, '')
      const response = await fetch(`${apiUrl}/execute`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          host,
          port,
          username,
          authType,
          sshKey,
          password,
          command
        }),
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`
        try {
          const errorData = await response.json() as { error?: string; message?: string }
          errorMessage = errorData.error || errorData.message || errorMessage
        } catch {
          // If JSON parsing fails, try to get text and clean HTML if present
          try {
            const text = await response.text()
            if (text) {
              // Check if response is HTML (common for nginx/404 errors)
              if (text.trim().startsWith('<') || text.includes('<html>') || text.includes('<!DOCTYPE')) {
                // Extract meaningful error from HTML (e.g., title tag or h1)
                const titleMatch = text.match(/<title[^>]*>([^<]+)<\/title>/i)
                const h1Match = text.match(/<h1[^>]*>([^<]+)<\/h1>/i)
                if (titleMatch) {
                  errorMessage = titleMatch[1].trim()
                } else if (h1Match) {
                  errorMessage = h1Match[1].trim()
                } else {
                  // Fallback: use status text
                  errorMessage = `HTTP ${response.status}: ${response.statusText}`
                }
              } else {
                errorMessage = text
              }
            }
          } catch {
            // Use default error message
          }
        }

        // Provide more helpful error messages for common HTTP status codes
        if (response.status === 401) {
          errorMessage = `Authentication failed (401). Please check that your SSH Service API Key is correct and matches the API_KEY configured on the SSH service.`
        } else if (response.status === 403) {
          errorMessage = `Access forbidden (403). This may indicate: 1) The API key is incorrect or missing, 2) A reverse proxy or firewall is blocking the request, 3) The SSH service API URL is incorrect. Please verify your SSH Service API URL and API Key configuration.`
        } else if (response.status === 404) {
          // Provide concise error message for 404 errors
          const urlObj = new URL(apiUrl)
          const baseUrlOnly = urlObj.origin
          const executeUrl = `${apiUrl}/execute`
          errorMessage = `Endpoint not found (404): "${executeUrl}" was not found. Base URL: ${baseUrlOnly}. Check service health at ${baseUrlOnly}/api/ssh/health and verify nginx reverse proxy configuration.`
        } else if (response.status >= 500) {
          errorMessage = `Server error (${response.status}). The SSH service API may be experiencing issues. Please check the service logs.`
        }

        return { success: false, output: '', error: errorMessage }
      }

      const result = await response.json() as { success: boolean; output?: string; error?: string }
      return {
        success: result.success,
        output: result.output || '',
        error: result.error
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return { success: false, output: '', error: 'SSH command execution timed out' }
      }
      if (error instanceof Error) {
        // Provide more specific error messages
        if (error.message.includes('fetch failed') || error.message.includes('Failed to fetch')) {
          return {
            success: false,
            output: '',
            error: `Cannot connect to SSH service API at ${trimmedUrl}. Check if the service is running and the URL is correct.`
          }
        }
        return {
          success: false,
          output: '',
          error: `Failed to execute SSH command via service: ${error.message}`
        }
      }
      return {
        success: false,
        output: '',
        error: 'Failed to execute SSH command via service: Unknown error'
      }
    }
  }

  // Fallback to direct execution (limited functionality)
  return await executeSSHCommandDirect(
    host,
    port,
    username,
    authType,
    sshKey,
    password,
    command,
    timeoutMs
  )
}

/**
 * Verify that a working home directory exists and is accessible on the remote node
 * Uses SSH commands (cd and pwd) to verify the directory
 */
async function verifyWorkingHomeDirectory(
  host: string,
  port: number,
  username: string,
  authType: 'key' | 'password',
  sshKey: string | undefined,
  password: string | undefined,
  workingHome: string | undefined,
  sshServiceApiUrl?: string,
  sshServiceApiKey?: string,
  timeoutMs = 10000
): Promise<{ exists: boolean; message: string }> {
  if (!workingHome || !workingHome.trim()) {
    return { exists: true, message: 'Working home not specified (optional)' }
  }

  if (!sshServiceApiUrl) {
    return { exists: false, message: 'SSH service API URL not configured. Cannot verify working home directory.' }
  }

  const workingHomePath = workingHome.trim()

  // Basic path validation
  if (!workingHomePath.startsWith('/')) {
    return { exists: false, message: `Invalid path: working home must be an absolute path (start with /)` }
  }

  // Execute SSH command to verify directory exists and is accessible
  // Use: ls command to check if the directory exists and is accessible
  const verifyCommand = `ls -d "${workingHomePath}" 2>&1`

  const result = await executeSSHCommand(
    host,
    port,
    username,
    authType,
    sshKey,
    password,
    verifyCommand,
    sshServiceApiUrl,
    sshServiceApiKey,
    timeoutMs
  )

  if (!result.success) {
    // If SSH command execution failed, check if it's because SSH protocol isn't fully implemented
    if (result.error?.includes('SSH protocol implementation')) {
      return {
        exists: false,
        message: `Directory verification requires SSH command execution. ${result.error}`
      }
    }
    return {
      exists: false,
      message: `Directory verification failed: ${result.error || 'Unknown error'}`
    }
  }

  const output = result.output.trim()

  // If ls command succeeded, the output should be the directory path
  // If it failed, there will be an error message in the output
  if (output === workingHomePath) {
    return {
      exists: true,
      message: `Directory verified: ${workingHomePath} exists and is accessible`
    }
  }

  // Check for common error messages
  if (output.includes('No such file or directory') || output.includes('cannot access')) {
    return {
      exists: false,
      message: `Directory does not exist: ${workingHomePath}`
    }
  }

  // If we got output but it's not the expected path, the directory might exist but have issues
  if (output.length > 0) {
    return {
      exists: false,
      message: `Directory verification failed: ${output}`
    }
  }

  // No output - directory might not exist
  return {
    exists: false,
    message: `Directory verification failed: No output from ls command. Directory may not exist: ${workingHomePath}`
  }
}

async function handleTestNode(path: string, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  try {
    const db = getD1Database(env)

    const nodeId = path.split('/')[3] // /api/nodes/{id}/test
    if (!nodeId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Node ID is required'
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      )
    }

    // Fetch node from D1 (including sensitive data for testing)
    const node = await queryD1First<{
      id: string
      name: string
      host: string
      port: number
      username: string
      auth_type: string
      ssh_key: string | null
      password: string | null
      working_home: string | null
      ssh_service_api_url: string | null
      ssh_service_api_key: string | null
      created_at: string
      updated_at: string
    }>(
      db,
      'SELECT * FROM remote_nodes WHERE id = ?',
      [nodeId]
    )

    if (!node) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Node not found'
        }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      )
    }

    // Map D1 data to RemoteNodeData format
    const nodeData: RemoteNodeData = {
      id: node.id,
      name: node.name,
      host: node.host,
      port: node.port,
      username: node.username,
      authType: node.auth_type as 'key' | 'password',
      sshKey: node.ssh_key || undefined,
      password: node.password || undefined,
      workingHome: node.working_home || undefined,
      sshServiceApiUrl: node.ssh_service_api_url || undefined,
      sshServiceApiKey: node.ssh_service_api_key || undefined,
      createdAt: node.created_at,
      updatedAt: node.updated_at
    }

    if (!nodeData.host || !nodeData.username) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid node configuration'
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      )
    }

    if (nodeData.authType === 'key' && !nodeData.sshKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'SSH key is missing'
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      )
    }

    if (nodeData.authType === 'password' && !nodeData.password) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Password is missing'
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      )
    }

    const { banner, latencyMs } = await performSshConnectionTest(nodeData.host, nodeData.port || 22)

    let message = `SSH reachable. Banner: ${banner}. Latency: ${latencyMs}ms`

    // Note: Working home verification is skipped in connection test
    // as it requires full SSH protocol implementation for command execution

    return new Response(
      JSON.stringify({
        success: true,
        message
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    )
  } catch (error) {
    console.error('Error testing node:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to test node connection'
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    )
  }
}

async function handleTestNodeConfig(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  try {
    const body = await request.json() as {
      name?: string
      host?: string
      port?: number
      username?: string
      authType?: 'key' | 'password'
      sshKey?: string
      password?: string
      workingHome?: string
      sshServiceApiUrl?: string
      sshServiceApiKey?: string
    }

    if (!body.host || !body.username || !body.authType) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Host, username, and authentication type are required'
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      )
    }

    if (body.authType === 'key' && !body.sshKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'SSH key is required for key authentication'
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      )
    }

    if (body.authType === 'password' && !body.password) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Password is required for password authentication'
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      )
    }

    let banner: string
    let latencyMs: number

    try {
      const result = await performSshConnectionTest(body.host, body.port || 22)
      banner = result.banner
      latencyMs = result.latencyMs
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      throw new Error(`SSH connection test failed: ${errorMsg}. Please check that the host (${body.host}:${body.port || 22}) is reachable and the SSH service is running.`)
    }

    let message = `SSH reachable. Banner: ${banner}. Latency: ${latencyMs}ms`

    // Test working home directory if provided and SSH service is available
    const trimmedSshServiceApiUrl = body.sshServiceApiUrl?.trim()
    if (body.workingHome && trimmedSshServiceApiUrl) {
      try {
        const dirVerification = await verifyWorkingHomeDirectory(
          body.host,
          body.port || 22,
          body.username,
          body.authType,
          body.sshKey,
          body.password,
          body.workingHome,
          trimmedSshServiceApiUrl,
          body.sshServiceApiKey?.trim()
        )

        if (dirVerification.exists) {
          message += `. Working home verified: ${dirVerification.message}`
        } else {
          message += `. Working home verification failed: ${dirVerification.message}`
        }
      } catch (error) {
        message += `. Working home verification error: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    } else if (body.workingHome) {
      message += `. Working home configured: ${body.workingHome} (verification requires SSH Service API URL)`
    }

    return new Response(
      JSON.stringify({
        success: true,
        message
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    )
  } catch (error) {
    console.error('Error testing node config:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to test node configuration'
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        message: errorMessage
      }),
      {
        status: 200, // Return 200 so frontend can read the error message
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    )
  }
}

async function handleTestEmail(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  try {
    // Parse request body
    const body = await request.json() as { email?: string }
    const testEmail = body?.email?.trim()

    if (!testEmail) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Email address is required'
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i
    if (!emailRegex.test(testEmail)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid email address format'
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      )
    }

    // Check if Resend is configured (preferred method)
    const useResend = !!(env.RESEND_API_KEY && env.RESEND_FROM_EMAIL)
    const fromEmail = env.RESEND_FROM_EMAIL || env.MAILCHANNELS_FROM_EMAIL
    const fromName = env.RESEND_FROM_NAME || env.MAILCHANNELS_FROM_NAME || 'PatchX'

    if (!fromEmail) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'RESEND_FROM_EMAIL or MAILCHANNELS_FROM_EMAIL is not configured'
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      )
    }

    // Use Resend if configured
    if (useResend) {
      const testText = `This is a test email from PatchX to verify your email configuration.

Configuration Details:
- From Email: ${fromEmail}
- From Name: ${fromName}

If you received this email, your email configuration is working correctly!`

      const testHtml = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6;">
          <h2 style="color: #2563eb;">Email Configuration Test</h2>
          <p>This is a test email from PatchX to verify your email configuration.</p>
          <div style="background-color: #f1f5f9; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <h3 style="margin-top: 0; color: #475569;">Configuration Details:</h3>
            <table style="border-collapse: collapse;">
              <tr>
                <td style="padding: 6px 12px; font-weight: bold; color: #475569;">From Email:</td>
                <td style="padding: 6px 12px; color: #0f172a;">${fromEmail}</td>
              </tr>
              <tr>
                <td style="padding: 6px 12px; font-weight: bold; color: #475569;">From Name:</td>
                <td style="padding: 6px 12px; color: #0f172a;">${fromName}</td>
              </tr>
            </table>
          </div>
          <p style="color: #16a34a; font-weight: bold;">✓ If you received this email, your email configuration is working correctly!</p>
          <p style="margin-top: 24px; color: #64748b; font-size: 12px;">
            This email was sent automatically by PatchX.
          </p>
        </div>
      `

      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${env.RESEND_API_KEY}`
          },
          body: JSON.stringify({
            from: `${fromName} <${fromEmail}>`,
            to: testEmail,
            subject: '[PatchX] Email Configuration Test',
            text: testText,
            html: testHtml
          })
        })

        if (!response.ok) {
          const errorText = await response.text()
          console.error('Failed to send test email via Resend:', response.status, errorText)

          let errorMessage = `Failed to send test email via Resend: ${response.status}`
          try {
            const errorJson = JSON.parse(errorText)
            if (errorJson.message) {
              errorMessage = `Resend error: ${errorJson.message}`
            }
          } catch {
            errorMessage = `Failed to send test email via Resend: ${response.status} ${errorText.substring(0, 200)}`
          }

          return new Response(
            JSON.stringify({
              success: false,
              error: errorMessage
            }),
            {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
                ...corsHeaders
              }
            }
          )
        }

        return new Response(
          JSON.stringify({
            success: true,
            message: `Test email sent successfully to ${testEmail} via Resend`
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          }
        )
      } catch (error) {
        console.error('Error sending test email via Resend:', error)
        return new Response(
          JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to send test email via Resend'
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          }
        )
      }
    }

    // Fall back to MailChannels API
    const endpoint = env.MAILCHANNELS_API_ENDPOINT || 'https://api.mailchannels.net/tx/v1/send'

    const payload = {
      personalizations: [
        {
          to: [{ email: testEmail }]
        }
      ],
      from: {
        email: fromEmail,
        name: fromName
      },
      subject: '[PatchX] Email Configuration Test',
      content: [
        {
          type: 'text/plain',
          value: `This is a test email from PatchX to verify your email configuration.

Configuration Details:
- From Email: ${fromEmail}
- From Name: ${fromName}
- API Endpoint: ${endpoint}

If you received this email, your MailChannels configuration is working correctly!`
        },
        {
          type: 'text/html',
          value: `
            <div style="font-family: Arial, sans-serif; line-height: 1.6;">
              <h2 style="color: #2563eb;">Email Configuration Test</h2>
              <p>This is a test email from PatchX to verify your email configuration.</p>
              <div style="background-color: #f1f5f9; padding: 16px; border-radius: 8px; margin: 16px 0;">
                <h3 style="margin-top: 0; color: #475569;">Configuration Details:</h3>
                <table style="border-collapse: collapse;">
                  <tr>
                    <td style="padding: 6px 12px; font-weight: bold; color: #475569;">From Email:</td>
                    <td style="padding: 6px 12px; color: #0f172a;">${fromEmail}</td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 12px; font-weight: bold; color: #475569;">From Name:</td>
                    <td style="padding: 6px 12px; color: #0f172a;">${fromName}</td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 12px; font-weight: bold; color: #475569;">API Endpoint:</td>
                    <td style="padding: 6px 12px; color: #0f172a;">${endpoint}</td>
                  </tr>
                </table>
              </div>
              <p style="color: #16a34a; font-weight: bold;">✓ If you received this email, your MailChannels configuration is working correctly!</p>
              <p style="margin-top: 24px; color: #64748b; font-size: 12px;">
                This email was sent automatically by PatchX.
              </p>
            </div>
          `
        }
      ],
      ...(env.MAILCHANNELS_REPLY_TO_EMAIL
        ? {
            reply_to: {
              email: env.MAILCHANNELS_REPLY_TO_EMAIL,
              name: fromName
            }
          }
        : {})
    }

    // Send test email
    // Note: MailChannels may require authentication depending on your plan
    // If you get 401 errors, you may need to add API key authentication
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }

    // Add API key if configured (for MailChannels paid plans)
    if (env.MAILCHANNELS_API_KEY) {
      headers['Authorization'] = `Bearer ${env.MAILCHANNELS_API_KEY}`
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Failed to send test email:', response.status, errorText)

      // Provide helpful error messages
      let errorMessage = `Failed to send test email: ${response.status}`
      if (response.status === 401) {
        errorMessage = 'Authentication required. MailChannels may require an API key. Please check your MailChannels configuration and ensure MAILCHANNELS_API_KEY is set if using a paid plan.'
      } else if (response.status === 403) {
        errorMessage = 'Access forbidden. Please verify your MailChannels account and API key permissions.'
      } else {
        // Try to extract meaningful error from response
        try {
          const errorJson = JSON.parse(errorText)
          if (errorJson.errors && Array.isArray(errorJson.errors)) {
            errorMessage = `MailChannels error: ${errorJson.errors.map((e: any) => e.message || e).join(', ')}`
          } else if (errorJson.message) {
            errorMessage = `MailChannels error: ${errorJson.message}`
          } else {
            errorMessage = `Failed to send test email: ${response.status} ${errorText.substring(0, 200)}`
          }
        } catch {
          // If not JSON, use the text as-is (truncated)
          errorMessage = `Failed to send test email: ${response.status} ${errorText.substring(0, 200)}`
        }
      }

      return new Response(
        JSON.stringify({
          success: false,
          error: errorMessage
        }),
        {
          status: 200, // Return 200 so frontend can display the error message
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Test email sent successfully to ${testEmail}`
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    )
  } catch (error) {
    console.error('Error sending test email:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send test email'
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    )
  }
}

/**
 * Handle git clone request
 * POST /api/git/clone
 *
 * Request body:
 * {
 *   "nodeId": "string",           // Remote node ID (required)
 *   "repositoryUrl": "string",    // Target Project - Git repository URL (required)
 *   "branch": "string",            // Target Branch to clone (required)
 *   "targetDir": "string"         // Optional target directory name (auto-generated if not provided)
 * }
 *
 * Response:
 * {
 *   "success": boolean,
 *   "data": {
 *     "targetDir": "string",      // Full path to cloned repository
 *     "output": "string"           // Command output
 *   },
 *   "error": "string"              // Error message if failed
 * }
 */
async function handleGitClone(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  try {
    const body = await request.json() as {
      nodeId?: string
      repositoryUrl?: string
      branch?: string
      targetDir?: string
    }

    // Validate required fields
    if (!body.nodeId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'nodeId (Remote Node ID) is required'
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      )
    }

    if (!body.repositoryUrl) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'repositoryUrl (Target Project) is required'
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      )
    }

    if (!body.branch) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'branch (Target Branch) is required'
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      )
    }

    // Initialize GitService
    const gitService = new GitService(env)

    // Clone the repository
    // The cloneRepository method uses:
    // - Remote Node configuration (Host, Port, Username, Working Home, SSH API, SSH API Key, SSH password or SSH Private Key)
    // - Target Project (repositoryUrl)
    // - Target Branch (branch)
    console.log(`[API] Git Clone Request - Node: ${body.nodeId}, Repo: ${body.repositoryUrl}, Branch: ${body.branch}`)
    const result = await gitService.cloneRepository(
      body.nodeId,
      body.repositoryUrl,
      body.branch,
      body.targetDir
    )

    if (result.success) {
      console.log(`[API] Git Clone Success - Target Dir: ${result.targetDir || 'Unknown'}`)
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            targetDir: result.targetDir || 'Unknown',
            output: result.output
          }
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      )
    } else {
      console.error(`[API] Git Clone Failed - Error: ${result.error || 'Unknown error'}`)
      return new Response(
        JSON.stringify({
          success: false,
          error: result.error || 'Failed to clone repository',
          data: {
            output: result.output
          }
        }),
        {
          status: 200, // Return 200 so frontend can display the error message
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      )
    }
  } catch (error) {
    console.error('Error cloning git repository:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to clone git repository'
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    )
  }
}

async function handleGetSettings(env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  try {
    const db = getD1Database(env)

    // Get all settings from database
    const result = await queryD1<{ key: string; value: string | null }>(
      db,
      'SELECT key, value FROM app_settings'
    )

    // Handle case where table doesn't exist yet
    if (!result.success) {
      console.log('app_settings table does not exist yet, returning empty settings')
      return new Response(
        JSON.stringify({
          success: true,
          data: {}
        }),
        {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      )
    }

    // Convert settings array to object
    // Always return an object, even if empty (no settings configured yet)
    const settingsMap: Record<string, string> = {}
    if (result.results && Array.isArray(result.results)) {
      for (const setting of result.results) {
        settingsMap[setting.key] = setting.value || ''
      }
    }

    // Always return success with data, even if empty
    return new Response(
      JSON.stringify({
        success: true,
        data: settingsMap
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    )
  } catch (error) {
    console.error('Error in handleGetSettings:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get settings'
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    )
  }
}

async function handleUpdateSettings(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  try {
    console.log('handleUpdateSettings called')
    const db = getD1Database(env)

    // Parse request body with better error handling
    let body: Record<string, string>
    try {
      const bodyText = await request.text()
      console.log('Settings update body text:', bodyText.substring(0, 200))
      if (!bodyText || bodyText.trim().length === 0) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Request body is empty'
          }),
          {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          }
        )
      }
      body = JSON.parse(bodyText) as Record<string, string>
    } catch (parseError) {
      console.error('Error parsing request body:', parseError)
      return new Response(
        JSON.stringify({
          success: false,
          error: `Invalid JSON in request body: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      )
    }

    console.log('Settings update body keys:', Object.keys(body))
    console.log('Settings update body values:', Object.values(body).map(v => typeof v === 'string' ? v.substring(0, 20) + '...' : String(v)))

    // Validate that we have settings to update
    if (!body || Object.keys(body).length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'No settings provided to update'
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      )
    }

    // Validate required settings
    if (body.litellm_base_url !== undefined && (!body.litellm_base_url || typeof body.litellm_base_url !== 'string' || !body.litellm_base_url.trim())) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'LiteLLM base URL is required'
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      )
    }

    if (body.litellm_api_key !== undefined && (!body.litellm_api_key || typeof body.litellm_api_key !== 'string' || !body.litellm_api_key.trim())) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'LiteLLM API key is required'
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      )
    }

    if (body.litellm_model !== undefined && (!body.litellm_model || typeof body.litellm_model !== 'string' || !body.litellm_model.trim())) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'LiteLLM model name is required'
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      )
    }

    // Update or insert each setting
    for (const [key, value] of Object.entries(body)) {
      // Skip empty or non-string values
      if (!value || typeof value !== 'string') {
        console.log(`Skipping setting ${key}: value is empty or not a string`)
        continue
      }

      const trimmedValue = value.trim()
      if (!trimmedValue) {
        console.log(`Skipping setting ${key}: value is empty after trimming`)
        continue
      }

      console.log(`Upserting setting: key=${key}, value=${trimmedValue.substring(0, 20)}...`)

      // Check if setting already exists
      const existingSetting = await queryD1First<{ key: string; value: string | null }>(
        db,
        'SELECT key, value FROM app_settings WHERE key = ?',
        [key]
      )

      if (existingSetting) {
        // Update existing setting
        console.log(`Updating existing setting: ${key}`)
        const updateResult = await executeD1(
          db,
          'UPDATE app_settings SET value = ?, updated_at = ? WHERE key = ?',
          [trimmedValue, new Date().toISOString(), key]
        )

        if (!updateResult.success) {
          console.error(`Error updating setting ${key}`)
          throw new Error(`Failed to update setting ${key}`)
        } else {
          console.log(`Successfully updated setting: ${key}`)
        }
      } else {
        // Insert new setting
        console.log(`Inserting new setting: ${key}`)
        const settingId = generateUUID()
        const now = new Date().toISOString()
        const insertResult = await executeD1(
          db,
          'INSERT INTO app_settings (id, key, value, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
          [settingId, key, trimmedValue, now, now]
        )

        if (!insertResult.success) {
          console.error(`Error inserting setting ${key}`)
          throw new Error(`Failed to insert setting ${key}`)
        } else {
          console.log(`Successfully inserted setting: ${key}`)
        }
      }
    }

    console.log('Settings updated successfully:', Object.keys(body).join(', '))

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Settings updated successfully'
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    )
  } catch (error) {
    console.error('Error in handleUpdateSettings:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update settings'
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    )
  }
}

async function handleTestLiteLLM(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  try {
    const body = await request.json() as { litellm_base_url?: string; litellm_api_key?: string; litellm_model?: string }

    const litellmBaseUrl = body.litellm_base_url?.trim() || ''
    const litellmApiKey = body.litellm_api_key?.trim() || ''
    const litellmModel = body.litellm_model?.trim() || ''

    if (!litellmBaseUrl || !litellmApiKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Base URL and API Key are required for testing'
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      )
    }

    // Test connection by making a chat completion request (more reliable than /models)
    let baseUrl = litellmBaseUrl.replace(/\/$/, '') // Remove trailing slash

    // Determine the chat completions endpoint
    // Check if base URL already includes /chat/completions
    let chatUrl = baseUrl
    const urlObj = new URL(baseUrl)
    const hasPath = urlObj.pathname && urlObj.pathname !== '/'
    const hasChatCompletions = baseUrl.toLowerCase().includes('/chat/completions')

    if (hasChatCompletions) {
      // Base URL already includes /chat/completions, use as-is
      chatUrl = baseUrl
      console.log('Using base URL as-is (contains /chat/completions):', chatUrl)
    } else if (hasPath) {
      // Base URL has a path (like /openai), append /chat/completions
      chatUrl = `${baseUrl}/chat/completions`
      console.log('Appending /chat/completions to base URL with path:', chatUrl)
    } else {
      // No path, try common chat completions endpoints
      // First try /openai/chat/completions (common LiteLLM pattern)
      chatUrl = `${baseUrl}/openai/chat/completions`
      console.log('Using /openai/chat/completions pattern:', chatUrl)
    }

    // Use a simple test message
    const testModel = litellmModel || 'gpt-3.5-turbo' // Fallback model for testing
    const testPayload = {
      model: testModel,
      messages: [
        {
          role: 'user',
          content: 'Hello'
        }
      ],
      max_tokens: 10 // Minimal response for testing
    }

    // Try chat completions with Bearer token (most common)
    let response = await fetch(chatUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${litellmApiKey}`
      },
      body: JSON.stringify(testPayload)
    })

    // If 404, try alternative endpoints
    if (response.status === 404) {
      if (hasPath && !hasChatCompletions) {
        // Base URL has a path but not /chat/completions, try /v1/chat/completions
        chatUrl = `${baseUrl}/v1/chat/completions`
        response = await fetch(chatUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${litellmApiKey}`
          },
          body: JSON.stringify(testPayload)
        })
      } else if (!hasPath) {
        // No path, try /v1/chat/completions (OpenAI-compatible)
        chatUrl = `${baseUrl}/v1/chat/completions`
        response = await fetch(chatUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${litellmApiKey}`
          },
          body: JSON.stringify(testPayload)
        })
      }
    }

    // If still 404, try /chat/completions (for base URLs without path)
    if (response.status === 404 && !hasPath) {
      chatUrl = `${baseUrl}/chat/completions`
      response = await fetch(chatUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${litellmApiKey}`
        },
        body: JSON.stringify(testPayload)
      })
    }

    // If 403/401, try alternative authentication methods
    if (response.status === 403 || response.status === 401) {
      response = await fetch(chatUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': litellmApiKey
        },
        body: JSON.stringify(testPayload)
      })
    }

    if (response.status === 403 || response.status === 401) {
      response = await fetch(chatUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': litellmApiKey
        },
        body: JSON.stringify(testPayload)
      })
    }

    if (!response.ok) {
      let errorText = ''
      try {
        errorText = await response.text()
        const errorJson = JSON.parse(errorText)
        errorText = errorJson.error?.message || errorJson.message || errorText
      } catch (e) {
        // Not JSON, use as-is
      }

      return new Response(
        JSON.stringify({
          success: false,
          error: `LiteLLM connection test failed (${response.status}): ${errorText || response.statusText}`
        }),
        {
          status: response.status,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      )
    }

    // Check if response is JSON
    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `LiteLLM returned non-JSON response (${contentType})`
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      )
    }

    const data = await response.json() as unknown

    // Parse chat completions response to verify we got valid data
    let successMessage = 'LiteLLM connection test successful!'
    if (typeof data === 'object' && data !== null) {
      const dataObj = data as Record<string, any>
      // Check for chat completions response format
      if (dataObj.choices && Array.isArray(dataObj.choices) && dataObj.choices.length > 0) {
        const model = dataObj.model || testModel
        successMessage = `LiteLLM connection successful! Model "${model}" is working correctly.`
      } else if (dataObj.id) {
        // Some APIs return just an id for successful requests
        successMessage = 'LiteLLM connection test successful!'
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: successMessage
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    )
  } catch (error) {
    console.error('Error testing LiteLLM connection:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to test LiteLLM connection'
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    )
  }
}