import { useAuthStore } from '@/stores/authStore'

const API_BASE_URL = '/api'

export interface LoginRequest {
  username: string
  password: string
}

export interface LoginResponse {
  user: {
    id: string
    username: string
  }
  token: string
  message?: string
}

export interface UserResponse {
  user: {
    id: string
    username: string
  }
  message?: string
}

class AuthService {
  private getAuthHeader() {
    const token = useAuthStore.getState().token
    return {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` })
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
      throw new Error(message || '登录失败')
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
      throw new Error(message || '获取用户信息失败')
    }

    return data
  }
}

export const authService = new AuthService()