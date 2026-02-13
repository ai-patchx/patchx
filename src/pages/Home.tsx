import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { User, Mail, Moon, Sun, LogIn, UserPlus, Settings } from 'lucide-react'
import useGitAuthorStore from '@/stores/gitAuthorStore'
import { useTheme } from '@/hooks/useTheme'
import RegistrationModal from '@/components/RegistrationModal'
import { useAuthStore } from '@/stores/authStore'

export default function Home() {
  const navigate = useNavigate()
  const { authorName, authorEmail, setAuthorName, setAuthorEmail, loadFromStorage } = useGitAuthorStore()
  const { theme, toggleTheme } = useTheme()
  const [showAuthModal, setShowAuthModal] = useState(false)
  const { user, signOut, isAdmin } = useAuthStore()

  useEffect(() => {
    loadFromStorage()
  }, [loadFromStorage])

  const handleAuthAction = () => {
    setShowAuthModal(true)
  }

  const handleLogout = async () => {
    await signOut()
  }

  const inputBase = 'block w-full pl-10 pr-3 py-2 rounded-md leading-5 placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500'
  const inputLight = 'bg-white border border-gray-300 focus:border-blue-500'
  const inputDark = 'input-gradient border focus:border-blue-500'

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className={`${theme === 'dark' ? 'gradient-card' : 'bg-white'} max-w-md w-full rounded-lg shadow-lg overflow-hidden`}>
        <div className="px-6 py-6">
          <div className="flex justify-between items-center mb-4">
            <div className="flex space-x-2">
              {user ? (
                <>
                  {isAdmin() && (
                    <button
                      onClick={() => navigate('/settings')}
                      className={`${theme === 'dark' ? 'btn-gradient' : 'bg-blue-600 hover:bg-blue-700 text-white'} px-3 py-1 rounded-lg text-sm transition-colors duration-200 flex items-center`}
                    >
                      <Settings className="w-4 h-4 mr-1" />
                      Settings
                    </button>
                  )}
                  <button
                    onClick={handleLogout}
                    className={`${theme === 'dark' ? 'bg-red-600 hover:bg-red-700' : 'bg-red-600 hover:bg-red-700'} text-white px-3 py-1 rounded-lg text-sm transition-colors duration-200`}
                  >
                    Sign Out
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => handleAuthAction()}
                    className={`${theme === 'dark' ? 'btn-gradient' : 'bg-blue-600 hover:bg-blue-700 text-white'} px-3 py-1 rounded-lg text-sm transition-colors duration-200 flex items-center`}
                  >
                    <LogIn className="w-4 h-4 mr-1" />
                    Sign in
                  </button>
                  <button
                    onClick={() => handleAuthAction()}
                    className={`${theme === 'dark' ? 'bg-green-600 hover:bg-green-700' : 'bg-green-600 hover:bg-green-700'} text-white px-3 py-1 rounded-lg text-sm transition-colors duration-200 flex items-center`}
                  >
                    <UserPlus className="w-4 h-4 mr-1" />
                    Register
                  </button>
                </>
              )}
            </div>
            <button
              onClick={toggleTheme}
              className={`${theme === 'dark' ? 'btn-gradient' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'} p-2 rounded-lg transition-colors duration-200`}
            >
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
          </div>

          <div className="text-center mb-6">
            <h1 className={`text-3xl font-bold mb-2 ${theme === 'dark' ? 'text-gradient-primary' : 'text-gray-900'}`}>Git Commit Author Configuration</h1>
            <p className={`${theme === 'dark' ? 'text-gradient-secondary' : 'text-gray-600'}`}>Configure your Git commit author information</p>
          </div>

          <div className="space-y-6">
            <div>
              <label htmlFor="authorName" className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gradient-primary' : 'text-gray-700'}`}>
                Author Name
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className={`h-5 w-5 ${theme === 'dark' ? 'text-gradient-secondary' : 'text-gray-400'}`} />
                </div>
                <input
                  type="text"
                  id="authorName"
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  className={`${inputBase} ${theme === 'dark' ? inputDark : inputLight}`}
                  placeholder="Enter name"
                />
              </div>
            </div>

            <div>
              <label htmlFor="authorEmail" className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gradient-primary' : 'text-gray-700'}`}>
                Author Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className={`h-5 w-5 ${theme === 'dark' ? 'text-gradient-secondary' : 'text-gray-400'}`} />
                </div>
                <input
                  type="email"
                  id="authorEmail"
                  value={authorEmail}
                  onChange={(e) => setAuthorEmail(e.target.value)}
                  className={`${inputBase} ${theme === 'dark' ? inputDark : inputLight}`}
                  placeholder="Enter email"
                />
              </div>
            </div>

            <div className={`${theme === 'dark' ? 'bg-gradient-dark-subtle border border-gray-700/40' : 'bg-blue-50 border border-blue-200'} rounded-md p-4`}>
              <h3 className={`text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gradient-primary' : 'text-blue-900'}`}>Current Configuration</h3>
              <div className={`text-sm ${theme === 'dark' ? 'text-gradient-secondary' : 'text-blue-800'}`}>
                <p>Name: {authorName || 'Not set'}</p>
                <p>Email: {authorEmail || 'Not set'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <RegistrationModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
      />
    </div>
  )
}