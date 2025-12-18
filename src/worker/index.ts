import { connect } from 'cloudflare:sockets'
import { Env } from './types'
import { UploadService } from './services/uploadService'
import { SubmissionService } from './services/submissionService'
import { EnhancedPatchService } from './services/enhancedPatchService'
import { GerritService } from './services/gerritService'
import { getKvNamespace } from './kv'
import { executeSSHCommandDirect } from './ssh-client'
import { getSupabaseClient } from './supabase'

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
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname
    const method = request.method

    // 设置CORS头 - 更完整的CORS支持
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    }

    // 处理OPTIONS请求
    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders })
    }

    try {
      // 根路径处理 - 返回服务信息
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
              emailTest: '/api/email/test'
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

      // 现有的API路由
      if (path === '/api/upload' && method === 'POST') {
        return await handleUpload(request, env, corsHeaders)
      } else if (path === '/api/submit' && method === 'POST') {
        return await handleSubmit(request, env, corsHeaders)
      } else if (path.startsWith('/api/status/') && method === 'GET') {
        return await handleStatus(path, env, corsHeaders)
      }

      // 登录API路由
      else if (path === '/api/auth/login' && method === 'POST') {
        return await handleLogin(request, env, corsHeaders)
      }

      // 新的AI冲突解决API路由
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
      }

      else {
        return new Response('Not Found', {
          status: 404,
          headers: corsHeaders
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

// AI冲突解决API处理函数
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
        JSON.stringify({ success: false, error: '缺少必要参数' }),
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

    // 模拟patch内容
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
          error: '冲突解决失败',
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
    console.error('AI冲突解决错误:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'AI冲突解决失败'
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
          message: isEnabled ? 'AI冲突解决已启用' : 'AI冲突解决未启用，请配置AI提供商'
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
        error: error instanceof Error ? error.message : '获取AI提供商失败'
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
          error: 'AI冲突解决未启用'
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
        error: error instanceof Error ? error.message : '测试AI提供商失败'
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

// 登录处理函数
async function handleLogin(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  try {
    const body = await request.json() as { username: string; password: string }
    const { username, password } = body

    // 验证输入
    if (!username || !password) {
      return new Response(
        JSON.stringify({ message: '用户名和密码不能为空' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      )
    }

    // 获取测试账号密码
    const getTestPassword = () => {
      // 支持 Cloudflare Workers 环境变量
      if (env.TEST_USER_PASSWORD) {
        return env.TEST_USER_PASSWORD
      }
      // 默认密码
      return 'patchx'
    }

    // 获取管理员账号密码
    const getAdminPassword = () => {
      // 支持 Cloudflare Workers 环境变量
      if (env.ADMIN_USER_PASSWORD) {
        return env.ADMIN_USER_PASSWORD
      }
      // 默认密码
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

    // 验证凭据
    const validCredential = VALID_CREDENTIALS.find(
      cred => cred.username === username && cred.password === password
    )

    if (!validCredential) {
      return new Response(
        JSON.stringify({ message: '用户名或密码错误' }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      )
    }

    // 创建用户对象和简单的 JWT token
    const user = {
      id: username === 'admin' ? 'admin-123' : 'user-123',
      username: username,
      role: validCredential.role
    }

    // 简单的 token 生成（使用 base64 编码）
    const token = btoa(JSON.stringify({
      userId: user.id,
      username: user.username,
      role: user.role,
      exp: Date.now() + 24 * 60 * 60 * 1000 // 24 小时后过期
    }))

    const response = {
      user,
      token,
      message: '登录成功'
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
      JSON.stringify({ message: '服务器内部错误' }),
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

// 原有的处理函数保持不变...
async function handleUpload(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const project = formData.get('project') as string

  if (!file || !project) {
    return new Response(
      JSON.stringify({ success: false, error: '缺少必要参数' }),
      {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    )
  }

  // 检查文件大小
  const maxFileSize = env.MAX_FILE_SIZE || 10 * 1024 * 1024 // 10MB
  if (file.size > maxFileSize) {
    return new Response(
      JSON.stringify({ success: false, error: '文件大小超过限制' }),
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

async function handleSubmit(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  const body = await request.json() as {
    uploadId: string
    subject: string
    description: string
    branch: string
    model?: string
    notificationEmails?: string[]
    notificationCc?: string[]
    remoteNodeId?: string
    gitRepository?: string
  }
  const { uploadId, subject, description, branch, model, remoteNodeId, gitRepository } = body

  if (!uploadId || !subject || !branch) {
    return new Response(
      JSON.stringify({ success: false, error: '缺少必要参数' }),
      {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    )
  }

  // Validate: if remoteNodeId is provided, gitRepository should also be provided
  if (remoteNodeId && !gitRepository) {
    return new Response(
      JSON.stringify({ success: false, error: 'Git repository URL is required when remote node is selected' }),
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
  const notificationEmails = Array.isArray(body.notificationEmails) ? body.notificationEmails : undefined
  const notificationCc = Array.isArray(body.notificationCc) ? body.notificationCc : undefined

  try {
    // 创建提交记录
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

    // 异步提交到Gerrit或执行git命令（不等待完成）
    submissionService.submitToGerrit(submission.id).catch(error => {
      console.error('Submission processing failed:', error)
    })

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
        error: error instanceof Error ? error.message : '提交失败'
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
      JSON.stringify({ success: false, error: '缺少提交ID' }),
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
        error: error instanceof Error ? error.message : '获取状态失败'
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
    supabaseUrl: env.SUPABASE_URL || '',
    supabaseAnonKey: env.SUPABASE_ANON_KEY || '',
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
    // Check if litellm is configured
    if (!env.LITELLM_BASE_URL || !env.LITELLM_API_KEY) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'LiteLLM is not configured. Please set LITELLM_BASE_URL and LITELLM_API_KEY in environment variables.'
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
    const baseUrl = env.LITELLM_BASE_URL.replace(/\/$/, '') // Remove trailing slash
    // Try /models first, fallback to /v1/models for OpenAI compatibility
    let modelsUrl = `${baseUrl}/models`

    // Log the request (without sensitive data)
    console.log(`Fetching models from LiteLLM: ${modelsUrl}`)
    console.log(`API Key present: ${!!env.LITELLM_API_KEY}, length: ${env.LITELLM_API_KEY?.length || 0}`)

    // Make request exactly like curl - minimal headers, just Authorization
    // This matches: curl -H "Authorization: Bearer sk-1234" http://litellm.example.com/models
    let response = await fetch(modelsUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${env.LITELLM_API_KEY}`
      }
    })

    // If 403, try with API key in different formats
    if (response.status === 403) {
      console.log(`403 error, trying alternative authentication methods...`)

      // Try without Bearer prefix
      response = await fetch(modelsUrl, {
        method: 'GET',
        headers: {
          'Authorization': env.LITELLM_API_KEY,
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
            'x-api-key': env.LITELLM_API_KEY,
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
            'api-key': env.LITELLM_API_KEY,
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
            'Authorization': `Bearer ${env.LITELLM_API_KEY}`,
            'x-api-key': env.LITELLM_API_KEY,
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
          'Authorization': `Bearer ${env.LITELLM_API_KEY}`
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
              errorDetails += ' This may indicate: invalid API key, insufficient permissions, or IP restrictions. Please verify LITELLM_API_KEY is correct and has proper permissions.'
            }
          }

          errorText = errorDetails
        } catch (e) {
          // Not JSON, use as-is
          errorDetails = errorText
          if (response.status === 403) {
            errorDetails = `403 Forbidden: ${errorText}. Please verify LITELLM_API_KEY is correct and has proper permissions.`
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
    if (!cachedResponse && env.AOSP_PATCH_KV) {
      const url = new URL(request.url)
      const kvKey = getCacheKeyString(url.pathname, url.search, env)
      try {
        const kvData = await env.AOSP_PATCH_KV.get(kvKey, 'json')
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
    if (env.AOSP_PATCH_KV) {
      const url = new URL(request.url)
      const kvKey = getCacheKeyString(url.pathname, url.search, env)
      env.AOSP_PATCH_KV.put(kvKey, JSON.stringify({
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
      if (!cachedResponse && env.AOSP_PATCH_KV) {
        const url = new URL(request.url)
        const kvKey = getCacheKeyString(url.pathname, url.search, env)
        try {
          const kvData = await env.AOSP_PATCH_KV.get(kvKey, 'json')
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
      if (env.AOSP_PATCH_KV) {
        const url = new URL(request.url)
        const kvKey = getCacheKeyString(url.pathname, url.search, env)
        env.AOSP_PATCH_KV.put(kvKey, JSON.stringify({
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
    const supabase = getSupabaseClient(env)

    // Get all nodes from Supabase
    const { data: nodes, error } = await supabase
      .from('remote_nodes')
      .select('id, name, host, port, username, auth_type, working_home, ssh_service_api_url, ssh_service_api_key, created_at, updated_at')
      .order('created_at', { ascending: false })

    if (error) {
      throw new Error(`Failed to fetch nodes from Supabase: ${error.message}`)
    }

    // Map Supabase data to RemoteNode format
    const nodesList = (nodes || []).map((node: any) => ({
      id: node.id,
      name: node.name,
      host: node.host,
      port: node.port,
      username: node.username,
      authType: node.auth_type,
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

async function handleCreateNode(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  try {
    const supabase = getSupabaseClient(env)

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

    // Insert node into Supabase
    const { data: node, error } = await supabase
      .from('remote_nodes')
      .insert({
        name: body.name,
        host: body.host,
        port: body.port || 22,
        username: body.username,
        auth_type: body.authType,
        ssh_key: body.authType === 'key' ? body.sshKey : null,
        password: body.authType === 'password' ? body.password : null, // In production, encrypt this
        working_home: body.workingHome ? body.workingHome.trim() : null,
        ssh_service_api_url: body.sshServiceApiUrl ? body.sshServiceApiUrl.trim() : null,
        ssh_service_api_key: body.sshServiceApiKey ? body.sshServiceApiKey.trim() : null
      })
      .select('id, name, host, port, username, auth_type, working_home, ssh_service_api_url, ssh_service_api_key, created_at, updated_at')
      .single()

    if (error) {
      throw new Error(`Failed to create node in Supabase: ${error.message}`)
    }

    // Map Supabase data to RemoteNode format
    const safeNode = {
      id: node.id,
      name: node.name,
      host: node.host,
      port: node.port,
      username: node.username,
      authType: node.auth_type,
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
    const supabase = getSupabaseClient(env)

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
    const { data: existingNode, error: fetchError } = await supabase
      .from('remote_nodes')
      .select('*')
      .eq('id', nodeId)
      .single()

    if (fetchError || !existingNode) {
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

    // Build update object
    const updateData: any = {}
    if (body.name !== undefined) updateData.name = body.name
    if (body.host !== undefined) updateData.host = body.host
    if (body.port !== undefined) updateData.port = body.port
    if (body.username !== undefined) updateData.username = body.username
    if (body.authType !== undefined) updateData.auth_type = body.authType
    if (body.workingHome !== undefined) updateData.working_home = body.workingHome ? body.workingHome.trim() : null
    if (body.sshServiceApiUrl !== undefined) updateData.ssh_service_api_url = body.sshServiceApiUrl ? body.sshServiceApiUrl.trim() : null
    if (body.sshServiceApiKey !== undefined) updateData.ssh_service_api_key = body.sshServiceApiKey ? body.sshServiceApiKey.trim() : null

    // Handle authentication credentials
    if (body.authType === 'key') {
      if (body.sshKey !== undefined) {
        updateData.ssh_key = body.sshKey
      }
      updateData.password = null // Clear password when switching to key auth
    } else if (body.authType === 'password') {
      if (body.password !== undefined && body.password !== '') {
        updateData.password = body.password
      } else if (body.password === '' && existingNode.password) {
        // Keep existing password if empty string provided
        updateData.password = existingNode.password
      }
      updateData.ssh_key = null // Clear SSH key when switching to password auth
    } else if (body.sshKey !== undefined) {
      updateData.ssh_key = body.sshKey
    } else if (body.password !== undefined && body.password !== '') {
      updateData.password = body.password
    }

    // Update node in Supabase
    const { data: updatedNode, error: updateError } = await supabase
      .from('remote_nodes')
      .update(updateData)
      .eq('id', nodeId)
      .select('id, name, host, port, username, auth_type, working_home, ssh_service_api_url, ssh_service_api_key, created_at, updated_at')
      .single()

    if (updateError) {
      throw new Error(`Failed to update node in Supabase: ${updateError.message}`)
    }

    // Map Supabase data to RemoteNode format
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
    const supabase = getSupabaseClient(env)

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

    // Delete node from Supabase
    const { error } = await supabase
      .from('remote_nodes')
      .delete()
      .eq('id', nodeId)

    if (error) {
      throw new Error(`Failed to delete node from Supabase: ${error.message}`)
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

      const apiUrl = trimmedUrl.endsWith('/') ? trimmedUrl.slice(0, -1) : trimmedUrl
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
          // If JSON parsing fails, try to get text
          try {
            const text = await response.text()
            if (text) errorMessage = text
          } catch {
            // Use default error message
          }
        }

        // Provide more helpful error messages for common HTTP status codes
        if (response.status === 401) {
          errorMessage = `Authentication failed (401): ${errorMessage}. Please check that your SSH Service API Key is correct and matches the API_KEY configured on the SSH service.`
        } else if (response.status === 403) {
          errorMessage = `Access forbidden (403): ${errorMessage}. This may indicate: 1) The API key is incorrect or missing, 2) A reverse proxy or firewall is blocking the request, 3) The SSH service API URL is incorrect. Please verify your SSH Service API URL and API Key configuration.`
        } else if (response.status === 404) {
          errorMessage = `Endpoint not found (404): ${errorMessage}. Please verify that the SSH Service API URL is correct and includes the full URL (e.g., https://your-domain.com). The service should have an /execute endpoint.`
        } else if (response.status >= 500) {
          errorMessage = `Server error (${response.status}): ${errorMessage}. The SSH service API may be experiencing issues. Please check the service logs.`
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
    const supabase = getSupabaseClient(env)

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

    // Fetch node from Supabase (including sensitive data for testing)
    const { data: node, error: fetchError } = await supabase
      .from('remote_nodes')
      .select('*')
      .eq('id', nodeId)
      .single()

    if (fetchError || !node) {
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

    // Map Supabase data to RemoteNodeData format
    const nodeData: RemoteNodeData = {
      id: node.id,
      name: node.name,
      host: node.host,
      port: node.port,
      username: node.username,
      authType: node.auth_type,
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