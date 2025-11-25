import { useEffect } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { useTheme } from '@/hooks/useTheme'
import { LogOut } from 'lucide-react'

export default function UserInfo() {
  const { user, workerUser, signOut, checkUser } = useAuthStore()
  const { theme } = useTheme()

  // Ensure auth state is checked when component mounts
  useEffect(() => {
    checkUser()
  }, [checkUser])

  const handleLogout = async () => {
    await signOut()
    window.location.href = '/'
  }

  if (!user && !workerUser) {
    return null
  }

  const displayName = user?.email || workerUser?.username || 'User'

  return (
    <div className="flex items-center space-x-2">
      <div className={`text-sm px-2 py-1 rounded ${
        theme === 'dark'
          ? 'text-gradient-secondary'
          : 'text-gray-700'
      }`}>
        {displayName}
      </div>
      <button
        onClick={handleLogout}
        className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg text-sm transition-colors duration-200 ${
          theme === 'dark'
            ? 'bg-gradient-accent text-gradient-primary hover:bg-gradient-highlight'
            : 'bg-red-600 text-white hover:bg-red-700'
        }`}
        title="Sign Out"
      >
        <LogOut className="w-4 h-4" />
        <span>Sign Out</span>
      </button>
    </div>
  )
}