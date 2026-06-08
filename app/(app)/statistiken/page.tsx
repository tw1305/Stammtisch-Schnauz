'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatBalance, getBalanceColor } from '@/lib/game-logic'
import type { Season, Player, PlayerStats } from '@/types/database'

export default function StatistikenPage() {
  const supabase = createClient()
  const [seasons, setSeasons] = useState<Season[]>([])
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>('all')
  const [stats, setStats] = useState<PlayerStats[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  useEffect(() => {
    loadSeasons()
  }, [])

  useEffect(() => {
    loadStats()
  }, [selectedSeasonId])

  async function loadSeasons() {
    const { data } = await supabase
      .from('seasons')
      .select('*')
      .order('start_date', { ascending: false })
    setSeasons(data || [])
    // Default-Auswahl: aktuelle (aktive) Season
    const active = (data || []).find(s => s.status === 'active')
    if (active) setSelectedSeasonId(active.id)
  }

  async function loadStats() {
    setLoading(true)

    const { data: players } = await supabase
      .from('players')
      .select('*')
      .eq('is_active', true)
      .order('name')

    if (!players || players.length === 0) {
      setStats([])
      setLoading(false)
      return
    }

    // Get relevant round IDs
    let roundQuery = supabase.from('rounds').select('id, session_id').eq('status', 'completed')

    if (selectedSeasonId !== 'all') {
      const { data: sessions } = await supabase
        .from('sessions')
        .select('id')
        .eq('season_id', selectedSeasonId)
      const sessionIds = sessions?.map(s => s.id) || []
      if (sessionIds.length === 0) {
        setStats(players.map(p => emptyStats(p)))
        setLoading(false)
        return
      }
      roundQuery = roundQuery.in('session_id', sessionIds)
    }

    const { data: rounds } = await roundQuery
    const roundIds = rounds?.map(r => r.id) || []

    if (roundIds.length === 0) {
      setStats(players.map(p => emptyStats(p)))
      setLoading(false)
      return
    }

    const { data: rps } = await supabase
      .from('round_players')
      .select('*')
      .in('round_id', roundIds)

    const statsMap: Record<string, PlayerStats> = {}
    for (const p of players) {
      statsMap[p.id] = emptyStats(p)
    }

    for (const rp of rps || []) {
      const s = statsMap[rp.player_id]
      if (!s) continue
      if (rp.is_winner) s.wins++
      if (rp.was_first_eliminated) s.first_eliminations++
      if (rp.was_revived) s.revivals++
      if (rp.reached_final) s.final_appearances++
      if (rp.balance_change != null) s.total_balance += rp.balance_change
    }

    // Win streak: needs ordered rounds
    const { data: orderedRounds } = await supabase
      .from('rounds')
      .select('id, winner_id, started_at')
      .in('id', roundIds)
      .order('started_at', { ascending: false })

    for (const p of players) {
      let streak = 0
      for (const r of orderedRounds || []) {
        if (r.winner_id === p.id) {
          streak++
        } else {
          break
        }
      }
      statsMap[p.id].win_streak = streak
    }

    setStats(Object.values(statsMap).sort((a, b) => b.total_balance - a.total_balance))
    setLoading(false)
  }

  function emptyStats(player: Player): PlayerStats {
    return {
      player,
      wins: 0,
      first_eliminations: 0,
      revivals: 0,
      final_appearances: 0,
      win_streak: 0,
      total_balance: 0,
    }
  }

  return (
    <div className="flex flex-col max-w-md mx-auto w-full">
      {/* Header */}
      <div className="px-4 pt-6 pb-4">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-[#F1F5F9] mb-3 tracking-tight">
          Statistiken
        </h1>
        <select
          value={selectedSeasonId}
          onChange={e => setSelectedSeasonId(e.target.value)}
          className="w-full bg-[#141925] border border-[#2A3344] rounded-2xl px-4 py-3 text-[#F1F5F9] text-sm outline-none focus:border-[#6366F1]"
        >
          <option value="all">Alle Seasons</option>
          {seasons.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      {/* Stats */}
      <div className="px-4 py-4 space-y-2.5">
        {loading ? (
          <div className="text-center text-[#8B95A7] py-10">Laden...</div>
        ) : stats.length === 0 ? (
          <div className="text-center text-[#8B95A7] py-10">Noch keine Statistiken vorhanden.</div>
        ) : (
          stats.map((s, i) => {
            const isOpen = expanded.has(s.player.id)
            return (
              <div key={s.player.id} className="bg-[#141925] rounded-2xl border border-[#2A3344] overflow-hidden">
                {/* Collapsed header — tap to expand */}
                <button
                  onClick={() => toggle(s.player.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors ${
                    isOpen ? 'bg-[#1B2230]' : 'hover:bg-[#1B2230]/60'
                  }`}
                >
                  <div className="w-8 h-8 rounded-full bg-[#6366F1] flex items-center justify-center text-white text-xs font-bold shrink-0">
                    {i + 1}
                  </div>
                  <span className="font-semibold text-[#F1F5F9] flex-1 truncate">{s.player.name}</span>
                  <span className={`font-bold text-lg ${getBalanceColor(s.total_balance)}`}>
                    {formatBalance(s.total_balance)}
                  </span>
                  <span className={`text-[#8B95A7] text-sm transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>
                    ⌄
                  </span>
                </button>

                {/* Details — only when expanded */}
                {isOpen && (
                  <div className="border-t border-[#2A3344] animate-fade-in">
                    <div className="grid grid-cols-3 divide-x divide-[#2A3344]">
                      <StatCell icon="🏆" label="Siege" value={s.wins} />
                      <StatCell icon="💀" label="1. Aus" value={s.first_eliminations} />
                      <StatCell icon="💉" label="Revivals" value={s.revivals} />
                    </div>
                    <div className="grid grid-cols-3 divide-x divide-[#2A3344] border-t border-[#2A3344]">
                      <StatCell icon="⚔️" label="Finals" value={s.final_appearances} />
                      <StatCell icon="🔥" label="Streak" value={s.win_streak} highlight={s.win_streak >= 3} />
                      <div className="flex flex-col items-center justify-center py-3">
                        <span className="text-base mb-0.5">💰</span>
                        <span className={`text-sm font-bold ${getBalanceColor(s.total_balance)}`}>
                          {formatBalance(s.total_balance)}
                        </span>
                        <span className="text-[10px] text-[#8B95A7] mt-0.5">Gesamt</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function StatCell({
  icon,
  label,
  value,
  highlight,
}: {
  icon: string
  label: string
  value: number
  highlight?: boolean
}) {
  return (
    <div className="flex flex-col items-center justify-center py-3 gap-0.5">
      <span className="text-base">{icon}</span>
      <span className={`text-lg font-bold ${highlight ? 'text-[#6366F1]' : 'text-[#F1F5F9]'}`}>
        {value}
      </span>
      <span className="text-[10px] text-[#8B95A7]">{label}</span>
    </div>
  )
}
