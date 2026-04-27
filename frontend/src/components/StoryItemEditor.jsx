import { useState } from 'react'
import { Draggable } from '@hello-pangea/dnd'
import ImageBlock from './ImageBlock'
import Modal from './Modal'
import { updateItem, deleteItem, generateItemImage, uploadItemImage, editItemImage } from '../api'

const VOICES = ['john', 'sofia', 'aria', 'jason', 'leo']

export default function StoryItemEditor({ item, index, storyVoice, onUpdate, onDelete }) {
  const [text, setText] = useState(
    item.type === 'narrative' ? (item.narrative_text || '') : (item.description || '')
  )
  const [caption, setCaption] = useState(item.caption || '')
  const [adjustedText, setAdjustedText] = useState(item.adjusted_text || '')
  const [saving, setSaving] = useState(false)
  const [translating, setTranslating] = useState(false)
  const [error, setError] = useState(null)
  const [voiceModalOpen, setVoiceModalOpen] = useState(false)
  const [lastPrompt, setLastPrompt] = useState(null)
  const [promptModalOpen, setPromptModalOpen] = useState(false)

  async function autoTranslate(sourceText) {
    setTranslating(true)
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: sourceText }),
      })
      if (!res.ok) return
      const { translated } = await res.json()
      if (!translated) return
      setAdjustedText(translated)
      await updateItem(item.id, { adjusted_text: translated })
    } catch (e) {
      console.error('autoTranslate error', e)
    } finally {
      setTranslating(false)
    }
  }

  async function handleBlur() {
    const field = item.type === 'narrative' ? 'narrative_text' : 'description'
    if (text === (item[field] || '')) return
    setSaving(true)
    setError(null)
    try {
      const updated = await updateItem(item.id, { [field]: text })
      onUpdate(updated)
      if (item.type === 'narrative') await autoTranslate(text)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleCaptionBlur() {
    if (caption === (item.caption || '')) return
    setSaving(true)
    setError(null)
    try {
      const updated = await updateItem(item.id, { caption })
      onUpdate(updated)
      await autoTranslate(caption)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleAdjustedTextBlur() {
    if (adjustedText === (item.adjusted_text || '')) return
    setSaving(true)
    setError(null)
    try {
      const updated = await updateItem(item.id, { adjusted_text: adjustedText })
      onUpdate(updated)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

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

  async function handleVoiceSelect(voice) {
    const updated = await updateItem(item.id, { voice: voice === 'story' ? null : voice })
    onUpdate(updated)
    setVoiceModalOpen(false)
  }

  const effectiveVoiceLabel = item.voice ? item.voice : `story voice (${storyVoice || 'john'})`

  return (
    <>
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
            <div className="flex items-center gap-3">
              <button
                onClick={() => setVoiceModalOpen(true)}
                className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded-lg transition-colors"
                title={effectiveVoiceLabel}
              >
                Edit Voice
              </button>
              <button
                onClick={handleDelete}
                className="text-gray-500 hover:text-red-400 text-sm transition-colors"
              >
                Remove
              </button>
            </div>
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
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                onBlur={handleCaptionBlur}
                placeholder="Caption (optional)..."
                rows={2}
                className="w-full bg-gray-900 text-gray-100 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-600"
              />
              <ImageBlock
                imagePath={item.image_path}
                onGenerate={async () => {
                  const res = await generateItemImage(item.id)
                  if (res.prompt) setLastPrompt(res.prompt)
                  return res
                }}
                onUpload={(file) => uploadItemImage(item.id, file)}
                onImageChange={handleImageChange}
                onEdit={(modText) => editItemImage(item.id, modText)}
                onEditChange={(res) => {
                  setText(res.description || '')
                  onUpdate({ ...item, image_path: res.image_path, description: res.description })
                }}
                onImageClick={lastPrompt ? () => setPromptModalOpen(true) : undefined}
              />
              <textarea
                value={adjustedText}
                onChange={(e) => setAdjustedText(e.target.value)}
                onBlur={handleAdjustedTextBlur}
                placeholder="TTS override..."
                rows={2}
                className="hidden w-full bg-gray-900 text-gray-600 hover:text-gray-300 focus:text-gray-100 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-700 transition-colors"
              />
            </>
          ) : (
            <>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onBlur={handleBlur}
                placeholder="Write your narrative here..."
                rows={6}
                className="w-full bg-gray-900 text-gray-100 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-500 placeholder-gray-600"
              />
              <textarea
                value={adjustedText}
                onChange={(e) => setAdjustedText(e.target.value)}
                onBlur={handleAdjustedTextBlur}
                placeholder="TTS override..."
                rows={2}
                className="hidden w-full bg-gray-900 text-gray-600 hover:text-gray-300 focus:text-gray-100 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-500 placeholder-gray-700 transition-colors"
              />
            </>
          )}

          {saving && <p className="text-gray-500 text-xs">Saving...</p>}
          {translating && <p className="text-violet-400 text-xs">Generating TTS override...</p>}
          {error && <p className="text-red-400 text-xs">{error}</p>}
        </div>
      )}
    </Draggable>

      {promptModalOpen && (
        <Modal title="Image Prompt" onClose={() => setPromptModalOpen(false)}>
          <pre className="text-gray-300 text-xs whitespace-pre-wrap break-words font-mono bg-gray-900 rounded-lg p-3 max-h-96 overflow-y-auto">
            {lastPrompt}
          </pre>
        </Modal>
      )}

      {voiceModalOpen && (
        <Modal title="Item Voice" onClose={() => setVoiceModalOpen(false)}>
          <div className="space-y-2">
            <label className="flex items-center gap-3 cursor-pointer group">
              <input
                type="radio"
                name={`item-voice-${item.id}`}
                value="story"
                checked={!item.voice}
                onChange={() => handleVoiceSelect('story')}
                className="accent-violet-500"
              />
              <span className="text-gray-200 group-hover:text-white text-sm">
                story voice <span className="text-gray-500">({storyVoice || 'john'})</span>
              </span>
            </label>
            {VOICES.map(v => (
              <label key={v} className="flex items-center gap-3 cursor-pointer group">
                <input
                  type="radio"
                  name={`item-voice-${item.id}`}
                  value={v}
                  checked={item.voice === v}
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
