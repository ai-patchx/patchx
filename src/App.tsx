import React from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import SubmitPage from './pages/SubmitPage'
import StatusPage from './pages/StatusPage'

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
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