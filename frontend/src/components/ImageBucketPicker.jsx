import { useEffect, useState } from 'react'
import { listImageBuckets } from '../api'

const BASE_URL = import.meta.env.VITE_API_URL || ''
const PREVIEW_SIZE = 280

export default function ImageBucketPicker({ onSelect, onClose }) {
  const [buckets, setBuckets] = useState([])
  const [selectedBucket, setSelectedBucket] = useState(null)
  const [loading, setLoading] = useState(true)
  const [preview, setPreview] = useState(null) // { path, x, y }

  useEffect(() => {
    listImageBuckets().then((data) => {
      setBuckets(data.buckets)
      if (data.buckets.length > 0) setSelectedBucket(data.buckets[0].name)
      setLoading(false)
    })
  }, [])

  const currentFiles = buckets.find((b) => b.name === selectedBucket)?.files || []

  function handleMouseEnter(e, path) {
    const rect = e.currentTarget.getBoundingClientRect()
    const spaceRight = window.innerWidth - rect.right
    const spaceBelow = window.innerHeight - rect.top
    const x = spaceRight >= PREVIEW_SIZE + 16
      ? rect.right + 8
      : rect.left - PREVIEW_SIZE - 8
    const y = spaceBelow >= PREVIEW_SIZE
      ? rect.top
      : Math.max(8, rect.bottom - PREVIEW_SIZE)
    setPreview({ path, x, y })
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      {preview && (
        <div
          style={{
            position: 'fixed',
            left: preview.x,
            top: preview.y,
            width: PREVIEW_SIZE,
            height: PREVIEW_SIZE,
            zIndex: 60,
            pointerEvents: 'none',
            borderRadius: 8,
            overflow: 'hidden',
            boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
          }}
        >
          <img
            src={`${BASE_URL}${preview.path}`}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </div>
      )}

      <div
        className="bg-gray-900 rounded-xl shadow-2xl flex flex-col overflow-hidden"
        style={{ width: 900, height: 560 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 flex-shrink-0">
          <h2 className="text-white text-sm font-semibold">Select from Image Buckets</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-lg leading-none"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left sidebar – bucket list */}
          <div className="w-36 border-r border-gray-700 overflow-y-auto flex-shrink-0 bg-gray-850">
            {loading ? (
              <div className="p-3 text-gray-500 text-xs">Loading...</div>
            ) : (
              buckets.map((bucket) => (
                <button
                  key={bucket.name}
                  onClick={() => setSelectedBucket(bucket.name)}
                  className={`w-full text-left px-4 py-2.5 text-sm capitalize transition-colors ${
                    selectedBucket === bucket.name
                      ? 'bg-indigo-700 text-white'
                      : 'text-gray-300 hover:bg-gray-800'
                  }`}
                >
                  {bucket.name}
                </button>
              ))
            )}
          </div>

          {/* Right panel – thumbnails */}
          <div className="flex-1 overflow-auto p-6">
            {loading ? null : currentFiles.length === 0 ? (
              <p className="text-gray-500 text-sm">No images in this bucket.</p>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(10, 50px)',
                  gap: '50px',
                  width: 'max-content',
                }}
              >
                {currentFiles.map((file) => (
                  <img
                    key={file.path}
                    src={`${BASE_URL}${file.path}`}
                    title={file.name}
                    onClick={() => { onSelect(file.path); onClose() }}
                    onMouseEnter={(e) => handleMouseEnter(e, file.path)}
                    onMouseLeave={() => setPreview(null)}
                    style={{ width: 50, height: 50, objectFit: 'cover', borderRadius: 4, cursor: 'pointer' }}
                    className="hover:ring-2 hover:ring-indigo-400 transition-all"
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
