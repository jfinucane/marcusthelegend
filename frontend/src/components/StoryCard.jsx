import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import StorybookModal from './StorybookModal'
import MontageModal from './MontageModal'
import Modal from './Modal'
import { updateStory } from '../api'

const BASE_URL = import.meta.env.VITE_API_URL || ''
const VOICES = ['john', 'sofia', 'aria', 'jason', 'leo']

export default function StoryCard({ story: initialStory, onEdit, onDelete }) {
  const navigate = useNavigate()
  const [story, setStory] = useState(initialStory)
  const [showStorybook, setShowStorybook] = useState(false)
  const [showMontage, setShowMontage] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [voiceModalOpen, setVoiceModalOpen] = useState(false)

  async function handleVoiceSelect(voice) {
    const updated = await updateStory(story.id, { voice })
    setStory(updated)
    setVoiceModalOpen(false)
  }

  function handleDeleteClick() {
    if (confirmDelete) {
      onDelete(story.id)
    } else {
      setConfirmDelete(true)
    }
  }

  return (
    <>
      <div className="bg-gray-800 rounded-xl overflow-hidden shadow flex flex-col">
        {story.image_path ? (
          <img
            src={`${BASE_URL}${story.image_path}`}
            alt={story.title}
            className="w-full h-36 object-cover"
          />
        ) : (
          <div className="w-full h-36 bg-gray-700 flex items-center justify-center text-gray-500 text-sm">
            No image
          </div>
        )}
        <div className="p-4 flex flex-col flex-1">
          <h3 className="text-base font-semibold text-gray-100 mb-1">{story.title}</h3>
          <p className="text-gray-400 text-sm flex-1 line-clamp-2">{story.description}</p>
          <div className="flex gap-2 mt-3 flex-wrap">
            <button
              onClick={() => navigate(`/stories/${story.id}`)}
              className="flex-1 py-1.5 bg-violet-600 hover:bg-violet-500 text-white text-sm rounded-lg transition-colors"
            >
              Open
            </button>
            <button
              onClick={() => onEdit(story)}
              className="flex-1 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors"
            >
              Edit
            </button>
            <button
              onClick={() => setShowStorybook(true)}
              className="flex-1 py-1.5 bg-indigo-700 hover:bg-indigo-600 text-white text-sm rounded-lg transition-colors"
            >
              Read
            </button>
            <button
              onClick={() => setShowMontage(true)}
              className="flex-1 py-1.5 bg-violet-700 hover:bg-violet-600 text-white text-sm rounded-lg transition-colors"
            >
              Watch
            </button>
            <button
              onClick={handleDeleteClick}
              onBlur={() => setConfirmDelete(false)}
              className={`py-1.5 px-3 text-sm rounded-lg transition-colors text-white ${
                confirmDelete
                  ? 'bg-red-600 hover:bg-red-500'
                  : 'bg-gray-700 hover:bg-red-800'
              }`}
              title={confirmDelete ? 'Click again to confirm' : 'Delete story'}
            >
              {confirmDelete ? 'Sure?' : '🗑'}
            </button>
          </div>
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => setVoiceModalOpen(true)}
              className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded-lg text-white transition-colors"
              title={`Voice: ${story.voice || 'john'}`}
            >
              Edit Voice
            </button>
          </div>
        </div>
      </div>

      {showStorybook && (
        <StorybookModal story={story} onClose={() => setShowStorybook(false)} />
      )}
      {showMontage && (
        <MontageModal story={story} onClose={() => setShowMontage(false)} />
      )}
      {voiceModalOpen && (
        <Modal title="Story Voice" onClose={() => setVoiceModalOpen(false)}>
          <div className="space-y-2">
            {VOICES.map(v => (
              <label key={v} className="flex items-center gap-3 cursor-pointer group">
                <input
                  type="radio"
                  name="story-voice"
                  value={v}
                  checked={(story.voice || 'john') === v}
                  onChange={() => handleVoiceSelect(v)}
                  className="accent-violet-500"
                />
                <span className="text-gray-200 group-hover:text-white text-sm capitalize">{v}</span>
              </label>
            ))}
          </div>
        </Modal>
      )}
    </>
  )
}
