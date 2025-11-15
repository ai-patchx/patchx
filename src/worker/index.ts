import { Env } from './types'
import { UploadService } from './services/uploadService'
import { SubmissionService } from './services/submissionService'
import { EnhancedPatchService } from './services/enhancedPatchService'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname
    const method = request.method

    // 设置CORS头
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }

    // 处理OPTIONS请求
    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders })
    }

    try {
      // 现有的API路由
      if (path === '/api/upload' && method === 'POST') {
        return await handleUpload(request, env, corsHeaders)
      } else if (path === '/api/submit' && method === 'POST') {
        return await handleSubmit(request, env, corsHeaders)
      } else if (path.startsWith('/api/status/') && method === 'GET') {
        return await handleStatus(path, env, corsHeaders)
      }

      // 新的AI冲突解决API路由
      else if (path === '/api/ai/resolve-conflict' && method === 'POST') {
        return await handleAIConflictResolution(request, env, corsHeaders)
      } else if (path === '/api/ai/providers' && method === 'GET') {
        return await handleAIProviders(env, corsHeaders)
      } else if (path === '/api/ai/test-providers' && method === 'POST') {
        return await handleAITestProviders(env, corsHeaders)
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

// 原有的处理函数保持不变...
async function handleUpload(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  const formData = await request.formData()
  const file = formData.get('file') as File
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
  const body = await request.json() as { uploadId: string; subject: string; description: string; branch: string }
  const { uploadId, subject, description, branch } = body

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

  try {
    // 创建提交记录
    const submission = await submissionService.createSubmission(
      uploadId,
      subject,
      description || '',
      branch
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