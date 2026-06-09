'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { feedbackEnabled, setFeedbackEnabled } from '@/lib/feedback'

const STAKE_KEY = 'schnauz_default_stake'

export default function EinstellungenPage() {
  const router = useRouter()
  const [defaultStake, setDefaultStake] = useState(3)
  const [stakeInput, setStakeInput] = useState('3')
  const [saveMsg, setSaveMsg] = useState('')
  const [feedbackOn, setFeedbackOn] = useState(true)

  useEffect(() => {
    const saved = localStorage.getItem(STAKE_KEY)
    if (saved) {
      setDefaultStake(parseInt(saved))
      setStakeInput(saved)
    }
    setFeedbackOn(feedbackEnabled())
  }, [])

  function toggleFeedback() {
    const next = !feedbackOn
    setFeedbackOn(next)
    setFeedbackEnabled(next)
  }

  function saveStake() {
    const val = parseInt(stakeInput)
    if (!val || val < 1) return
    localStorage.setItem(STAKE_KEY, String(val))
    setDefaultStake(val)
    setSaveMsg('Gespeichert ✓')
    setTimeout(() => setSaveMsg(''), 2000)
  }

  return (
    <div className="flex flex-col max-w-md mx-auto w-full">
      {/* Header with back button */}
      <div className="flex items-center gap-2 px-3 pt-5 pb-4">
        <button
          onClick={() => router.back()}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-[#FFFDF7] text-[#23201A] text-2xl transition-colors"
          aria-label="Zurück"
        >
          ‹
        </button>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-[#23201A] tracking-tight">
          Einstellungen
        </h1>
      </div>

      <div className="px-4 py-2 space-y-6">
        {/* Default stake */}
        <div>
          <p className="text-[#7C7461] text-xs uppercase tracking-wider mb-3 font-medium">Basiseinsatz</p>
          <div className="flex gap-2">
            <div className="flex-1 flex items-center bg-[#FBF6EA] border border-[#E4D9BF] rounded-2xl px-4 focus-within:border-[#2E6B3A] transition-colors">
              <input
                type="number"
                min="1"
                step="1"
                value={stakeInput}
                onChange={e => setStakeInput(e.target.value)}
                className="flex-1 bg-transparent py-3 text-[#23201A] outline-none w-full"
              />
              <span className="text-[#7C7461]">€</span>
            </div>
            <button
              onClick={saveStake}
              className="bg-[#2E6B3A] hover:bg-[#3A8049] text-white font-semibold rounded-2xl px-5 text-sm transition-colors min-w-[110px]"
            >
              {saveMsg || 'Speichern'}
            </button>
          </div>
          <p className="text-[#7C7461] text-xs mt-2 leading-relaxed">
            Aktuell {defaultStake} € · Double {defaultStake * 2} € · Triple {defaultStake * 3} € · Quattro {defaultStake * 4} €
          </p>
        </div>

        {/* Sound & vibration */}
        <button
          onClick={toggleFeedback}
          className="w-full flex items-center justify-between bg-[#FBF6EA] border border-[#E4D9BF] rounded-2xl px-4 py-4"
        >
          <div className="text-left">
            <p className="text-[#23201A] font-medium">Sound & Vibration</p>
            <p className="text-[#7C7461] text-xs mt-0.5">Feedback beim Ausscheiden, Wiederbeleben & Gewinn</p>
          </div>
          <span className={`w-11 h-6 rounded-full p-0.5 transition-colors shrink-0 ${feedbackOn ? 'bg-[#2E6B3A]' : 'bg-[#E4D9BF]'}`}>
            <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${feedbackOn ? 'translate-x-5' : ''}`} />
          </span>
        </button>

        {/* Link to player management */}
        <Link
          href="/spieler"
          className="flex items-center justify-between bg-[#FBF6EA] border border-[#E4D9BF] rounded-2xl px-4 py-4 hover:border-[#2E6B3A]/50 transition-colors"
        >
          <div>
            <p className="text-[#23201A] font-medium">Spieler verwalten</p>
            <p className="text-[#7C7461] text-xs mt-0.5">Namen, Profilbilder & Status</p>
          </div>
          <span className="text-[#7C7461] text-lg">›</span>
        </Link>
      </div>
    </div>
  )
}
