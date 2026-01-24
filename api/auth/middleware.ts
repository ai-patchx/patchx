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
    return res.status(401).json({ message: 'Authentication token not provided' })
  }

  const token = authHeader.split(' ')[1] // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ message: 'Authentication token format error' })
  }

  try {
    // Simple token validation (should use jwt library in production)
    const payload = JSON.parse(Buffer.from(token, 'base64').toString())

    // Check if token is expired
    if (payload.exp < Date.now()) {
      return res.status(401).json({ message: 'Authentication token expired' })
    }

    // Attach user information to request object
    req.user = {
      id: payload.userId,
      username: payload.username
    }

    return null // Validation successful
  } catch {
    return res.status(403).json({ message: 'Invalid authentication token' })
  }
}

export function withAuth(handler: (req: AuthenticatedRequest, res: VercelResponse) => Promise<void>) {
  return async (req: AuthenticatedRequest, res: VercelResponse) => {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

    // Handle OPTIONS requests
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