import React, { useEffect, useState } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import SubmitPage from './pages/SubmitPage'
import StatusPage from './pages/StatusPage'
import LoginPage from './pages/LoginPage'
import Home from './pages/Home'
import EmailConfirmationPage from './pages/EmailConfirmationPage'
import SettingsPage from './pages/SettingsPage'
import { useTheme } from './hooks/useTheme'
import { useAuthStore } from './stores/authStore'

function App() {
  const { theme } = useTheme()
  const { user, workerUser, checkUser } = useAuthStore()
  const [authChecked, setAuthChecked] = useState(false)

  useEffect(() => {
    // Apply theme class to document root
    document.documentElement.classList.remove('light', 'dark')
    document.documentElement.classList.add(theme)
  }, [theme])

  useEffect(() => {
    let mounted = true
    const initAuth = async () => {
      await checkUser()
      if (mounted) {
        setAuthChecked(true)
      }
    }
    initAuth()
    return () => {
      mounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only run once on mount to initialize auth state

  // Show loading only on initial mount before first auth check
  if (!authChecked) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${theme === 'dark' ? 'bg-gradient-dark' : ''}`}>
        <div className="text-center">Loading...</div>
      </div>
    )
  }

  return (
    <Router>
      <div className={`min-h-screen ${theme === 'dark' ? 'bg-gradient-dark' : ''}`}>
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route path="/auth/confirm" element={<EmailConfirmationPage />} />
          <Route path="/home" element={(user || workerUser) ? <Home /> : <Navigate to="/" replace />} />
          <Route
            path="/submit"
            element={(user || workerUser) ? <SubmitPage /> : <Navigate to="/" replace />}
          />
          <Route
            path="/status/:id"
            element={(user || workerUser) ? <StatusPage /> : <Navigate to="/" replace />}
          />
          <Route
            path="/settings"
            element={(user || workerUser) ? <SettingsPage /> : <Navigate to="/" replace />}
          />
        </Routes>
      </div>
    </Router>
  )
}

export default App