import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getWorlds, createWorld, updateWorld, deleteWorld, generateWorldImage } from '../api'
import WorldCard from '../components/WorldCard'
import Modal from '../components/Modal'
import Spinner from '../components/Spinner'

function WorldForm({ initial = {}, onSave, onCancel, isCreate = false }) {
  const [title, setTitle] = useState(initial.title || '')
  const [description, setDescription] = useState(initial.description || '')
  const [phase, setPhase] = useState('idle') // 'idle' | 'saving' | 'generating'
  const [error, setError] = useState(null)
  const [imageError, setImageError] = useState(false)

  const busy = phase !== 'idle'

  async function handleSubmit(e) {
    e.preventDefault()
    if (!title.trim() || !description.trim()) {
      setError('Title and description are required.')
      return
    }
    setPhase('saving')
    setError(null)
    setImageError(false)
    let inGenerating = false
    try {
      await onSave(
        { title: title.trim(), description: description.trim() },
        () => { inGenerating = true; setPhase('generating') }
      )
    } catch (err) {
      setError(err.message)
      setImageError(inGenerating)
      setPhase('idle')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm text-gray-400 mb-1">Title</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={busy}
          className="w-full bg-gray-900 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
          placeholder="A New World"
        />
      </div>
      <div>
        <label className="block text-sm text-gray-400 mb-1">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={busy}
          rows={4}
          className="w-full bg-gray-900 text-gray-100 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-600 disabled:opacity-50"
          placeholder="Describe your world..."
        />
      </div>
      {error && (
        <div>
          <p className="text-red-400 text-sm">{error}</p>
          {imageError && <p className="text-gray-400 text-sm mt-1">Try again and/or change the prompt.</p>}
        </div>
      )}
      {phase === 'generating' ? (
        <div className="flex justify-center py-2">
          <Spinner label="Generating image..." />
        </div>
      ) : (
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-sm rounded-lg"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm rounded-lg"
          >
            {phase === 'saving' ? 'Saving...' : 'Save'}
          </button>
        </div>
      )}
    </form>
  )
}

export default function WorldsPage() {
  const [worlds, setWorlds] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [modal, setModal] = useState(null) // null | 'create' | { world }
  const navigate = useNavigate()

  function handleSignOut() {
    localStorage.removeItem('marcus_auth')
    navigate('/login')
  }

  useEffect(() => {
    getWorlds()
      .then(setWorlds)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  async function handleCreate(data, onGenerating) {
    const world = await createWorld(data)
    setWorlds((prev) => [world, ...prev])
    onGenerating()
    await generateWorldImage(world.id)
    navigate(`/worlds/${world.id}`)
  }

  async function handleEdit(data) {
    const updated = await updateWorld(modal.world.id, data)
    setWorlds((prev) => prev.map((w) => (w.id === updated.id ? updated : w)))
    setModal(null)
  }

  async function handleDelete(id) {
    if (!confirm('Delete this world and all its stories?')) return
    await deleteWorld(id)
    setWorlds((prev) => prev.filter((w) => w.id !== id))
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      <header className="px-6 py-5 border-b border-gray-800 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-indigo-400">StoryForge</h1>
          <p className="text-gray-500 text-sm">Your worlds</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setModal('create')}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            + Create World
          </button>
          <button
            onClick={handleSignOut}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm font-medium transition-colors"
          >
            Sign Out
          </button>
        </div>
      </header>

      <main className="px-6 py-8 max-w-6xl mx-auto">
        {loading && (
          <div className="flex justify-center pt-12">
            <Spinner label="Loading worlds..." />
          </div>
        )}
        {error && <p className="text-red-400 text-center">{error}</p>}
        {!loading && !error && worlds.length === 0 && (
          <div className="text-center py-20 text-gray-500">
            <p className="text-xl mb-2">No worlds yet</p>
            <p className="text-sm">Create your first world to get started.</p>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {worlds.map((world) => (
            <WorldCard
              key={world.id}
              world={world}
              onEdit={(w) => setModal({ world: w })}
              onDelete={handleDelete}
            />
          ))}
        </div>
      </main>

      {modal === 'create' && (
        <Modal title="Create World" onClose={() => setModal(null)}>
          <WorldForm onSave={handleCreate} onCancel={() => setModal(null)} />
        </Modal>
      )}
      {modal?.world && (
        <Modal title="Edit World" onClose={() => setModal(null)}>
          <WorldForm initial={modal.world} onSave={handleEdit} onCancel={() => setModal(null)} />
        </Modal>
      )}
    </div>
  )
}
