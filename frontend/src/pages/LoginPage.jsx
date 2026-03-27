import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login } from '../api'
import marcusImg from '../assets/marcus_and_rays.jpg'

export default function LoginPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(password)
      localStorage.setItem('marcus_auth', 'true')
      navigate('/')
    } catch (err) {
      setError('Incorrect password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-cover bg-center"
      style={{ backgroundImage: `url(${marcusImg})` }}
    >
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative z-10 bg-gray-900/80 backdrop-blur-sm border border-gray-700 rounded-2xl p-10 w-full max-w-sm shadow-2xl flex flex-col items-center gap-6">
        <h1 className="text-3xl font-bold text-white tracking-wide">Marcus the Legend</h1>
        <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4">
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-3 rounded-lg bg-gray-800 text-white border border-gray-600 focus:outline-none focus:border-indigo-500 text-center text-lg"
            autoFocus
          />
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
          <button
            type="submit"
            disabled={loading || !password}
            className="w-full py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-lg transition-colors"
          >
            {loading ? 'Checking…' : 'Enter'}
          </button>
        </form>
      </div>
    </div>
  )
}
