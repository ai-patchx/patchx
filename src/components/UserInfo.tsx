import { useAuthStore } from '@/stores/authStore'

export default function UserInfo() {
  const { user, signOut } = useAuthStore()

  const handleLogout = () => {
    signOut()
    window.location.href = '/login'
  }

  if (!user) {
    return null
  }

  return (
    <div className="flex items-center space-x-4">
      <div className="text-sm text-gray-700 dark:text-gray-300">
        欢迎, {user?.email || '用户'}
      </div>
      <button
        onClick={handleLogout}
        className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
      >
        退出登录
      </button>
    </div>
  )
}