import React, { useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import SubmitPage from './pages/SubmitPage'
import StatusPage from './pages/StatusPage'
import LoginPage from './pages/LoginPage'
import { useTheme } from './hooks/useTheme'
import { useAuthStore } from './stores/authStore'

function App() {
  const { theme } = useTheme()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)

  useEffect(() => {
    // Apply theme class to document root
    document.documentElement.classList.remove('light', 'dark')
    document.documentElement.classList.add(theme)
  }, [theme])

  return (
    <Router>
      <div className={`min-h-screen ${theme === 'dark' ? 'bg-gradient-dark' : ''}`}>
        <Routes>
          <Route
            path="/login"
            element={!isAuthenticated ? <LoginPage /> : <Navigate to="/" replace />}
          />
          <Route
            path="/"
            element={isAuthenticated ? <SubmitPage /> : <Navigate to="/login" replace />}
          />
          <Route
            path="/submit"
            element={isAuthenticated ? <SubmitPage /> : <Navigate to="/login" replace />}
          />
          <Route
            path="/status/:id"
            element={isAuthenticated ? <StatusPage /> : <Navigate to="/login" replace />}
          />
        </Routes>
      </div>
    </Router>
  )
}

export default App