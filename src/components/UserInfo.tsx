import { useAuthStore } from '@/stores/authStore'

export default function UserInfo() {
  const { user, workerUser, signOut } = useAuthStore()

  const handleLogout = async () => {
    await signOut()
    window.location.href = '/login'
  }

  if (!user && !workerUser) {
    return null
  }

  const displayName = user?.email || workerUser?.username || 'User'

  return (
    <div className="flex items-center space-x-4">
      <div className="text-sm text-gray-700 dark:text-gray-300">
        Welcome, {displayName}
      </div>
      <button
        onClick={handleLogout}
        className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
      >
        Sign Out
      </button>
    </div>
  )
}