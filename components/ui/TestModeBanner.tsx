'use client'

import { useEffect, useState } from 'react'
import { isTestMode, setTestMode } from '@/lib/supabase/client'

/** Height of the banner; full-screen views subtract it while test mode is on. */
export const TEST_BANNER_HEIGHT = 30

/** Whether test mode is on (false during SSR, real value after mount). */
export function useTestMode(): boolean {
  const [on, setOn] = useState(false)
  useEffect(() => {
    setOn(isTestMode()) // eslint-disable-line react-hooks/set-state-in-effect
  }, [])
  return on
}

/** Unmissable strip at the top of every page while test mode is on. */
export default function TestModeBanner() {
  const on = useTestMode()
  if (!on) return null
  return (
    <div
      className="sticky top-0 z-[90] flex items-center justify-center gap-2 px-3 text-white text-xs font-semibold shrink-0"
      style={{
        height: TEST_BANNER_HEIGHT,
        background: 'repeating-linear-gradient(135deg, #5B3F99 0 14px, #6A4CAD 14px 28px)',
      }}
    >
      <span className="truncate">🧪 Testmodus · nichts wird gespeichert</span>
      <button
        onClick={() => {
          if (confirm('Testmodus beenden? Danach wird wieder mit den echten Daten gespielt.')) setTestMode(false)
        }}
        className="h-5 px-2 rounded-full bg-white/20 hover:bg-white/30 text-[11px] shrink-0"
      >
        Beenden
      </button>
    </div>
  )
}
