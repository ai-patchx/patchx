import { VercelResponse } from '@vercel/node'
import { withAuth, AuthenticatedRequest } from './middleware'

export default withAuth(async (req: AuthenticatedRequest, res: VercelResponse) => {
  if (req.method !== 'GET') {
    res.status(405).json({ message: 'Method not allowed' })
    return
  }

  try {
    // Return current user information
    res.status(200).json({
      user: req.user,
      message: 'User information retrieved successfully'
    })
  } catch (error) {
    console.error('Get current user error:', error)
    res.status(500).json({ message: 'Internal server error' })
  }
})