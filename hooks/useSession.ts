'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Session, SessionPlayer, Round, RoundPlayer } from '@/types/database'
import { calculateBalances } from '@/lib/game-logic'

type UndoAction =
  | { kind: 'eliminate'; rpId: string; prevWasFirst: boolean }
  | { kind: 'revive'; rpId: string; prevWasRevived: boolean; reviverRpId?: string; reviverPrevGiven?: number }

export function useSession() {
  const supabase = createClient()
  const [session, setSession] = useState<Session | null>(null)
  const [sessionPlayers, setSessionPlayers] = useState<SessionPlayer[]>([])
  const [activeRound, setActiveRound] = useState<Round | null>(null)
  const [roundPlayers, setRoundPlayers] = useState<RoundPlayer[]>([])
  const [loading, setLoading] = useState(true)
  const [undoStack, setUndoStack] = useState<UndoAction[]>([])
  const [startingRound, setStartingRound] = useState(false)
  const startingRef = useRef(false)
  const [completedRound, setCompletedRound] = useState<{
    round: Round
    players: RoundPlayer[]
    winnerId: string
    reactivatePlayerId: string
  } | null>(null)

  const loadActiveSession = useCallback(async () => {
    const { data: sessions } = await supabase
      .from('sessions')
      .select('*')
      .eq('status', 'active')
      .order('started_at', { ascending: false })
      .limit(1)

    if (!sessions || sessions.length === 0) {
      setSession(null)
      setSessionPlayers([])
      setActiveRound(null)
      setRoundPlayers([])
      setLoading(false)
      return
    }

    const sess = sessions[0]
    setSession(sess)

    const { data: sp } = await supabase
      .from('session_players')
      .select('*, player:players(*)')
      .eq('session_id', sess.id)
      .is('removed_at', null)
      .order('joined_at')

    // Client-side seat ordering (column may not exist yet → fallback to joined order)
    const ordered = (sp || []).slice().sort((a, b) => {
      const ao = a.seat_order, bo = b.seat_order
      if (ao == null && bo == null) return 0
      if (ao == null) return 1
      if (bo == null) return -1
      return ao - bo
    })
    setSessionPlayers(ordered)

    const { data: rounds } = await supabase
      .from('rounds')
      .select('*')
      .eq('session_id', sess.id)
      .eq('status', 'active')
      .limit(1)

    if (rounds && rounds.length > 0) {
      const round = rounds[0]
      setActiveRound(round)
      const { data: rp } = await supabase
        .from('round_players')
        .select('*, player:players(*)')
        .eq('round_id', round.id)
      setRoundPlayers(rp || [])
    } else {
      setActiveRound(null)
      setRoundPlayers([])
    }

    setLoading(false)
  }, [supabase])

  useEffect(() => {
    loadActiveSession()
  }, [loadActiveSession])

  // Live-Sync: reload when any relevant table changes (multi-device tables).
  const reloadRef = useRef(loadActiveSession)
  reloadRef.current = loadActiveSession
  useEffect(() => {
    const channel = supabase.channel('schnauz-sync')
    let timer: ReturnType<typeof setTimeout> | null = null
    const trigger = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => reloadRef.current(), 250)
    }
    for (const table of ['sessions', 'session_players', 'rounds', 'round_players']) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, trigger)
    }
    channel.subscribe()
    return () => {
      if (timer) clearTimeout(timer)
      supabase.removeChannel(channel)
    }
  }, [supabase])

  async function startSession(seasonId: string, playerIds: string[]) {
    const { data: sess, error } = await supabase
      .from('sessions')
      .insert({ season_id: seasonId, status: 'active' })
      .select()
      .single()

    if (error || !sess) return

    const spInserts = playerIds.map(pid => ({ session_id: sess.id, player_id: pid }))
    await supabase.from('session_players').insert(spInserts)

    // Best-effort: seat order + initial dealer (ignored if columns missing)
    await Promise.all(
      playerIds.map((pid, i) =>
        supabase.from('session_players').update({ seat_order: i }).eq('session_id', sess.id).eq('player_id', pid)
      )
    )
    await supabase.from('sessions').update({ dealer_player_id: playerIds[0] }).eq('id', sess.id)

    await loadActiveSession()
  }

  async function addPlayerToSession(playerId: string) {
    if (!session) return
    await supabase.from('session_players').insert({
      session_id: session.id,
      player_id: playerId,
      seat_order: sessionPlayers.length,
    })
    await loadActiveSession()
  }

  async function removePlayerFromSession(sessionPlayerId: string) {
    await supabase
      .from('session_players')
      .update({ removed_at: new Date().toISOString() })
      .eq('id', sessionPlayerId)
    await loadActiveSession()
  }

  async function moveSeat(sessionPlayerId: string, dir: -1 | 1) {
    const arr = [...sessionPlayers]
    const idx = arr.findIndex(s => s.id === sessionPlayerId)
    const swap = idx + dir
    if (idx < 0 || swap < 0 || swap >= arr.length) return
    ;[arr[idx], arr[swap]] = [arr[swap], arr[idx]]
    setSessionPlayers(arr) // optimistic
    for (let i = 0; i < arr.length; i++) {
      await supabase.from('session_players').update({ seat_order: i }).eq('id', arr[i].id)
    }
    await loadActiveSession()
  }

  async function setDealer(playerId: string) {
    if (!session) return
    await supabase.from('sessions').update({ dealer_player_id: playerId }).eq('id', session.id)
    setSession({ ...session, dealer_player_id: playerId })
  }

  async function startRound(stake: number) {
    if (!session) return
    // Guard against a rapid double tap (e.g. slow network) creating two rounds.
    if (startingRef.current) return
    startingRef.current = true
    setStartingRound(true)
    try {
      // Safety net: never allow two active rounds in the same session. If one
      // already exists (a previous tap actually went through), just resync to it.
      const { data: existing } = await supabase
        .from('rounds')
        .select('id')
        .eq('session_id', session.id)
        .eq('status', 'active')
        .limit(1)
      if (existing && existing.length > 0) {
        await loadActiveSession()
        return
      }

      const { data: lastRound } = await supabase
        .from('rounds')
        .select('round_number')
        .eq('session_id', session.id)
        .order('round_number', { ascending: false })
        .limit(1)

      const roundNumber = lastRound && lastRound.length > 0 ? lastRound[0].round_number + 1 : 1
      const activePlayerIds = sessionPlayers.map(sp => sp.player_id)

      const { data: round, error } = await supabase
        .from('rounds')
        .insert({
          session_id: session.id,
          round_number: roundNumber,
          stake,
          player_count: activePlayerIds.length,
          status: 'active',
        })
        .select()
        .single()

      // If a concurrent insert won (e.g. a DB uniqueness guard), resync instead of duplicating.
      if (error || !round) {
        await loadActiveSession()
        return
      }

      const rpInserts = activePlayerIds.map(pid => ({ round_id: round.id, player_id: pid, is_active: true }))
      await supabase.from('round_players').insert(rpInserts)

      setUndoStack([])
      await loadActiveSession()
    } finally {
      startingRef.current = false
      setStartingRound(false)
    }
  }

  async function reloadRoundPlayers(roundId: string) {
    const { data } = await supabase
      .from('round_players')
      .select('*, player:players(*)')
      .eq('round_id', roundId)
    setRoundPlayers(data || [])
    return (data || []) as RoundPlayer[]
  }

  async function eliminatePlayer(playerId: string) {
    if (!activeRound) return
    const rp = roundPlayers.find(r => r.player_id === playerId)
    if (!rp || !rp.is_active) return

    const firstEliminated = roundPlayers.every(r => r.is_active || r.player_id === playerId)
    await supabase
      .from('round_players')
      .update({ is_active: false, was_first_eliminated: firstEliminated && !rp.was_revived })
      .eq('id', rp.id)

    setUndoStack(s => [...s, { kind: 'eliminate', rpId: rp.id, prevWasFirst: rp.was_first_eliminated }])

    const updated = await reloadRoundPlayers(activeRound.id)
    const activePlayers = updated.filter(r => r.is_active)

    if (activePlayers.length === 2) {
      for (const ap of activePlayers) {
        if (!ap.reached_final) {
          await supabase.from('round_players').update({ reached_final: true }).eq('id', ap.id)
        }
      }
    }
    if (activePlayers.length === 1) {
      await endRound(updated, activePlayers[0].player_id, playerId)
    }
  }

  async function revivePlayer(playerId: string, reviverId: string) {
    if (!activeRound) return
    const rp = roundPlayers.find(r => r.player_id === playerId)
    if (!rp || rp.is_active) return

    await supabase.from('round_players').update({ is_active: true, was_revived: true }).eq('id', rp.id)

    const reviver = roundPlayers.find(r => r.player_id === reviverId)
    if (reviver) {
      await supabase
        .from('round_players')
        .update({ revives_given: (reviver.revives_given ?? 0) + 1 })
        .eq('id', reviver.id)
    }

    setUndoStack(s => [
      ...s,
      {
        kind: 'revive',
        rpId: rp.id,
        prevWasRevived: rp.was_revived,
        reviverRpId: reviver?.id,
        reviverPrevGiven: reviver?.revives_given ?? 0,
      },
    ])

    await reloadRoundPlayers(activeRound.id)
  }

  async function undoLast() {
    if (!activeRound || undoStack.length === 0) return
    const action = undoStack[undoStack.length - 1]

    if (action.kind === 'eliminate') {
      await supabase
        .from('round_players')
        .update({ is_active: true, was_first_eliminated: action.prevWasFirst })
        .eq('id', action.rpId)
    } else {
      await supabase
        .from('round_players')
        .update({ is_active: false, was_revived: action.prevWasRevived })
        .eq('id', action.rpId)
      if (action.reviverRpId) {
        await supabase
          .from('round_players')
          .update({ revives_given: action.reviverPrevGiven ?? 0 })
          .eq('id', action.reviverRpId)
      }
    }

    setUndoStack(s => s.slice(0, -1))
    await reloadRoundPlayers(activeRound.id) // no auto-end on undo
  }

  async function endRound(players: RoundPlayer[], winnerId: string, lastEliminatedId: string) {
    if (!activeRound) return
    const { stake, player_count } = activeRound
    const { winnerGain, loserLoss } = calculateBalances(player_count, stake)

    for (const rp of players) {
      const isWinner = rp.player_id === winnerId
      await supabase
        .from('round_players')
        .update({
          is_winner: isWinner,
          balance_change: isWinner ? winnerGain : loserLoss,
          reached_final: rp.reached_final || isWinner,
        })
        .eq('id', rp.id)
    }

    await supabase
      .from('rounds')
      .update({ status: 'completed', winner_id: winnerId, ended_at: new Date().toISOString() })
      .eq('id', activeRound.id)

    // The player who was first out this round deals the next one.
    const firstOut = players.find(p => p.was_first_eliminated)
    if (firstOut && session) {
      await supabase.from('sessions').update({ dealer_player_id: firstOut.player_id }).eq('id', session.id)
    }

    const { data: finalRp } = await supabase
      .from('round_players')
      .select('*, player:players(*)')
      .eq('round_id', activeRound.id)

    setCompletedRound({
      round: { ...activeRound, status: 'completed', winner_id: winnerId },
      players: finalRp || [],
      winnerId,
      reactivatePlayerId: lastEliminatedId,
    })
    setUndoStack([])
    setActiveRound(null)
    setRoundPlayers([])
    await loadActiveSession()
  }

  // Reopen a just-completed round (undo the round-ending tap)
  async function reopenLastRound() {
    if (!completedRound) return
    const roundId = completedRound.round.id

    await supabase
      .from('round_players')
      .update({ is_winner: false, balance_change: null })
      .eq('round_id', roundId)
    await supabase
      .from('round_players')
      .update({ is_active: true })
      .eq('round_id', roundId)
      .eq('player_id', completedRound.reactivatePlayerId)
    await supabase
      .from('rounds')
      .update({ status: 'active', winner_id: null, ended_at: null })
      .eq('id', roundId)

    setCompletedRound(null)
    setUndoStack([])
    await loadActiveSession()
  }

  async function endSession() {
    if (!session) return
    await supabase
      .from('sessions')
      .update({ status: 'completed', ended_at: new Date().toISOString() })
      .eq('id', session.id)
    setSession(null)
    setSessionPlayers([])
    await loadActiveSession()
  }

  function dismissCompletedRound() {
    setCompletedRound(null)
  }

  return {
    session,
    sessionPlayers,
    activeRound,
    roundPlayers,
    loading,
    completedRound,
    canUndo: undoStack.length > 0,
    startingRound,
    dealerId: session?.dealer_player_id ?? null,
    startSession,
    addPlayerToSession,
    removePlayerFromSession,
    moveSeat,
    setDealer,
    startRound,
    eliminatePlayer,
    revivePlayer,
    undoLast,
    reopenLastRound,
    endSession,
    dismissCompletedRound,
    reload: loadActiveSession,
  }
}
