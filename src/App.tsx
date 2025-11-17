import React, { useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import SubmitPage from './pages/SubmitPage'
import StatusPage from './pages/StatusPage'
import { useTheme } from './hooks/useTheme'

function App() {
  const { theme } = useTheme()

  useEffect(() => {
    // Apply theme class to document root
    document.documentElement.classList.remove('light', 'dark')
    document.documentElement.classList.add(theme)
  }, [theme])

  return (
    <Router>
      <div className={`min-h-screen ${theme === 'dark' ? 'bg-gradient-dark' : ''}`}>

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