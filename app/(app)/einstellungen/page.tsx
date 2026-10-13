'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { isTestMode, setTestMode } from '@/lib/supabase/client'
import { resetTestData } from '@/lib/supabase/testdb'
import { useRouter } from 'next/navigation'
import {
  soundEnabled,
  vibrationSupported,
  vibrationEnabled,
  setVibrationEnabled,
  vib,
  setSoundEnabled,
  animationsEnabled,
  setAnimationsEnabled,
  initFeedback,
  feedbackEliminate,
  feedbackRevive,
  feedbackFire,
  feedbackWinner,
} from '@/lib/feedback'
import EffectPreview from '@/components/ui/EffectPreview'

const SOUND_TESTS = [
  { label: '🪦 Raus', play: feedbackEliminate },
  { label: '💉 Belebt', play: feedbackRevive },
  { label: '🔥 Feuer', play: feedbackFire },
  { label: '🪙 Sieg', play: () => feedbackWinner() },
  { label: '🩸 First Blood', play: () => feedbackWinner({ firstBlood: true }) },
]

const STAKE_KEY = 'schnauz_default_stake'

export default function EinstellungenPage() {
  const router = useRouter()
  const [defaultStake, setDefaultStake] = useState(3)
  const [stakeInput, setStakeInput] = useState('3')
  const [saveMsg, setSaveMsg] = useState('')
  const [soundOn, setSoundOn] = useState(true)
  const [vibSupported, setVibSupported] = useState(true)
  const [vibOn, setVibOn] = useState(true)
  const [animOn, setAnimOn] = useState(true)
  const [testOn, setTestOn] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem(STAKE_KEY)
    if (saved) {
      setDefaultStake(parseInt(saved))
      setStakeInput(saved)
    }
    setSoundOn(soundEnabled())
    setVibSupported(vibrationSupported())
    setVibOn(vibrationEnabled())
    setAnimOn(animationsEnabled())
    setTestOn(isTestMode())
    initFeedback()
  }, [])

  function toggleTestMode() {
    const msg = testOn
      ? 'Testmodus beenden? Danach wird wieder mit den echten Daten gespielt.'
      : 'Testmodus starten? Seasons, Sessions und Runden laufen dann nur zum Ausprobieren auf diesem Gerät – echte Daten und Statistiken bleiben unberührt.'
    if (confirm(msg)) setTestMode(!testOn) // reloads the app
  }

  function resetTest() {
    if (!confirm('Alle Testdaten (Test-Seasons, -Sessions und -Runden) löschen?')) return
    resetTestData()
    window.location.reload()
  }

  function toggleAnimations() {
    const next = !animOn
    setAnimOn(next)
    setAnimationsEnabled(next)
  }

  function toggleVibration() {
    const next = !vibOn
    setVibOn(next)
    setVibrationEnabled(next)
    if (next) vib(200) // instant proof it works
  }

  function toggleSound() {
    const next = !soundOn
    setSoundOn(next)
    setSoundEnabled(next)
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
            Einsatz-Optionen beim Rundenstart: {defaultStake} € · {defaultStake * 2} € · {defaultStake * 3} € ·{' '}
            {defaultStake * 4} € · {defaultStake * 5} € · {defaultStake * 6} € · {defaultStake * 7} € (oder eigener
            Betrag)
          </p>
        </div>

        {/* Sound */}
        <div className="bg-[#FBF6EA] border border-[#E4D9BF] rounded-2xl overflow-hidden">
          <Toggle
            title="Sound"
            desc="Beim Ausscheiden, Wiederbeleben, Feuer & Rundensieg"
            on={soundOn}
            onToggle={toggleSound}
          />
          {(soundOn || vibOn) && (
            <div className="px-4 pb-3.5">
              <p className="text-[#7C7461] text-[11px] mb-2">Zum Testen antippen (Sound und Vibration):</p>
              <div className="grid grid-cols-3 gap-1.5">
                {SOUND_TESTS.map(t => (
                  <button
                    key={t.label}
                    onClick={t.play}
                    className="bg-[#FFFDF7] border border-[#E4D9BF] rounded-xl py-2 text-xs font-medium text-[#23201A] active:bg-[#E4D9BF]"
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <p className="text-[#7C7461] text-[11px] mt-2 leading-snug">
                iPhone: Ton nur, wenn der Stumm-Schalter aus ist.
              </p>
            </div>
          )}
        </div>

        {/* Vibration — only Android browsers support it */}
        <div className="bg-[#FBF6EA] border border-[#E4D9BF] rounded-2xl overflow-hidden">
          {vibSupported ? (
            <>
              <Toggle
                title="Vibration"
                desc="Beim Ausscheiden, Wiederbeleben, Feuer & Rundensieg"
                on={vibOn}
                onToggle={toggleVibration}
              />
              {vibOn && (
                <p className="px-4 pb-3.5 -mt-1 text-[#7C7461] text-[11px] leading-snug">
                  Spürst du nichts? Stumm- und Nicht-stören-Modus ausschalten und in den Android-Einstellungen
                  „Vibration &amp; Haptik“ aktivieren.
                </p>
              )}
            </>
          ) : (
            <div className="px-4 py-4">
              <p className="text-[#7C7461] font-medium">Vibration</p>
              <p className="text-[#7C7461] text-xs mt-0.5 leading-snug">
                Auf diesem Gerät nicht verfügbar: Apple erlaubt Web-Apps auf dem iPhone keine Vibration. Auf
                Android-Handys funktioniert sie.
              </p>
            </div>
          )}
        </div>

        {/* Animations */}
        <div className="bg-[#FBF6EA] border border-[#E4D9BF] rounded-2xl overflow-hidden">
          <Toggle
            title="Animationen"
            desc="Grabstein, Spritze, Feuerexplosion, Münzregen, Feuerring, Blut, Blitze & Noob-Schild"
            on={animOn}
            onToggle={toggleAnimations}
          />
        </div>

        {/* Test mode */}
        <div className={`rounded-2xl overflow-hidden border ${testOn ? 'bg-[#5B3F99]/10 border-[#5B3F99]/50' : 'bg-[#FBF6EA] border-[#E4D9BF]'}`}>
          <Toggle
            title="🧪 Testmodus"
            desc="Seasons, Sessions und Runden nur zum Ausprobieren – nichts davon landet in den echten Daten"
            on={testOn}
            onToggle={toggleTestMode}
          />
          {testOn && (
            <div className="px-4 pb-3.5 space-y-2">
              <p className="text-[#5E5544] text-[11px] leading-snug">
                Testdaten liegen nur auf diesem Gerät. Statistik und Seasons zeigen im Testmodus nur Testdaten.
                Spieler und Regeln sind weiterhin die echten.
              </p>
              {animOn && <EffectPreview />}
              <button
                onClick={resetTest}
                className="w-full h-10 rounded-xl bg-[#FFFDF7] border border-[#E4D9BF] text-[#C8443B] text-sm font-medium"
              >
                Testdaten zurücksetzen
              </button>
            </div>
          )}
        </div>

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

function Toggle({ title, desc, on, onToggle }: { title: string; desc: string; on: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} role="switch" aria-checked={on} className="w-full flex items-center justify-between gap-3 px-4 py-4">
      <div className="text-left">
        <p className="text-[#23201A] font-medium">{title}</p>
        <p className="text-[#7C7461] text-xs mt-0.5">{desc}</p>
      </div>
      <span className={`w-11 h-6 rounded-full p-0.5 transition-colors shrink-0 ${on ? 'bg-[#2E6B3A]' : 'bg-[#E4D9BF]'}`}>
        <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${on ? 'translate-x-5' : ''}`} />
      </span>
    </button>
  )
}
