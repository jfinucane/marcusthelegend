import { useState } from 'react'
import { setKokoroVoice } from '../api'

const RASPBERRY = '#D63A5A'   // female — boosted from #C24160
const SLATE     = '#4F85B0'   // male   — boosted from #5B7B9C

const AF_VOICES = [
  { id: 'af_heart',   label: 'Heart',   description: 'Warm, expressive' },
  { id: 'af_alloy',   label: 'Alloy',   description: 'Neutral, balanced' },
  { id: 'af_aoede',   label: 'Aoede',   description: 'Melodic, clear' },
  { id: 'af_bella',   label: 'Bella',   description: 'Bright, energetic' },
  { id: 'af_jessica', label: 'Jessica', description: 'Natural, conversational' },
  { id: 'af_kore',    label: 'Kore',    description: 'Crisp, professional' },
  { id: 'af_nicole',  label: 'Nicole',  description: 'Smooth, relaxed' },
  { id: 'af_nova',    label: 'Nova',    description: 'Dynamic, engaging' },
  { id: 'af_river',   label: 'River',   description: 'Calm, flowing' },
  { id: 'af_sarah',   label: 'Sarah',   description: 'Friendly, approachable' },
  { id: 'af_sky',     label: 'Sky',     description: 'Light, airy' },
]

const AM_VOICES = [
  { id: 'am_adam',    label: 'Adam',    description: 'Deep, authoritative' },
  { id: 'am_echo',    label: 'Echo',    description: 'Resonant, clear' },
  { id: 'am_eric',    label: 'Eric',    description: 'Warm, friendly' },
  { id: 'am_fenrir',  label: 'Fenrir',  description: 'Bold, powerful' },
  { id: 'am_liam',    label: 'Liam',    description: 'Casual, youthful' },
  { id: 'am_michael', label: 'Michael', description: 'Steady, professional' },
  { id: 'am_onyx',    label: 'Onyx',    description: 'Rich, smooth' },
  { id: 'am_puck',    label: 'Puck',    description: 'Playful, expressive' },
  { id: 'am_santa',   label: 'Santa',   description: 'Jolly, warm' },
]

function VoiceOption({ voice, color, selected, onChange }) {
  const isSelected = selected === voice.id
  const isDimmed = selected && !isSelected
  return (
    <label
      className="flex items-start gap-2.5 cursor-pointer py-1.5 group"
      style={{ opacity: isDimmed ? 0.45 : 1 }}
    >
      <input
        type="radio"
        name="kokoro-voice"
        value={voice.id}
        checked={isSelected}
        onChange={() => onChange(voice.id)}
        className="shrink-0 mt-0.5"
        style={{ accentColor: color }}
      />
      <div>
        <div className="text-sm font-semibold leading-tight" style={{ color: isSelected ? color : '#C8C8D8' }}>
          {voice.label}
        </div>
        <div className="text-xs leading-tight mt-0.5" style={{ color: isSelected ? color : '#6B6B80', opacity: isSelected ? 0.8 : 1 }}>
          {voice.description}
        </div>
      </div>
    </label>
  )
}

export default function KokoroVoiceModal({ storyId, currentVoice, onClose, onSave }) {
  const [selected, setSelected] = useState(currentVoice || null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit() {
    if (!selected) return
    setSaving(true)
    try {
      const updated = await setKokoroVoice(storyId, selected)
      onSave?.(updated)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const submitColor = selected?.startsWith('af_') ? RASPBERRY : SLATE

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="rounded-xl shadow-2xl w-full max-w-lg mx-4 flex flex-col max-h-[85vh]"
        style={{ backgroundColor: '#1A1A24' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h2 className="text-white font-semibold text-sm tracking-wide">Kokoro Voice</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">&times;</button>
        </div>

        <div className="overflow-y-auto px-5 py-4 grid grid-cols-2 gap-x-8">
          <div>
            <div className="h-0.5 mb-3 rounded-full" style={{ backgroundColor: RASPBERRY }} />
            {AF_VOICES.map(v => (
              <VoiceOption key={v.id} voice={v} color={RASPBERRY} selected={selected} onChange={setSelected} />
            ))}
          </div>
          <div>
            <div className="h-0.5 mb-3 rounded-full" style={{ backgroundColor: SLATE }} />
            {AM_VOICES.map(v => (
              <VoiceOption key={v.id} voice={v} color={SLATE} selected={selected} onChange={setSelected} />
            ))}
          </div>
        </div>

        <div className="flex gap-3 px-5 py-4 border-t border-white/10">
          <button
            onClick={handleSubmit}
            disabled={!selected || saving}
            className="flex-1 py-2 text-white text-sm rounded-lg transition-opacity disabled:opacity-40"
            style={{ backgroundColor: selected ? submitColor : '#3A3A50' }}
          >
            {saving ? 'Saving…' : 'Submit'}
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2 text-sm rounded-lg text-gray-300 transition-colors"
            style={{ backgroundColor: '#2A2A38' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
