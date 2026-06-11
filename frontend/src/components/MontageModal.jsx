import { useState, useEffect, useRef, useCallback } from 'react'
import { getStory, kokoroTts } from '../api'
import Spinner from './Spinner'

const BASE_URL = import.meta.env.VITE_API_URL || ''

function getSlideText(item) {
  if (item.type === 'image_scene') return item.caption || item.adjusted_text || ''
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
  const [isPortrait, setIsPortrait] = useState(false)
  const isPortraitRef = useRef(false)

  const audioRef = useRef(null)
  const startedRef = useRef(-1)
  const noAudioTimerRef = useRef(null)
  const blobUrlsRef = useRef([])

  useEffect(() => {
    getStory(story.id)
      .then(data => {
        const titleSlide = {
          id: '__title__',
          type: 'image_scene',
          image_path: story.image_path,
          caption: story.title,
          narrative_text: null,
          adjusted_text: null,
        }
        setItems([titleSlide, ...(data.items || [])])
      })
      .finally(() => setLoading(false))
  }, [story.id])

  const fetchAudio = useCallback(async (idx, itemsList) => {
    if (idx < 0 || idx >= itemsList.length) return
    const text = getSlideText(itemsList[idx]).trim()
    if (!text) {
      setAudioBlobUrls(prev => ({ ...prev, [idx]: null }))
      return
    }
    try {
      const blob = await kokoroTts(story.id, text)
      const url = URL.createObjectURL(blob)
      blobUrlsRef.current.push(url)
      const duration = await new Promise(resolve => {
        const a = new Audio(url)
        a.onloadedmetadata = () => resolve(a.duration)
        a.onerror = () => resolve(5)
      })
      setAudioBlobUrls(prev => ({ ...prev, [idx]: { url, duration } }))
    } catch (e) {
      console.error('Kokoro TTS error', e)
      setAudioBlobUrls(prev => ({ ...prev, [idx]: null }))
    }
  }, [story.id])

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
      const isLandscapeImage = items[index]?.type === 'image_scene' && !isPortraitRef.current
      noAudioTimerRef.current = setTimeout(advance, isPortraitRef.current ? 10000 : (isLandscapeImage ? 7000 : 3000))
      return
    }

    const { url, duration } = entry
    const isImage = items[index]?.type === 'image_scene'
    const isTitleSlide = items[index]?.id === '__title__'
    const currentItem = items[index]
    const portraitUsesAdjustedText = isPortraitRef.current && currentItem?.adjusted_text && !currentItem?.caption
    const PRE_PAD = isTitleSlide ? 0 : (isPortraitRef.current ? (portraitUsesAdjustedText ? 2000 : 10000) : (isImage ? 2000 : 0))
    const POST_PAD = isTitleSlide ? 5000 : PRE_PAD

    setSlideDuration(isImage ? duration + 4 : duration)

    const audio = audioRef.current
    noAudioTimerRef.current = setTimeout(() => {
      audio.src = url
      audio.play().catch(console.error)
      audio.onended = () => {
        noAudioTimerRef.current = setTimeout(advance, POST_PAD)
      }
    }, PRE_PAD)
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

  function jumpSlide(delta) {
    clearTimeout(noAudioTimerRef.current)
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
    }
    startedRef.current = -1
    const next = index + delta
    if (next < 0 || next >= items.length) return
    setIndex(next)
    if (audioBlobUrls[next] === undefined) fetchAudio(next, items)
  }

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

  useEffect(() => {
    if (!item || item.type !== 'image_scene' || !item.image_path) {
      setIsPortrait(false)
      return
    }
    const img = new window.Image()
    img.onload = () => { const p = img.naturalHeight > img.naturalWidth; isPortraitRef.current = p; setIsPortrait(p) }
    img.onerror = () => { isPortraitRef.current = false; setIsPortrait(false) }
    img.src = `${BASE_URL}${item.image_path}`
  }, [index, item])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90">
      <audio ref={audioRef} hidden />
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
                <div className={`relative overflow-hidden rounded-xl flex items-center justify-center ${isPortrait ? 'max-h-[80vh]' : 'h-[60vh]'}`}>
                  <img
                    key={index}
                    src={`${BASE_URL}${item.image_path}`}
                    alt={item.description || 'Scene'}
                    className={isPortrait ? 'max-h-[80vh] w-auto object-contain' : 'w-full h-full object-cover ken-burns'}
                    style={isPortrait ? undefined : { animationDuration: `${slideDuration}s` }}
                  />
                  {isPortrait && (
                    <>
                      <button
                        onClick={() => jumpSlide(-1)}
                        disabled={index === 0}
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-16 h-16 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/70 text-white disabled:opacity-20 transition-colors text-5xl"
                      >
                        ‹
                      </button>
                      <button
                        onClick={() => jumpSlide(1)}
                        disabled={index === items.length - 1}
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-16 h-16 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/70 text-white disabled:opacity-20 transition-colors text-5xl"
                      >
                        ›
                      </button>
                    </>
                  )}
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
