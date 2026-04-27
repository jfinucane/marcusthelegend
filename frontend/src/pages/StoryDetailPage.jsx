import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { DragDropContext, Droppable } from '@hello-pangea/dnd'
import {
  getStory,
  updateStory,
  generateStoryImage,
  editStoryImage,
  uploadStoryImage,
  createItem,
  reorderItems,
} from '../api'
import ImageBlock from '../components/ImageBlock'
import StoryItemEditor from '../components/StoryItemEditor'
import Spinner from '../components/Spinner'
import Modal from '../components/Modal'
import MontageModal from '../components/MontageModal'

const VOICES = ['john', 'sofia', 'aria', 'jason', 'leo']

function InsertDivider({ onAdd, disabled }) {
  const [open, setOpen] = useState(false)

  function handleSelect(type) {
    setOpen(false)
    onAdd(type)
  }

  return (
    <div className="relative flex items-center justify-center h-8 group">
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-gray-700 group-hover:bg-gray-600 transition-colors" />
      {open ? (
        <div className="relative z-10 flex items-center gap-2">
          <button
            onClick={() => handleSelect('image_scene')}
            disabled={disabled}
            className="px-3 py-1 bg-indigo-700 hover:bg-indigo-600 disabled:opacity-50 text-white text-xs rounded-lg transition-colors"
          >
            Image Scene
          </button>
          <button
            onClick={() => handleSelect('narrative')}
            disabled={disabled}
            className="px-3 py-1 bg-violet-700 hover:bg-violet-600 disabled:opacity-50 text-white text-xs rounded-lg transition-colors"
          >
            Narrative
          </button>
          <button
            onClick={() => setOpen(false)}
            className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          disabled={disabled}
          className="relative z-10 w-6 h-6 hover:w-8 hover:h-8 flex items-center justify-center bg-gray-700 border border-gray-400 hover:border-white hover:text-white text-gray-300 rounded-full text-sm leading-none transition-all"
        >
          +
        </button>
      )}
    </div>
  )
}

