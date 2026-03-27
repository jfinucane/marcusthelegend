import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import WorldsPage from './pages/WorldsPage'
import WorldDetailPage from './pages/WorldDetailPage'
import StoryDetailPage from './pages/StoryDetailPage'
import LoginPage from './pages/LoginPage'

function ProtectedRoute({ children }) {
  return localStorage.getItem('marcus_auth') ? children : <Navigate to="/login" replace />
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<ProtectedRoute><WorldsPage /></ProtectedRoute>} />
        <Route path="/worlds/:id" element={<ProtectedRoute><WorldDetailPage /></ProtectedRoute>} />
        <Route path="/stories/:id" element={<ProtectedRoute><StoryDetailPage /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)
