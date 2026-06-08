'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatBalance, getBalanceColor } from '@/lib/game-logic'
import type { Season, Player, PlayerStats } from '@/types/database'

const SORTS: { key: string; label: string; get: (s: PlayerStats) => number }[] = [
  { key: 'balance', label: 'Gesamtbilanz', get: s => s.total_balance },
  { key: 'wins', label: 'Siege', get: s => s.wins },
  { key: 'first', label: 'Erste Ausscheidungen', get: s => s.first_eliminations },
  { key: 'revived', label: 'Wiederbelebt', get: s => s.revivals },
  { key: 'given', label: 'Andere belebt', get: s => s.revives_given },
  { key: 'finals', label: 'Finalteilnahmen', get: s => s.final_appearances },
  { key: 'streak', label: 'Win Streak', get: s => s.win_streak },
]

function rankColor(i: number): string {
  if (i === 0) return '#D4AF37' // gold
  if (i === 1) return '#9CA3AA' // silver
  if (i === 2) return '#B87333' // bronze
  return '#2E6B3A'
}

export default function StatistikenPage() {
  const supabase = createClient()
  const [seasons, setSeasons] = useState<Season[]>([])
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>('all')
  const [sortKey, setSortKey] = useState<string>('balance')
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

  useEffect(() => { loadSeasons() }, [])
  useEffect(() => { loadStats() }, [selectedSeasonId])

  async function loadSeasons() {
    const { data } = await supabase
      .from('seasons')
      .select('*')
      .order('start_date', { ascending: false })
    setSeasons(data || [])
    const active = (data || []).find(s => s.status === 'active')
    if (active) setSelectedSeasonId(active.id)
  }

  function emptyStats(player: Player): PlayerStats {
    return {
      player,
      wins: 0,
      first_eliminations: 0,
      revivals: 0,
      revives_given: 0,
      final_appearances: 0,
      win_streak: 0,
      total_balance: 0,
    }
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
    for (const p of players) statsMap[p.id] = emptyStats(p)

    for (const rp of rps || []) {
      const s = statsMap[rp.player_id]
      if (!s) continue
      if (rp.is_winner) s.wins++
      if (rp.was_first_eliminated) s.first_eliminations++
      if (rp.was_revived) s.revivals++
      s.revives_given += rp.revives_given ?? 0
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
        if (r.winner_id === p.id) streak++
        else break
      }
      statsMap[p.id].win_streak = streak
    }

    setStats(Object.values(statsMap))
    setLoading(false)
  }

  const sortGet = SORTS.find(x => x.key === sortKey)!.get
  const sorted = [...stats].sort((a, b) => sortGet(b) - sortGet(a) || b.total_balance - a.total_balance)

  return (
    <div className="flex flex-col max-w-md mx-auto w-full">
      {/* Header */}
      <div className="px-4 pt-6 pb-4">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-[#23201A] mb-3 tracking-tight">
          Statistiken
        </h1>
        <div className="flex gap-2">
          <select
            value={selectedSeasonId}
            onChange={e => setSelectedSeasonId(e.target.value)}
            className="flex-1 min-w-0 bg-[#FBF6EA] border border-[#E4D9BF] rounded-2xl px-4 py-3 text-[#23201A] text-sm outline-none focus:border-[#2E6B3A]"
          >
            <option value="all">Alle Seasons</option>
            {seasons.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <select
            value={sortKey}
            onChange={e => setSortKey(e.target.value)}
            className="flex-1 min-w-0 bg-[#FBF6EA] border border-[#E4D9BF] rounded-2xl px-4 py-3 text-[#23201A] text-sm outline-none focus:border-[#2E6B3A]"
            aria-label="Sortieren nach"
          >
            {SORTS.map(o => (
              <option key={o.key} value={o.key}>Sortieren: {o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="px-4 py-4 space-y-2.5">
        {loading ? (
          <div className="text-center text-[#7C7461] py-10">Laden...</div>
        ) : sorted.length === 0 ? (
          <div className="text-center text-[#7C7461] py-10">Noch keine Statistiken vorhanden.</div>
        ) : (
          sorted.map((s, i) => {
            const isOpen = expanded.has(s.player.id)
            const medal = rankColor(i)
            const isPodium = i < 3
            return (
              <div
                key={s.player.id}
                className="bg-[#FBF6EA] rounded-2xl border overflow-hidden"
                style={{ borderColor: isPodium ? medal : '#E4D9BF' }}
              >
                {/* Collapsed header — tap to expand */}
                <button
                  onClick={() => toggle(s.player.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors ${
                    isOpen ? 'bg-[#FFFDF7]' : 'hover:bg-[#FFFDF7]/60'
                  }`}
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                    style={{ backgroundColor: medal, boxShadow: isPodium ? `0 0 0 2px ${medal}33` : undefined }}
                  >
                    {i + 1}
                  </div>
                  <span className="font-semibold text-[#23201A] flex-1 truncate">{s.player.name}</span>
                  <span className={`font-bold text-lg ${getBalanceColor(s.total_balance)}`}>
                    {formatBalance(s.total_balance)}
                  </span>
                  <span className={`text-[#7C7461] text-sm transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>
                    ⌄
                  </span>
                </button>

                {/* Details — only when expanded */}
                {isOpen && (
                  <div className="border-t border-[#E4D9BF] animate-fade-in">
                    <div className="grid grid-cols-3 divide-x divide-[#E4D9BF]">
                      <StatCell icon="🏆" label="Siege" value={s.wins} />
                      <StatCell icon="💀" label="1. Aus" value={s.first_eliminations} />
                      <StatCell icon="⚔️" label="Finals" value={s.final_appearances} />
                    </div>
                    <div className="grid grid-cols-3 divide-x divide-[#E4D9BF] border-t border-[#E4D9BF]">
                      <StatCell icon="💉" label="Wiederbelebt" value={s.revivals} />
                      <StatCell icon="🤝" label="Belebt" value={s.revives_given} />
                      <StatCell icon="🔥" label="Streak" value={s.win_streak} highlight={s.win_streak >= 3} />
                    </div>
                    <div className="border-t border-[#E4D9BF] flex items-center justify-center gap-2 py-3">
                      <span className="text-base">💰</span>
                      <span className={`text-base font-bold ${getBalanceColor(s.total_balance)}`}>
                        {formatBalance(s.total_balance)}
                      </span>
                      <span className="text-[11px] text-[#7C7461]">Gesamtbilanz</span>
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
      <span className={`text-lg font-bold ${highlight ? 'text-[#2E6B3A]' : 'text-[#23201A]'}`}>
        {value}
      </span>
      <span className="text-[10px] text-[#7C7461]">{label}</span>
    </div>
  )
}
