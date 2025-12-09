import { VercelRequest, VercelResponse } from '@vercel/node'

interface LoginRequest {
  username: string
  password: string
}

interface User {
  id: string
  username: string
  role?: string
}

interface LoginResponse {
  user: User
  token: string
  message?: string
}

// 获取测试账号密码，支持多种环境变量格式
const getTestPassword = () => {
  // 支持 Vercel 环境变量
  if (process.env.TEST_USER_PASSWORD) {
    return process.env.TEST_USER_PASSWORD
  }
  // 支持 Cloudflare Workers 环境变量
  const globalPassword = (globalThis as { TEST_USER_PASSWORD?: string }).TEST_USER_PASSWORD
  if (globalPassword) {
    return globalPassword
  }
  // 支持本地开发环境变量（通过 import.meta.env）
  const metaEnv = (import.meta as unknown as { env?: { TEST_USER_PASSWORD?: string } }).env
  if (metaEnv?.TEST_USER_PASSWORD) {
    return metaEnv.TEST_USER_PASSWORD
  }
  // 默认密码
  return 'patchx'
}

// 获取管理员账号密码，支持多种环境变量格式
const getAdminPassword = () => {
  // 支持 Vercel 环境变量
  if (process.env.ADMIN_USER_PASSWORD) {
    return process.env.ADMIN_USER_PASSWORD
  }
  // 支持 Cloudflare Workers 环境变量
  const globalPassword = (globalThis as { ADMIN_USER_PASSWORD?: string }).ADMIN_USER_PASSWORD
  if (globalPassword) {
    return globalPassword
  }
  // 支持本地开发环境变量（通过 import.meta.env）
  const metaEnv = (import.meta as unknown as { env?: { ADMIN_USER_PASSWORD?: string } }).env
  if (metaEnv?.ADMIN_USER_PASSWORD) {
    return metaEnv.ADMIN_USER_PASSWORD
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

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // 设置 CORS 头
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  // 处理 OPTIONS 请求
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' })
  }

  try {
    const { username, password }: LoginRequest = req.body

    // 验证输入
    if (!username || !password) {
      return res.status(400).json({ message: '用户名和密码不能为空' })
    }

    // 验证凭据
    const validCredential = VALID_CREDENTIALS.find(
      cred => cred.username === username && cred.password === password
    )

    if (!validCredential) {
      return res.status(401).json({ message: '用户名或密码错误' })
    }

    // 创建用户对象和简单的 JWT token（实际项目中应使用真实的 JWT 库）
    const user: User = {
      id: username === 'admin' ? 'admin-123' : 'user-123',
      username: username,
      role: validCredential.role
    }

    // 简单的 token 生成（实际项目中应使用 jwt 库）
    const token = Buffer.from(JSON.stringify({
      userId: user.id,
      username: user.username,
      role: user.role,
      exp: Date.now() + 24 * 60 * 60 * 1000 // 24 小时后过期
    })).toString('base64')

    const response: LoginResponse = {
      user,
      token,
      message: '登录成功'
    }

    return res.status(200).json(response)
  } catch (error) {
    console.error('Login error:', error)
    return res.status(500).json({ message: '服务器内部错误' })
  }
}