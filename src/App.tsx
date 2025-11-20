import React, { useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import SubmitPage from './pages/SubmitPage'
import StatusPage from './pages/StatusPage'
import LoginPage from './pages/LoginPage'
import Home from './pages/Home'
import { useTheme } from './hooks/useTheme'
import { useAuthStore } from './stores/authStore'

function App() {
  const { theme } = useTheme()
  const { user, workerUser, checkUser } = useAuthStore()

  useEffect(() => {
    // Apply theme class to document root
    document.documentElement.classList.remove('light', 'dark')
    document.documentElement.classList.add(theme)
  }, [theme])

  useEffect(() => {
    checkUser()
  }, [checkUser])

  return (
    <Router>
      <div className={`min-h-screen ${theme === 'dark' ? 'bg-gradient-dark' : ''}`}>
        <Routes>
          <Route path="/" element={(user || workerUser) ? <Home /> : <Navigate to="/login" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/submit"
            element={(user || workerUser) ? <SubmitPage /> : <Navigate to="/login" replace />}
          />
          <Route
            path="/status/:id"
            element={(user || workerUser) ? <StatusPage /> : <Navigate to="/login" replace />}
          />
        </Routes>
      </div>
    </Router>
  )
}

export default App