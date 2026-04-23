import { useRef, useState } from 'react'
import { generateEntityImage, uploadEntityImage } from '../api'
import Spinner from './Spinner'

const BASE_URL = import.meta.env.VITE_API_URL || ''

const TYPE_LABELS = { character: 'Person', place: 'Place', item: 'Thing', other: 'Other' }

export default function EntityCard({ entity: initial, onEdit, onDelete }) {
  const [entity, setEntity] = useState(initial)
  const [generating, setGenerating] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState(null)
  const fileRef = useRef(null)

  const busy = generating || uploading

  async function handleGenerate() {
    setError(null)
    setGenerating(true)
    try {
      const res = await generateEntityImage(entity.id)
      setEntity((e) => ({ ...e, image_path: res.image_path }))
    } catch (e) {
      setError(e.message)
    } finally {
      setGenerating(false)
    }
  }

  async function handleFileChange(e) {
    const file = e.target.files[0]
    if (!file) return
    setError(null)
    setUploading(true)
    try {
      const res = await uploadEntityImage(entity.id, file)
      setEntity((e) => ({ ...e, image_path: res.image_path }))
    } catch (e) {
      setError(e.message)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  function handleDeleteClick() {
    if (confirmDelete) {
      onDelete(entity.id)
    } else {
      setConfirmDelete(true)
    }
  }

  return (
    <div className="bg-gray-800 rounded-xl overflow-hidden shadow flex flex-col">
      {entity.image_path ? (
        <img
          src={`${BASE_URL}${entity.image_path}`}
          alt={entity.name}
          className="w-full h-32 object-cover"
        />
      ) : (
        <div className="w-full h-32 bg-gray-700 flex items-center justify-center text-gray-500 text-sm">
          No image
        </div>
      )}

      <div className="p-3 flex flex-col flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-900 text-amber-300">
            {TYPE_LABELS[entity.entity_type] || entity.entity_type}
          </span>
          <h3 className="text-sm font-semibold text-gray-100 truncate">{entity.name}</h3>
        </div>

        {entity.description && (
          <p className="text-gray-400 text-xs line-clamp-2 flex-1">{entity.description}</p>
        )}

        {error && (
          <p className="text-red-400 text-xs">{error}</p>
        )}

        <div className="flex gap-1.5 flex-wrap pt-1">
          {entity.image_path ? (
            <>
              <button
                onClick={handleGenerate}
                disabled={busy}
                className="flex-1 py-1 text-xs bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white rounded-lg transition-colors"
              >
                {generating ? <Spinner label="..." /> : 'Regenerate'}
              </button>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="flex-1 py-1 text-xs bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white rounded-lg transition-colors"
              >
                {uploading ? <Spinner label="..." /> : 'Upload'}
              </button>
            </>
          ) : (
            <>
              {generating ? (
                <div className="flex-1 flex justify-center py-1">
                  <Spinner label="Generating..." />
                </div>
              ) : (
                <button
                  onClick={handleGenerate}
                  disabled={busy}
                  className="flex-1 py-1 text-xs bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-lg transition-colors"
                >
                  {error ? 'Retry' : 'Generate Image'}
                </button>
              )}
              {!generating && (
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={busy}
                  className="flex-1 py-1 text-xs bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white rounded-lg transition-colors"
                >
                  {uploading ? <Spinner label="..." /> : 'Upload'}
                </button>
              )}
            </>
          )}
          <button
            onClick={() => onEdit(entity)}
            disabled={busy}
            className="py-1 px-2 text-xs bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white rounded-lg transition-colors"
          >
            Edit
          </button>
          <button
            onClick={handleDeleteClick}
            onBlur={() => setConfirmDelete(false)}
            disabled={busy}
            className={`py-1 px-2 text-xs rounded-lg transition-colors text-white ${
              confirmDelete ? 'bg-red-600 hover:bg-red-500' : 'bg-gray-700 hover:bg-red-800'
            }`}
            title={confirmDelete ? 'Click again to confirm' : 'Delete'}
          >
            {confirmDelete ? 'Sure?' : '🗑'}
          </button>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  )
}
