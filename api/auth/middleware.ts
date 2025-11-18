import { VercelRequest, VercelResponse } from '@vercel/node'

export interface AuthenticatedRequest extends VercelRequest {
  user?: {
    id: string
    username: string
  }
}

export function authenticateToken(req: AuthenticatedRequest, res: VercelResponse) {
  const authHeader = req.headers.authorization

  if (!authHeader) {
    return res.status(401).json({ message: '未提供认证令牌' })
  }

  const token = authHeader.split(' ')[1] // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ message: '认证令牌格式错误' })
  }

  try {
    // 简单的 token 验证（实际项目中应使用 jwt 库验证）
    const payload = JSON.parse(Buffer.from(token, 'base64').toString())

    // 检查 token 是否过期
    if (payload.exp < Date.now()) {
      return res.status(401).json({ message: '认证令牌已过期' })
    }

    // 将用户信息附加到请求对象
    req.user = {
      id: payload.userId,
      username: payload.username
    }

    return null // 验证成功
  } catch {
    return res.status(403).json({ message: '认证令牌无效' })
  }
}

export function withAuth(handler: (req: AuthenticatedRequest, res: VercelResponse) => Promise<void>) {
  return async (req: AuthenticatedRequest, res: VercelResponse) => {
    // 设置 CORS 头
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

    // 处理 OPTIONS 请求
    if (req.method === 'OPTIONS') {
      return res.status(200).end()
    }

    const authError = authenticateToken(req, res)
    if (authError) {
      return authError
    }

    return handler(req, res)
  }
}