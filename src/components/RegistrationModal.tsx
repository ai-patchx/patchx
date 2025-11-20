import { useState } from 'react'
import { X, Mail, Lock } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useTheme } from '@/hooks/useTheme'
import { useNavigate } from 'react-router-dom'

interface RegistrationModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function RegistrationModal({ isOpen, onClose }: RegistrationModalProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isLogin, setIsLogin] = useState(false)
  const { signUp, signIn, loading, error } = useAuthStore()
  const { theme } = useTheme()
  const navigate = useNavigate()

  if (!isOpen) return null

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isLogin && password !== confirmPassword) {
      alert('密码不匹配')
      return
    }

    try {
      if (isLogin) {
        await signIn(email, password)
        onClose()
        navigate('/submit')
      } else {
        await signUp(email, password)
        // 注册成功后关闭弹窗并提示用户
        alert('注册成功！请使用新账号登录')
        onClose()
      }
    } catch (error) {
      console.error('Authentication error:', error)
    }
  }

  const inputBase = 'block w-full pl-10 pr-3 py-2 rounded-md leading-5 placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500'
  const inputLight = 'bg-white border border-gray-300 focus:border-blue-500'
  const inputDark = 'input-gradient border focus:border-blue-500'

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity" aria-hidden="true">
          <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
        </div>

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        <div className={`inline-block align-bottom rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full ${
          theme === 'dark' ? 'gradient-card' : 'bg-white'
        }`}>
          <div className="px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className={`text-lg font-medium ${theme === 'dark' ? 'text-gradient-primary' : 'text-gray-900'}`}>
                {isLogin ? '登录' : '注册'}
              </h3>
              <button
                onClick={onClose}
                className={`${theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-400 hover:text-gray-600'}`}
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
                {error}
              </div>
            )}

            <form onSubmit={handleEmailAuth} className="space-y-4">
              <div>
                <label htmlFor="email" className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gradient-primary' : 'text-gray-700'}`}>
                  邮箱地址
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className={`h-5 w-5 ${theme === 'dark' ? 'text-gradient-secondary' : 'text-gray-400'}`} />
                  </div>
                  <input
                    type="email"
                    id="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={`${inputBase} ${theme === 'dark' ? inputDark : inputLight}`}
                    placeholder="请输入邮箱地址"
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gradient-primary' : 'text-gray-700'}`}>
                  密码
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className={`h-5 w-5 ${theme === 'dark' ? 'text-gradient-secondary' : 'text-gray-400'}`} />
                  </div>
                  <input
                    type="password"
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`${inputBase} ${theme === 'dark' ? inputDark : inputLight}`}
                    placeholder="请输入密码"
                    required
                  />
                </div>
              </div>

              {!isLogin && (
                <div>
                  <label htmlFor="confirmPassword" className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gradient-primary' : 'text-gray-700'}`}>
                    确认密码
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Lock className={`h-5 w-5 ${theme === 'dark' ? 'text-gradient-secondary' : 'text-gray-400'}`} />
                    </div>
                    <input
                      type="password"
                      id="confirmPassword"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className={`${inputBase} ${theme === 'dark' ? inputDark : inputLight}`}
                      placeholder="请再次输入密码"
                      required
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${
                  loading
                    ? 'bg-gray-400 cursor-not-allowed'
                    : theme === 'dark'
                      ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700'
                      : 'bg-blue-600 hover:bg-blue-700'
                } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500`}
              >
                {loading ? '处理中...' : (isLogin ? '登录' : '注册')}
              </button>
            </form>

            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={() => setIsLogin(!isLogin)}
                className={`text-sm ${theme === 'dark' ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-500'}`}
              >
                {isLogin ? '没有账号？点击注册' : '已有账号？点击登录'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}