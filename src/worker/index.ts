import { Env } from './types'
import { UploadService } from './services/uploadService'
import { SubmissionService } from './services/submissionService'
import { EnhancedPatchService } from './services/enhancedPatchService'
import { GerritService } from './services/gerritService'

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
              projectBranches: '/api/projects/:project/branches'
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
        return await handleProjectBranches(path, env, corsHeaders)
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

    const VALID_CREDENTIALS = {
      username: 'patchx',
      password: getTestPassword()
    }

    // 验证凭据
    if (username !== VALID_CREDENTIALS.username || password !== VALID_CREDENTIALS.password) {
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
      id: 'user-123',
      username: username
    }

    // 简单的 token 生成（使用 base64 编码）
    const token = btoa(JSON.stringify({
      userId: user.id,
      username: user.username,
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
  }
  const { uploadId, subject, description, branch, model } = body

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
      notificationCc
    )

    // 异步提交到Gerrit（不等待完成）
    submissionService.submitToGerrit(submission.id).catch(error => {
      console.error('Gerrit submission failed:', error)
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

    return new Response(
      JSON.stringify({
        success: true,
        data: projects
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    )
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

    const gerritService = new GerritService(env)
    const branches = await gerritService.getBranches(projectName)

    return new Response(
      JSON.stringify({
        success: true,
        data: branches
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    )
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