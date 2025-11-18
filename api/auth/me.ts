import { VercelResponse } from '@vercel/node'
import { withAuth, AuthenticatedRequest } from './middleware'

export default withAuth(async (req: AuthenticatedRequest, res: VercelResponse) => {
  if (req.method !== 'GET') {
    res.status(405).json({ message: 'Method not allowed' })
    return
  }

  try {
    // 返回当前用户信息
    res.status(200).json({
      user: req.user,
      message: '获取用户信息成功'
    })
  } catch (error) {
    console.error('Get current user error:', error)
    res.status(500).json({ message: '服务器内部错误' })
  }
})