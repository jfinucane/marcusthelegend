import { useState, useCallback } from 'react'
import { Draggable } from '@hello-pangea/dnd'
import ImageBlock from './ImageBlock'
import { updateItem, deleteItem, generateItemImage, uploadItemImage, editItemImage } from '../api'

export default function StoryItemEditor({ item, index, onUpdate, onDelete }) {
  const [text, setText] = useState(
    item.type === 'narrative' ? (item.narrative_text || '') : (item.description || '')
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const handleBlur = useCallback(async () => {
    const field = item.type === 'narrative' ? 'narrative_text' : 'description'
    if (text === (item[field] || '')) return
    setSaving(true)
    setError(null)
    try {
      const updated = await updateItem(item.id, { [field]: text })
      onUpdate(updated)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }, [item, text, onUpdate])

  async function handleDelete() {
    if (!confirm('Delete this item?')) return
    try {
      await deleteItem(item.id)
      onDelete(item.id)
    } catch (e) {
      setError(e.message)
    }
  }

  function handleImageChange(imagePath) {
    onUpdate({ ...item, image_path: imagePath })
  }

  return (
    <Draggable draggableId={item.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          className={`bg-gray-800 rounded-xl p-4 space-y-3 border ${
            snapshot.isDragging ? 'border-indigo-500 shadow-xl' : 'border-gray-700'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                {...provided.dragHandleProps}
                className="text-gray-500 hover:text-gray-300 cursor-grab active:cursor-grabbing select-none text-xl"
                title="Drag to reorder"
              >
                ⠿
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                item.type === 'image_scene'
                  ? 'bg-indigo-900 text-indigo-300'
                  : 'bg-violet-900 text-violet-300'
              }`}>
                {item.type === 'image_scene' ? 'Image Scene' : 'Narrative'}
              </span>
            </div>
            <button
              onClick={handleDelete}
              className="text-gray-500 hover:text-red-400 text-sm transition-colors"
            >
              Remove
            </button>
          </div>

          {item.type === 'image_scene' ? (
            <>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onBlur={handleBlur}
                placeholder="Describe the scene for image generation..."
                rows={3}
                className="w-full bg-gray-900 text-gray-100 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-600"
              />
              <ImageBlock
                imagePath={item.image_path}
                onGenerate={() => generateItemImage(item.id)}
                onUpload={(file) => uploadItemImage(item.id, file)}
                onImageChange={handleImageChange}
                onEdit={(modText) => editItemImage(item.id, modText)}
                onEditChange={(res) => {
                  setText(res.description || '')
                  onUpdate({ ...item, image_path: res.image_path, description: res.description })
                }}
              />
            </>
          ) : (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onBlur={handleBlur}
              placeholder="Write your narrative here..."
              rows={6}
              className="w-full bg-gray-900 text-gray-100 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-500 placeholder-gray-600"
            />
          )}

          {saving && <p className="text-gray-500 text-xs">Saving...</p>}
          {error && <p className="text-red-400 text-xs">{error}</p>}
        </div>
      )}
    </Draggable>
  )
}
