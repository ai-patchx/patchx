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

// Get test account password, supports multiple environment variable formats
const getTestPassword = () => {
  // Support Vercel environment variables
  if (process.env.TEST_USER_PASSWORD) {
    return process.env.TEST_USER_PASSWORD
  }
  // Support Cloudflare Workers environment variables
  const globalPassword = (globalThis as { TEST_USER_PASSWORD?: string }).TEST_USER_PASSWORD
  if (globalPassword) {
    return globalPassword
  }
  // Support local development environment variables (via import.meta.env)
  const metaEnv = (import.meta as unknown as { env?: { TEST_USER_PASSWORD?: string } }).env
  if (metaEnv?.TEST_USER_PASSWORD) {
    return metaEnv.TEST_USER_PASSWORD
  }
  // Default password
  return 'patchx'
}

// Get administrator account password, supports multiple environment variable formats
const getAdminPassword = () => {
  // Support Vercel environment variables
  if (process.env.ADMIN_USER_PASSWORD) {
    return process.env.ADMIN_USER_PASSWORD
  }
  // Support Cloudflare Workers environment variables
  const globalPassword = (globalThis as { ADMIN_USER_PASSWORD?: string }).ADMIN_USER_PASSWORD
  if (globalPassword) {
    return globalPassword
  }
  // Support local development environment variables (via import.meta.env)
  const metaEnv = (import.meta as unknown as { env?: { ADMIN_USER_PASSWORD?: string } }).env
  if (metaEnv?.ADMIN_USER_PASSWORD) {
    return metaEnv.ADMIN_USER_PASSWORD
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

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  // Handle OPTIONS requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' })
  }

  try {
    const { username, password }: LoginRequest = req.body

    // Validate input
    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password cannot be empty' })
    }

    // Validate credentials
    const validCredential = VALID_CREDENTIALS.find(
      cred => cred.username === username && cred.password === password
    )

    if (!validCredential) {
      return res.status(401).json({ message: 'Invalid username or password' })
    }

    // Create user object and simple JWT token (should use real JWT library in production)
    const user: User = {
      id: username === 'admin' ? 'admin-123' : 'user-123',
      username: username,
      role: validCredential.role
    }

    // Simple token generation (should use jwt library in production)
    const token = Buffer.from(JSON.stringify({
      userId: user.id,
      username: user.username,
      role: user.role,
      exp: Date.now() + 24 * 60 * 60 * 1000 // Expires in 24 hours
    })).toString('base64')

    const response: LoginResponse = {
      user,
      token,
      message: 'Sign in successful'
    }

    return res.status(200).json(response)
  } catch (error) {
    console.error('Sign in error:', error)
    return res.status(500).json({ message: 'Internal server error' })
  }
}