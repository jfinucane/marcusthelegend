import { useRef, useState } from 'react'
import Spinner from './Spinner'

const BASE_URL = import.meta.env.VITE_API_URL || ''

/**
 * Reusable image component.
 * Props:
 *   imagePath     – current server-relative image URL or null
 *   onGenerate    – async fn() → { image_path }
 *   onUpload      – async fn(file) → { image_path }
 *   onImageChange – called with new imagePath after generate or upload
 *   onEdit        – optional async fn(modificationText) → { image_path, description }
 *   onEditChange  – optional fn(result) called after a successful edit
 */
export default function ImageBlock({ imagePath, onGenerate, onUpload, onImageChange, onEdit, onEditChange, extraButtons, onImageClick }) {
  const [generating, setGenerating] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [editText, setEditText] = useState('')
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState(null)
  const fileRef = useRef(null)

  async function handleGenerate() {
    setError(null)
    setGenerating(true)
    try {
      const res = await onGenerate()
      onImageChange(res.image_path)
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
      const res = await onUpload(file)
      onImageChange(res.image_path)
    } catch (e) {
      setError(e.message)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function handleEdit() {
    if (!editText.trim()) return
    setError(null)
    setEditing(true)
    try {
      const res = await onEdit(editText.trim())
      onImageChange(res.image_path)
      if (onEditChange) onEditChange(res)
      setEditMode(false)
      setEditText('')
    } catch (e) {
      setError(e.message)
    } finally {
      setEditing(false)
    }
  }

  const busy = generating || uploading || editing

  return (
    <div className="space-y-3">
      {imagePath ? (
        <div className="space-y-2">
          <img
            src={`${BASE_URL}${imagePath}`}
            alt="Generated"
            onClick={onImageClick}
            className={`w-full max-w-lg rounded-lg object-cover shadow-lg ${onImageClick ? 'cursor-pointer' : ''}`}
          />
          <div className="flex gap-2 flex-wrap">
            {onEdit && (
              <button
                onClick={() => { setEditMode((m) => !m); setEditText(''); setError(null) }}
                disabled={busy}
                className="px-3 py-1.5 text-sm bg-teal-700 hover:bg-teal-600 disabled:opacity-50 rounded-lg text-white transition-colors"
              >
                Edit Image
              </button>
            )}
            <button
              onClick={handleGenerate}
              disabled={busy}
              className="px-3 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg text-white transition-colors"
            >
              {generating ? <Spinner label="Regenerating..." /> : 'Regenerate'}
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded-lg text-white transition-colors"
            >
              {uploading ? <Spinner label="Uploading..." /> : 'Upload Image'}
            </button>
            {extraButtons}
          </div>

          {editMode && (
            <div className="flex gap-2 items-center mt-1">
              <input
                type="text"
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleEdit(); if (e.key === 'Escape') setEditMode(false) }}
                placeholder="Describe the modification..."
                autoFocus
                className="flex-1 bg-gray-900 text-gray-100 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 placeholder-gray-600"
              />
              <button
                onClick={handleEdit}
                disabled={editing || !editText.trim()}
                className="px-3 py-1.5 text-sm bg-teal-600 hover:bg-teal-500 disabled:opacity-50 rounded-lg text-white transition-colors"
              >
                {editing ? <Spinner label="Editing..." /> : 'Apply'}
              </button>
              <button
                onClick={() => { setEditMode(false); setEditText('') }}
                disabled={editing}
                className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded-lg text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          )}

          {error && (
            <div className="w-full max-w-lg rounded-lg bg-gray-800 border border-red-700 px-4 py-3 text-red-400 text-sm font-mono whitespace-pre-wrap">
              {error}
            </div>
          )}

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      ) : (
        <div className="space-y-3">
          {error && (
            <div className="w-full max-w-lg rounded-lg bg-gray-800 border border-red-700 px-4 py-3 text-red-400 text-sm font-mono whitespace-pre-wrap">
              {error}
            </div>
          )}
          <div className="flex gap-3 items-center flex-wrap">
            {generating ? (
              <Spinner label="Generating..." />
            ) : (
              <button
                onClick={handleGenerate}
                disabled={busy}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg text-white text-sm transition-colors"
              >
                {error ? 'Retry' : 'Generate Image'}
              </button>
            )}
            {uploading ? (
              <Spinner label="Uploading..." />
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded-lg text-white text-sm transition-colors"
              >
                Upload Image
              </button>
            )}
            {extraButtons}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        </div>
      )}
    </div>
  )
}
