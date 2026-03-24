import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import WorldsPage from './pages/WorldsPage'
import WorldDetailPage from './pages/WorldDetailPage'
import StoryDetailPage from './pages/StoryDetailPage'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<WorldsPage />} />
        <Route path="/worlds/:id" element={<WorldDetailPage />} />
        <Route path="/stories/:id" element={<StoryDetailPage />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)
