import { useState, useEffect, useCallback } from 'react'
import { getStory } from '../api'
import Spinner from './Spinner'

const BASE_URL = import.meta.env.VITE_API_URL || ''

export default function StorybookModal({ story, onClose }) {
  const [items, setItems] = useState([])
  const [index, setIndex] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getStory(story.id)
      .then((data) => setItems(data.items || []))
      .finally(() => setLoading(false))
  }, [story.id])

  const prev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), [])
  const next = useCallback(() => setIndex((i) => Math.min(items.length - 1, i + 1)), [items.length])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'ArrowLeft') prev()
      if (e.key === 'ArrowRight') next()
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [prev, next, onClose])

  const item = items[index]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 shrink-0">
          <h2 className="text-lg font-semibold text-violet-300">{story.title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6 flex items-center justify-center min-h-64">
          {loading ? (
            <Spinner label="Loading..." />
          ) : items.length === 0 ? (
            <p className="text-gray-500 text-sm">This story has no content yet.</p>
          ) : item.type === 'image_scene' ? (
            <div className="space-y-4 w-full">
              {item.image_path ? (
                <img
                  src={`${BASE_URL}${item.image_path}`}
                  alt={item.description || 'Scene'}
                  className="w-full rounded-xl object-cover shadow-lg"
                />
              ) : (
                <div className="w-full h-64 bg-gray-800 rounded-xl flex items-center justify-center text-gray-500 text-sm">
                  No image generated yet
                </div>
              )}
              {item.description && (
                <p className="text-gray-400 text-sm text-center italic">
                  {item.description.replace(/\s*\([^)]*\)/g, '').trim()}
                </p>
              )}
            </div>
          ) : (
            <p className="text-gray-100 text-lg leading-relaxed whitespace-pre-wrap w-full">
              {item.narrative_text || <span className="text-gray-500 italic">No text yet.</span>}
            </p>
          )}
        </div>

        {/* Footer nav */}
        {!loading && items.length > 0 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-700 shrink-0">
            <button
              onClick={prev}
              disabled={index === 0}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-30 text-white rounded-lg transition-colors"
            >
              ← Prev
            </button>
            <span className="text-gray-400 text-sm">{index + 1} / {items.length}</span>
            <button
              onClick={next}
              disabled={index === items.length - 1}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-30 text-white rounded-lg transition-colors"
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
