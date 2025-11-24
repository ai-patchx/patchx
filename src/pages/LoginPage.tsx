import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mail, Moon, Sun, Github } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useTheme } from '@/hooks/useTheme'
import RegistrationModal from '@/components/RegistrationModal'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showRegistrationModal, setShowRegistrationModal] = useState(false)

  const navigate = useNavigate()
  const { signIn, signInWorker } = useAuthStore()
  const { theme, toggleTheme } = useTheme()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      const useWorkerAuth = import.meta.env.VITE_USE_WORKER_AUTH === 'true'
      if (useWorkerAuth || username === 'patchx') {
        await signInWorker(username, password)
      } else {
        await signIn(username, password)
      }
      navigate('/submit')
    } catch (err) {
      console.error('Login error:', err)
      setError(err instanceof Error ? err.message : 'Login failed, please try again')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen py-8 relative">
      <div className="max-w-md mx-auto px-4">
        {/* Theme toggle and GitHub buttons */}
        <div className="flex justify-end mb-4 space-x-2">
          <a
            href="https://github.com/ai-patchx/patchx"
            target="_blank"
            rel="noopener noreferrer"
            className={`p-2 rounded-lg transition-colors duration-200 ${
              theme === 'dark'
                ? 'bg-gradient-accent text-gradient-primary hover:bg-gradient-highlight'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            <Github className="w-5 h-5" />
          </a>
          <button
            onClick={toggleTheme}
            className={`p-2 rounded-lg transition-colors duration-200 ${
              theme === 'dark'
                ? 'bg-gradient-accent text-gradient-primary hover:bg-gradient-highlight'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </div>

        <div className={`rounded-lg shadow-lg p-8 ${
          theme === 'dark' ? 'gradient-card' : 'bg-white'
        }`}>
          <div className="mb-8">
            <h1 className={`text-3xl font-bold mb-2 text-center ${
              theme === 'dark' ? 'text-gradient-primary' : 'text-gray-900'
            }`}>
              User Login
            </h1>
            <p className={`text-center ${
              theme === 'dark' ? 'text-gradient-secondary' : 'text-gray-600'
            }`}>
              Login to PatchX with your account
            </p>
          </div>

          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="username" className={`block text-sm font-medium mb-2 ${
                theme === 'dark' ? 'text-gradient-primary' : 'text-gray-700'
              }`}>
                Username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                required
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent ${
                  theme === 'dark'
                    ? 'input-gradient border-gradient-accent'
                    : 'border-gray-300 bg-white'
                }`}
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="password" className={`block text-sm font-medium mb-2 ${
                theme === 'dark' ? 'text-gradient-primary' : 'text-gray-700'
              }`}>
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent ${
                  theme === 'dark'
                    ? 'input-gradient border-gradient-accent'
                    : 'border-gray-300 bg-white'
                }`}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && (
              <div className={`text-sm text-center ${
                theme === 'dark' ? 'text-red-400' : 'text-red-600'
              }`}>
                {error}
              </div>
            )}

            <div className="space-y-3">
              <button
                type="submit"
                disabled={isLoading}
                className={`
                  w-full flex justify-center items-center py-3 px-4 rounded-md font-medium
                  transition-colors duration-200
                  ${
                    isLoading
                      ? theme === 'dark'
                        ? 'bg-gradient-highlight text-gradient-secondary cursor-not-allowed'
                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : theme === 'dark'
                        ? 'btn-gradient'
                        : 'bg-green-600 text-white hover:bg-green-700'
                  }
                `}
              >
                {isLoading ? 'Logging in...' : 'Login'}
              </button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className={`w-full border-t ${
                    theme === 'dark' ? 'border-gradient-accent' : 'border-gray-300'
                  }`} />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className={`px-2 ${
                    theme === 'dark'
                      ? 'text-gradient-secondary'
                      : 'text-gray-500'
                  }`}
                  style={theme === 'dark'
                    ? { background: 'rgba(26, 26, 46, 0.8)' }
                    : { background: '#ffffff' }
                  }>
                    Or
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowRegistrationModal(true)}
                className={`
                  w-full flex justify-center items-center py-3 px-4 border rounded-md
                  text-sm font-medium transition-colors duration-200
                  ${
                    theme === 'dark'
                      ? 'border-gradient-accent text-gradient-primary bg-gradient-accent hover:bg-gradient-highlight'
                      : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50'
                  }
                `}
              >
                <Mail className="w-4 h-4 mr-2" />
                Email Registration
              </button>
            </div>
          </form>
        </div>
      </div>

      <RegistrationModal
        isOpen={showRegistrationModal}
        onClose={() => setShowRegistrationModal(false)}
      />
    </div>
  )
}