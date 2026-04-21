import { useState, useEffect, useRef, useCallback } from 'react'
import { getStory } from '../api'
import Spinner from './Spinner'

const BASE_URL = import.meta.env.VITE_API_URL || ''

function getSlideText(item) {
  if (item.adjusted_text?.trim()) return item.adjusted_text.trim()
  if (item.type === 'image_scene') return item.caption || ''
  return item.narrative_text || ''
}

export default function MontageModal({ story, onClose }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [playing, setPlaying] = useState(false)
  const [index, setIndex] = useState(0)
  const [slideDuration, setSlideDuration] = useState(8)

  // audioBlobUrls[idx]: { url, duration } | null (no audio) | undefined (not fetched yet)
  const [audioBlobUrls, setAudioBlobUrls] = useState({})

  const audioRef = useRef(null)
  const startedRef = useRef(-1)
  const noAudioTimerRef = useRef(null)
  const blobUrlsRef = useRef([])

  useEffect(() => {
    getStory(story.id)
      .then(data => setItems(data.items || []))
      .finally(() => setLoading(false))
  }, [story.id])

  const fetchAudio = useCallback(async (idx, itemsList) => {
    if (idx < 0 || idx >= itemsList.length) return
    const text = getSlideText(itemsList[idx]).trim()
    if (!text) {
      setAudioBlobUrls(prev => ({ ...prev, [idx]: null }))
      return
    }
    const effectiveVoice = itemsList[idx].voice || story.voice || 'john'
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: effectiveVoice }),
      })
      if (!res.ok) {
        setAudioBlobUrls(prev => ({ ...prev, [idx]: null }))
        return
      }
      const blob = await res.blob()
      // WAV: 1ch, 2 bytes/sample, 22000 Hz
      const duration = blob.size / (22000 * 2)
      const url = URL.createObjectURL(blob)
      blobUrlsRef.current.push(url)
      setAudioBlobUrls(prev => ({ ...prev, [idx]: { url, duration } }))
    } catch (e) {
      console.error('TTS error', e)
      setAudioBlobUrls(prev => ({ ...prev, [idx]: null }))
    }
  }, [])

  useEffect(() => {
    if (!playing) return
    const entry = audioBlobUrls[index]
    if (entry === undefined) return       // still fetching
    if (startedRef.current === index) return  // already started this slide

    startedRef.current = index

    const advance = () => {
      if (index + 1 < items.length) {
        setIndex(i => i + 1)
      } else {
        setPlaying(false)
        startedRef.current = -1
      }
    }

    fetchAudio(index + 1, items)

    if (entry === null) {
      // No audio — show slide for 3s then advance
      noAudioTimerRef.current = setTimeout(advance, 3000)
      return
    }

    const { url, duration } = entry
    const isImage = items[index]?.type === 'image_scene'
    const PAD = isImage ? 2000 : 0

    setSlideDuration(isImage ? duration + 4 : duration)

    const audio = audioRef.current
    noAudioTimerRef.current = setTimeout(() => {
      audio.src = url
      audio.play().catch(console.error)
      audio.onended = () => {
        noAudioTimerRef.current = setTimeout(advance, PAD)
      }
    }, PAD)
  }, [playing, index, audioBlobUrls, items, fetchAudio])

  useEffect(() => {
    return () => {
      clearTimeout(noAudioTimerRef.current)
      blobUrlsRef.current.forEach(u => URL.revokeObjectURL(u))
    }
  }, [])

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function startMontage() {
    clearTimeout(noAudioTimerRef.current)
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
    }
    startedRef.current = -1
    setAudioBlobUrls({})
    setIndex(0)
    setSlideDuration(8)
    setPlaying(true)
    fetchAudio(0, items)
  }

  const item = items[index]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90">
      <audio ref={audioRef} />
      <div className="bg-gray-900 rounded-2xl shadow-2xl w-full max-w-5xl mx-4 flex flex-col max-h-[90vh]">

        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 shrink-0">
          <h2 className="text-lg font-semibold text-violet-300">{story.title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
        </div>

        <div className="flex-1 overflow-hidden px-6 py-6 flex items-center justify-center min-h-64">
          {loading ? (
            <Spinner label="Loading..." />
          ) : !playing ? (
            <button
              onClick={startMontage}
              disabled={items.length === 0}
              className="px-8 py-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-lg rounded-xl transition-colors"
            >
              ▶ Play
            </button>
          ) : !item ? null : item.type === 'image_scene' ? (
            <div className="w-full space-y-4">
              {item.image_path ? (
                <div className="overflow-hidden rounded-xl h-[60vh]">
                  <img
                    key={index}
                    src={`${BASE_URL}${item.image_path}`}
                    alt={item.description || 'Scene'}
                    className="w-full h-full object-cover ken-burns"
                    style={{ animationDuration: `${slideDuration}s` }}
                  />
                </div>
              ) : (
                <div className="w-full h-[60vh] bg-gray-800 rounded-xl flex items-center justify-center text-gray-500 text-sm">
                  No image
                </div>
              )}
              {item.caption && (
                <p className="text-gray-300 text-sm text-center italic">{item.caption}</p>
              )}
            </div>
          ) : (
            <p key={index} className="text-gray-100 text-xl leading-relaxed whitespace-pre-wrap w-full">
              {item.narrative_text || <span className="text-gray-500 italic">No text.</span>}
            </p>
          )}
        </div>

        {playing && items.length > 0 && (
          <div className="px-6 py-4 border-t border-gray-700 shrink-0 text-center text-gray-400 text-sm">
            {index + 1} / {items.length}
          </div>
        )}
      </div>
    </div>
  )
}