export default function StoryDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [story, setStory] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editingStory, setEditingStory] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [savingStory, setSavingStory] = useState(false)
  const [addingItem, setAddingItem] = useState(false)
  const [newItemId, setNewItemId] = useState(null)
  const [voiceModalOpen, setVoiceModalOpen] = useState(false)
  const [showMontage, setShowMontage] = useState(false)
  const [lastStoryPrompt, setLastStoryPrompt] = useState(null)
  const [promptModalOpen, setPromptModalOpen] = useState(false)
  const itemRefs = useRef({})

  useEffect(() => {
    getStory(id)
      .then((data) => {
        setStory(data)
        setItems(data.items || [])
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  function startEditStory() {
    setEditTitle(story.title)
    setEditDesc(story.description)
    setEditingStory(true)
  }

  async function saveStory() {
    setSavingStory(true)
    try {
      const updated = await updateStory(id, { title: editTitle, description: editDesc })
      setStory(updated)
      setEditingStory(false)
    } catch (e) {
      setError(e.message)
    } finally {
      setSavingStory(false)
    }
  }

  async function handleVoiceSelect(voice) {
    const updated = await updateStory(id, { voice })
    setStory(updated)
    setVoiceModalOpen(false)
  }

  function handleStoryImageChange(imagePath) {
    setStory((s) => ({ ...s, image_path: imagePath }))
  }

  async function handleAddItem(type, orderIndex) {
    setAddingItem(true)
    try {
      const payload = { type }
      if (orderIndex !== undefined) payload.order_index = orderIndex
      const item = await createItem(id, payload)
      if (orderIndex !== undefined) {
        setItems((prev) => {
          const updated = prev.map((i) =>
            i.order_index >= orderIndex ? { ...i, order_index: i.order_index + 1 } : i
          )
          return [...updated, item].sort((a, b) => a.order_index - b.order_index)
        })
      } else {
        setItems((prev) => [...prev, item])
      }
      setNewItemId(item.id)
    } catch (e) {
      setError(e.message)
    } finally {
      setAddingItem(false)
    }
  }

  useEffect(() => {
    if (newItemId && itemRefs.current[newItemId]) {
      itemRefs.current[newItemId].scrollIntoView({ behavior: 'smooth', block: 'center' })
      setNewItemId(null)
    }
  }, [newItemId, items])

  function handleItemUpdate(updated) {
    setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))
  }

  function handleItemDelete(itemId) {
    setItems((prev) => prev.filter((i) => i.id !== itemId))
  }

  async function handleDragEnd(result) {
    if (!result.destination) return
    const { source, destination } = result
    if (source.index === destination.index) return

    const reordered = Array.from(items)
    const [moved] = reordered.splice(source.index, 1)
    reordered.splice(destination.index, 0, moved)

    setItems(reordered)

    try {
      const updated = await reorderItems(id, reordered.map((i) => i.id))
      setItems(updated)
    } catch (e) {
      setError(e.message)
      getStory(id).then((data) => setItems(data.items || []))
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <Spinner label="Loading story..." />
    </div>
  )

  if (error && !story) return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <p className="text-red-400">{error}</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      <header className="px-6 py-4 border-b border-gray-800 flex items-center gap-3">
        <button
          onClick={() => navigate(`/worlds/${story?.world_id}`)}
          className="text-gray-400 hover:text-gray-200 text-sm"
        >
          ← Stories
        </button>
      </header>

      <main className="px-6 py-8 max-w-3xl mx-auto space-y-8">
        {/* Story header */}
        <div className="space-y-4">
          {editingStory ? (
            <div className="space-y-3">
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full bg-gray-800 text-gray-100 rounded-lg px-3 py-2 text-xl font-bold focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
              <textarea
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                rows={3}
                className="w-full bg-gray-800 text-gray-100 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
              <div className="flex gap-2">
                <button
                  onClick={saveStory}
                  disabled={savingStory}
                  className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm rounded-lg"
                >
                  {savingStory ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={() => setEditingStory(false)}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-4">
                <h1 className="text-3xl font-bold text-violet-400">{story?.title}</h1>
                <button
                  onClick={startEditStory}
                  className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg shrink-0"
                >
                  Edit
                </button>
              </div>
              <p className="text-gray-300 leading-relaxed">{story?.description}</p>
            </div>
          )}

          <ImageBlock
            imagePath={story?.image_path}
            onGenerate={async () => {
              const res = await generateStoryImage(id)
              if (res.prompt) setLastStoryPrompt(res.prompt)
              return res
            }}
            onUpload={(file) => uploadStoryImage(id, file)}
            onImageChange={handleStoryImageChange}
            onEdit={(modText) => editStoryImage(id, modText)}
            onEditChange={(res) => setStory((s) => ({ ...s, image_path: res.image_path, description: res.description }))}
            onImageClick={lastStoryPrompt ? () => setPromptModalOpen(true) : undefined}
            extraButtons={
              <>
                <button
                  onClick={() => setVoiceModalOpen(true)}
                  className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded-lg text-white transition-colors"
                  title={`Voice: ${story?.voice || 'john'}`}
                >
                  Edit Voice
                </button>
                <button
                  onClick={() => setShowMontage(true)}
                  className="px-3 py-1.5 text-sm bg-violet-700 hover:bg-violet-600 rounded-lg text-white transition-colors"
                >
                  Watch
                </button>
              </>
            }
          />
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        {/* Story items with insert dividers */}
        <div>
          {addingItem && (
            <div className="flex justify-center py-2">
              <Spinner />
            </div>
          )}
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <p className="text-gray-500 text-sm">No content yet. Add your first block:</p>
              <div className="flex gap-2">
                <button
                  onClick={() => handleAddItem('image_scene')}
                  disabled={addingItem}
                  className="px-3 py-1.5 bg-indigo-700 hover:bg-indigo-600 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
                >
                  Image Scene
                </button>
                <button
                  onClick={() => handleAddItem('narrative')}
                  disabled={addingItem}
                  className="px-3 py-1.5 bg-violet-700 hover:bg-violet-600 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
                >
                  Narrative
                </button>
              </div>
            </div>
          ) : (
            <DragDropContext onDragEnd={handleDragEnd}>
              <Droppable droppableId="story-items">
                {(provided) => (
                  <div ref={provided.innerRef} {...provided.droppableProps}>
                    <InsertDivider
                      onAdd={(type) => handleAddItem(type, items[0].order_index)}
                      disabled={addingItem}
                    />
                    {items.map((item, index) => (
                      <div key={item.id} ref={(el) => { itemRefs.current[item.id] = el }}>
                        <StoryItemEditor
                          item={item}
                          index={index}
                          storyVoice={story?.voice || 'john'}
                          onUpdate={handleItemUpdate}
                          onDelete={handleItemDelete}
                        />
                        <InsertDivider
                          onAdd={(type) => handleAddItem(type, item.order_index + 1)}
                          disabled={addingItem}
                        />
                      </div>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          )}
        </div>
      </main>

      {promptModalOpen && (
        <Modal title="Image Prompt" onClose={() => setPromptModalOpen(false)}>
          <pre className="text-gray-300 text-xs whitespace-pre-wrap break-words font-mono bg-gray-900 rounded-lg p-3 max-h-96 overflow-y-auto">
            {lastStoryPrompt}
          </pre>
        </Modal>
      )}

      {showMontage && story && (
        <MontageModal story={story} onClose={() => setShowMontage(false)} />
      )}

      {voiceModalOpen && (
        <Modal title="Story Voice" onClose={() => setVoiceModalOpen(false)}>
          <div className="space-y-2">
            {VOICES.map(v => (
              <label key={v} className="flex items-center gap-3 cursor-pointer group">
                <input
                  type="radio"
                  name="story-detail-voice"
                  value={v}
                  checked={(story?.voice || 'john') === v}
                  onChange={() => handleVoiceSelect(v)}
                  className="accent-violet-500"
                />
                <span className="text-gray-200 group-hover:text-white text-sm capitalize">{v}</span>
              </label>
            ))}
          </div>
        </Modal>
      )}
    </div>
  )
}
