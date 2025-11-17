import React, { useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import SubmitPage from './pages/SubmitPage'
import StatusPage from './pages/StatusPage'
import { useTheme } from './hooks/useTheme'
import { Moon, Sun } from 'lucide-react'

function App() {
  const { theme, toggleTheme } = useTheme()

  useEffect(() => {
    // Apply theme class to document root
    document.documentElement.classList.remove('light', 'dark')
    document.documentElement.classList.add(theme)
  }, [theme])

  return (
    <Router>
      <div className={`min-h-screen ${theme === 'dark' ? 'bg-gradient-dark' : ''}`}>
        {/* Theme toggle button for testing */}
        <button
          onClick={toggleTheme}
          className="fixed top-4 right-4 z-50 p-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
        >
          {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>

        <Routes>
          <Route path="/" element={<SubmitPage />} />
          <Route path="/submit" element={<SubmitPage />} />
          <Route path="/status/:id" element={<StatusPage />} />
        </Routes>
      </div>
    </Router>
  )
}

export default App