import { useEffect } from 'react'
import { User, Mail, Moon, Sun } from 'lucide-react'
import useGitAuthorStore from '@/stores/gitAuthorStore'
import { useTheme } from '@/hooks/useTheme'

export default function Home() {
  const { authorName, authorEmail, setAuthorName, setAuthorEmail, loadFromStorage } = useGitAuthorStore()
  const { theme, toggleTheme } = useTheme()

  useEffect(() => {
    loadFromStorage()
  }, [loadFromStorage])

  const inputBase = 'block w-full pl-10 pr-3 py-2 rounded-md leading-5 placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500'
  const inputLight = 'bg-white border border-gray-300 focus:border-blue-500'
  const inputDark = 'input-gradient border focus:border-blue-500'

  return (
    <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8">
      <div className={`${theme === 'dark' ? 'gradient-card' : 'bg-white'} max-w-md mx-auto rounded-lg shadow-lg overflow-hidden`}>
        <div className="px-6 py-6">
          <div className="flex justify-end mb-4">
            <button
              onClick={toggleTheme}
              className={`${theme === 'dark' ? 'btn-gradient' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'} p-2 rounded-lg transition-colors duration-200`}
            >
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
          </div>

          <div className="text-center mb-6">
            <h1 className={`text-3xl font-bold mb-2 ${theme === 'dark' ? 'text-gradient-primary' : 'text-gray-900'}`}>Git 提交作者配置</h1>
            <p className={`${theme === 'dark' ? 'text-gradient-secondary' : 'text-gray-600'}`}>配置你的 Git 提交作者信息</p>
          </div>

          <div className="space-y-6">
            <div>
              <label htmlFor="authorName" className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gradient-primary' : 'text-gray-700'}`}>
                作者名称
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
                  placeholder="请输入名称"
                />
              </div>
            </div>

            <div>
              <label htmlFor="authorEmail" className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gradient-primary' : 'text-gray-700'}`}>
                作者邮箱
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
                  placeholder="请输入邮箱"
                />
              </div>
            </div>

            <div className={`${theme === 'dark' ? 'bg-gradient-dark-subtle border border-gray-700/40' : 'bg-blue-50 border border-blue-200'} rounded-md p-4`}>
              <h3 className={`text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gradient-primary' : 'text-blue-900'}`}>当前配置</h3>
              <div className={`text-sm ${theme === 'dark' ? 'text-gradient-secondary' : 'text-blue-800'}`}>
                <p>名称：{authorName || '未设置'}</p>
                <p>邮箱：{authorEmail || '未设置'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}