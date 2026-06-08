'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Session, SessionPlayer, Round, RoundPlayer } from '@/types/database'
import { calculateBalances } from '@/lib/game-logic'

export function useSession() {
  const supabase = createClient()
  const [session, setSession] = useState<Session | null>(null)
  const [sessionPlayers, setSessionPlayers] = useState<SessionPlayer[]>([])
  const [activeRound, setActiveRound] = useState<Round | null>(null)
  const [roundPlayers, setRoundPlayers] = useState<RoundPlayer[]>([])
  const [loading, setLoading] = useState(true)
  const [completedRound, setCompletedRound] = useState<{
    round: Round
    players: RoundPlayer[]
    winnerId: string
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

    setSessionPlayers(sp || [])

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

  async function startSession(seasonId: string, playerIds: string[]) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: sess, error } = await supabase
      .from('sessions')
      .insert({ season_id: seasonId, created_by: user.id, status: 'active' })
      .select()
      .single()

    if (error || !sess) return

    const spInserts = playerIds.map(pid => ({
      session_id: sess.id,
      player_id: pid,
    }))
    await supabase.from('session_players').insert(spInserts)

    await loadActiveSession()
  }

  async function addPlayerToSession(playerId: string) {
    if (!session) return
    await supabase.from('session_players').insert({
      session_id: session.id,
      player_id: playerId,
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

  async function startRound(stake: number) {
    if (!session) return

    const { data: lastRound } = await supabase
      .from('rounds')
      .select('round_number')
      .eq('session_id', session.id)
      .order('round_number', { ascending: false })
      .limit(1)

    const roundNumber = lastRound && lastRound.length > 0
      ? lastRound[0].round_number + 1
      : 1

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

    if (error || !round) return

    const rpInserts = activePlayerIds.map(pid => ({
      round_id: round.id,
      player_id: pid,
      is_active: true,
    }))
    await supabase.from('round_players').insert(rpInserts)

    await loadActiveSession()
  }

  async function eliminatePlayer(playerId: string) {
    if (!activeRound) return

    const rp = roundPlayers.find(r => r.player_id === playerId)
    if (!rp) return

    if (rp.is_active) {
      // Eliminate
      const firstEliminated = roundPlayers.every(r => r.is_active || r.player_id === playerId)
      await supabase
        .from('round_players')
        .update({
          is_active: false,
          was_first_eliminated: firstEliminated && !rp.was_revived,
        })
        .eq('id', rp.id)
    } else {
      // Revive
      await supabase
        .from('round_players')
        .update({ is_active: true, was_revived: true })
        .eq('id', rp.id)
    }

    const { data: updatedRp } = await supabase
      .from('round_players')
      .select('*, player:players(*)')
      .eq('round_id', activeRound.id)

    const updated = updatedRp || []
    setRoundPlayers(updated)

    const activePlayers = updated.filter(r => r.is_active)

    // Mark finalists when 2 remain
    if (activePlayers.length === 2) {
      for (const ap of activePlayers) {
        if (!ap.reached_final) {
          await supabase
            .from('round_players')
            .update({ reached_final: true })
            .eq('id', ap.id)
        }
      }
    }

    // End round when 1 remains
    if (activePlayers.length === 1) {
      await endRound(updated, activePlayers[0].player_id)
    }
  }

  async function endRound(players: RoundPlayer[], winnerId: string) {
    if (!activeRound) return

    const { stake, player_count } = activeRound
    const { winnerGain, loserLoss } = calculateBalances(player_count, stake)

    // Update balances
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
      .update({
        status: 'completed',
        winner_id: winnerId,
        ended_at: new Date().toISOString(),
      })
      .eq('id', activeRound.id)

    const { data: finalRp } = await supabase
      .from('round_players')
      .select('*, player:players(*)')
      .eq('round_id', activeRound.id)

    setCompletedRound({
      round: { ...activeRound, status: 'completed', winner_id: winnerId },
      players: finalRp || [],
      winnerId,
    })
    setActiveRound(null)
    setRoundPlayers([])
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
    startSession,
    addPlayerToSession,
    removePlayerFromSession,
    startRound,
    eliminatePlayer,
    endSession,
    dismissCompletedRound,
    reload: loadActiveSession,
  }
}
