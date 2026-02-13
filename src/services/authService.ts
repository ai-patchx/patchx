const API_BASE_URL = '/api'

export interface LoginRequest {
  username: string
  password: string
}

export interface LoginResponse {
  user: {
    id: string
    username: string
    role?: string
  }
  token: string
  message?: string
}

export interface UserResponse {
  user: {
    id: string
    username: string
    role?: string
  }
  message?: string
}

class AuthService {
  private getAuthHeader() {
    return {
      'Content-Type': 'application/json',
    }
  }

  async login(username: string, password: string): Promise<LoginResponse> {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password }),
    })

    const data = await response.json() as LoginResponse

    if (!response.ok) {
      const message = (data as { message?: string }).message
      throw new Error(message || 'Sign in failed')
    }

    return data
  }

  async getCurrentUser(): Promise<UserResponse> {
    const response = await fetch(`${API_BASE_URL}/auth/me`, {
      method: 'GET',
      headers: this.getAuthHeader(),
    })

    const data = await response.json() as UserResponse

    if (!response.ok) {
      const message = (data as { message?: string }).message
      throw new Error(message || 'Failed to get user information')
    }

    return data
  }
}

export const authService = new AuthService()