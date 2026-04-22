import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  getWorld,
  updateWorld,
  deleteWorld,
  generateWorldImage,
  editWorldImage,
  uploadWorldImage,
  createStory,
  generateStoryImage,
  updateStory,
  deleteStory,
} from '../api'
import ImageBlock from '../components/ImageBlock'
import StoryCard from '../components/StoryCard'
import Modal from '../components/Modal'
import Spinner from '../components/Spinner'

function StoryForm({ initial = {}, onSave, onCancel }) {
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
          className="w-full bg-gray-900 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50"
          placeholder="A New Story"
        />
      </div>
      <div>
        <label className="block text-sm text-gray-400 mb-1">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={busy}
          rows={4}
          className="w-full bg-gray-900 text-gray-100 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-500 placeholder-gray-600 disabled:opacity-50"
          placeholder="Describe your story..."
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
          <button type="button" onClick={onCancel} disabled={busy} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-sm rounded-lg">
            Cancel
          </button>
          <button type="submit" disabled={busy} className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm rounded-lg">
            {phase === 'saving' ? 'Saving...' : 'Save'}
          </button>
        </div>
      )}
    </form>
  )
}

export default function WorldDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [world, setWorld] = useState(null)
  const [stories, setStories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [modal, setModal] = useState(null)
  const [editingWorld, setEditingWorld] = useState(false)

  useEffect(() => {
    getWorld(id)
      .then((data) => {
        setWorld(data)
        setStories(data.stories || [])
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  async function handleUpdateWorld(data) {
    const updated = await updateWorld(id, data)
    setWorld(updated)
    setEditingWorld(false)
  }

  async function handleDeleteWorld() {
    if (!confirm('Delete this world and all its stories?')) return
    await deleteWorld(id)
    navigate('/')
  }

  function handleWorldImageChange(imagePath) {
    setWorld((w) => ({ ...w, image_path: imagePath }))
  }

  async function handleCreateStory(data, onGenerating) {
    const story = await createStory(id, data)
    setStories((prev) => [...prev, story])
    onGenerating()
    await generateStoryImage(story.id)
    navigate(`/stories/${story.id}`)
  }

  async function handleEditStory(data) {
    const updated = await updateStory(modal.story.id, data)
    setStories((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
    setModal(null)
  }

  async function handleDeleteStory(storyId) {
    if (!confirm('Delete this story?')) return
    await deleteStory(storyId)
    setStories((prev) => prev.filter((s) => s.id !== storyId))
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <Spinner label="Loading world..." />
    </div>
  )

  if (error) return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <p className="text-red-400">{error}</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      <header className="px-6 py-4 border-b border-gray-800 flex items-center gap-3">
        <button onClick={() => navigate('/')} className="text-gray-400 hover:text-gray-200 text-sm">
          ← Worlds
        </button>
      </header>

      <main className="px-6 py-8 max-w-4xl mx-auto space-y-8">
        {/* World header */}
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            {editingWorld ? (
              <div className="flex-1">
                <StoryForm
                  initial={world}
                  onSave={handleUpdateWorld}
                  onCancel={() => setEditingWorld(false)}
                />
              </div>
            ) : (
              <div className="flex-1">
                <h1 className="text-3xl font-bold text-indigo-400 mb-2">{world.title}</h1>
                <p className="text-gray-300 leading-relaxed">{world.description}</p>
              </div>
            )}
            {!editingWorld && (
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => setEditingWorld(true)}
                  className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg"
                >
                  Edit
                </button>
                <button
                  onClick={handleDeleteWorld}
                  className="px-3 py-1.5 bg-red-800 hover:bg-red-700 text-white text-sm rounded-lg"
                >
                  Delete
                </button>
              </div>
            )}
          </div>

          <ImageBlock
            imagePath={world.image_path}
            onGenerate={() => generateWorldImage(id)}
            onUpload={(file) => uploadWorldImage(id, file)}
            onImageChange={handleWorldImageChange}
            onEdit={(modText) => editWorldImage(id, modText)}
            onEditChange={(res) => setWorld((w) => ({ ...w, image_path: res.image_path, description: res.description }))}
          />
        </div>

        {/* Stories */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-200">Stories</h2>
            <button
              onClick={() => setModal('create')}
              className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white text-sm rounded-lg transition-colors"
            >
              + Add Story
            </button>
          </div>

          {stories.length === 0 ? (
            <p className="text-gray-500 text-sm">No stories yet. Add one to begin.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {stories.map((story) => (
                <StoryCard
                  key={story.id}
                  story={story}
                  onEdit={(s) => setModal({ story: s })}
                  onDelete={handleDeleteStory}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {modal === 'create' && (
        <Modal title="Add Story" onClose={() => setModal(null)}>
          <StoryForm onSave={handleCreateStory} onCancel={() => setModal(null)} />
        </Modal>
      )}
      {modal?.story && (
        <Modal title="Edit Story" onClose={() => setModal(null)}>
          <StoryForm initial={modal.story} onSave={handleEditStory} onCancel={() => setModal(null)} />
        </Modal>
      )}
    </div>
  )
}
