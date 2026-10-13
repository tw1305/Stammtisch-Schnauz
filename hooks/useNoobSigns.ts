'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { noobSigns, type NoobRound } from '@/lib/effects'
import { animationsEnabled } from '@/lib/feedback'
import { NOOB_LEAVE_MS, type NoobSignState } from '@/components/ui/RoundEffects'

/** Round whose sign changes were already animated (per device), so a reload doesn't replay them. */
const ANIMATED_KEY = 'schnauz_noob_animated_round'

function readAnimated(): string | null {
  try {
    return localStorage.getItem(ANIMATED_KEY)
  } catch {
    return null
  }
}

function writeAnimated(roundId: string) {
  try {
    localStorage.setItem(ANIMATED_KEY, roundId)
  } catch {
    /* storage unavailable — worst case the drop replays after a reload */
  }
}

/**
 * Noob signs at the table, derived from the session's completed rounds (no extra
 * DB state: reloads, live sync, undo and new sessions are handled for free).
 * Changes only happen when a round starts — new signs drop in, signs of players
 * who were not first out last round topple away.
 *
 * @param refreshKey changes whenever a round ends or is reopened
 */
export function useNoobSigns(sessionId: string | null, activeRoundId: string | null, refreshKey?: string | null) {
  const [signs, setSigns] = useState<Map<string, NoobSignState>>(new Map())

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    if (!sessionId) {
      setSigns(new Map()) // eslint-disable-line react-hooks/set-state-in-effect
      return
    }
    const supabase = createClient()
    ;(async () => {
      const { data: rounds } = await supabase
        .from('rounds')
        .select('id, round_number, winner_id')
        .eq('session_id', sessionId)
        .eq('status', 'completed')
        .gt('round_number', 0)
        .order('round_number', { ascending: true })
      const ids = (rounds || []).map(r => r.id)
      const { data: rps } = ids.length
        ? await supabase.from('round_players').select('round_id, player_id, was_first_eliminated').in('round_id', ids)
        : { data: [] as { round_id: string; player_id: string; was_first_eliminated: boolean }[] }
      if (cancelled) return

      const byRound = new Map<string, NoobRound>()
      for (const r of rounds || []) byRound.set(r.id, { participants: [], firstOut: [], winnerId: r.winner_id })
      for (const rp of rps || []) {
        const nr = byRound.get(rp.round_id)
        if (!nr) continue
        nr.participants.push(rp.player_id)
        if (rp.was_first_eliminated) nr.firstOut.push(rp.player_id)
      }
      const result = noobSigns(ids.map(id => byRound.get(id)!), !!activeRoundId)

      // Animate a round's changes once; afterwards (reload, live sync) the signs just stand there.
      const animate = !!activeRoundId && animationsEnabled() && readAnimated() !== activeRoundId
      if (activeRoundId) writeAnimated(activeRoundId)
      const next = new Map<string, NoobSignState>()
      for (const p of result.shown) next.set(p, animate && result.entering.includes(p) ? 'enter' : 'idle')
      if (animate && result.leaving.length > 0) {
        for (const p of result.leaving) next.set(p, 'leave')
        timer = setTimeout(() => {
          setSigns(cur => {
            const m = new Map(cur)
            for (const p of result.leaving) if (m.get(p) === 'leave') m.delete(p)
            return m
          })
        }, NOOB_LEAVE_MS)
      }
      setSigns(next)
    })().catch(() => {})
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [sessionId, activeRoundId, refreshKey])

  return signs
}
