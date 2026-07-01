'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { formatBalance, getBalanceColor } from '@/lib/game-logic'
import { computePlayerStats, deriveBadges } from '@/lib/stats'
import BalanceSparkline from '@/components/ui/BalanceSparkline'
import type { Season, PlayerStats, Badge } from '@/types/database'

const SORTS: { key: string; label: string; get: (s: PlayerStats) => number }[] = [
  { key: 'balance', label: 'Gesamtbilanz', get: s => s.total_balance },
  { key: 'wins', label: 'Siege', get: s => s.wins },
  { key: 'winrate', label: 'Win-Rate', get: s => s.win_rate },
  { key: 'played', label: 'Gespielte Runden', get: s => s.rounds_played },
  { key: 'first', label: 'Erste Ausscheidungen', get: s => s.first_eliminations },
  { key: 'revived', label: 'Wiederbelebt', get: s => s.revivals },
  { key: 'given', label: 'Andere belebt', get: s => s.revives_given },
  { key: 'finals', label: 'Finalteilnahmen', get: s => s.final_appearances },
  { key: 'streak', label: 'Aktuelle Serie', get: s => s.win_streak },
  { key: 'record', label: 'Rekord-Serie', get: s => s.longest_streak },
]

function rankColor(i: number): string {
  if (i === 0) return '#D4AF37'
  if (i === 1) return '#9CA3AA'
  if (i === 2) return '#B87333'
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

  async function loadStats() {
    setLoading(true)
    const result = await computePlayerStats(supabase, { seasonId: selectedSeasonId })
    setStats(result)
    setLoading(false)
  }

  const sortGet = SORTS.find(x => x.key === sortKey)!.get
  const sorted = [...stats].sort((a, b) => sortGet(b) - sortGet(a) || b.total_balance - a.total_balance)
  const badges = deriveBadges(stats)

  return (
    <div className="flex flex-col max-w-md mx-auto w-full">
      {/* Header */}
      <div className="px-4 pt-5 pb-3">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-[#23201A] mb-2.5 tracking-tight">
          Statistiken
        </h1>
        <div className="flex gap-2">
          <select
            value={selectedSeasonId}
            onChange={e => setSelectedSeasonId(e.target.value)}
            className="flex-1 min-w-0 bg-[#FBF6EA] border border-[#E4D9BF] rounded-xl px-3 py-2 text-[#23201A] text-sm outline-none focus:border-[#2E6B3A]"
          >
            <option value="all">Alle Seasons</option>
            {seasons.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <select
            value={sortKey}
            onChange={e => setSortKey(e.target.value)}
            className="flex-1 min-w-0 bg-[#FBF6EA] border border-[#E4D9BF] rounded-xl px-3 py-2 text-[#23201A] text-sm outline-none focus:border-[#2E6B3A]"
            aria-label="Sortieren nach"
          >
            {SORTS.map(o => (
              <option key={o.key} value={o.key}>Sortieren: {o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="px-4 pt-1 pb-4 space-y-1.5">
        {loading ? (
          <div className="text-center text-[#7C7461] py-10">Laden...</div>
        ) : sorted.length === 0 ? (
          <div className="text-center text-[#7C7461] py-10">Noch keine Statistiken vorhanden.</div>
        ) : (
          sorted.map((s, i) => {
            const isOpen = expanded.has(s.player.id)
            const medal = rankColor(i)
            const isPodium = i < 3
            const playerBadges = badges[s.player.id] ?? []
            return (
              <div
                key={s.player.id}
                className="bg-[#FBF6EA] rounded-xl border overflow-hidden"
                style={{ borderColor: isPodium ? medal : '#E4D9BF' }}
              >
                <button
                  onClick={() => toggle(s.player.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                    isOpen ? 'bg-[#FFFDF7]' : 'hover:bg-[#FFFDF7]/60'
                  }`}
                >
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0"
                    style={{ backgroundColor: medal, boxShadow: isPodium ? `0 0 0 2px ${medal}33` : undefined }}
                  >
                    {i + 1}
                  </div>
                  <span className="min-w-0 font-semibold text-[15px] text-[#23201A] truncate">{s.player.name}</span>
                  {playerBadges.length > 0 && (
                    <span className="text-xs leading-none shrink-0">{playerBadges.map(b => b.icon).join('')}</span>
                  )}
                  <span className={`ml-auto font-bold text-base tabular-nums ${getBalanceColor(s.total_balance)}`}>
                    {formatBalance(s.total_balance)}
                  </span>
                  <span className={`text-[#7C7461] text-xs shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>
                    ⌄
                  </span>
                </button>

                {isOpen && (
                  <div className="border-t border-[#E4D9BF] animate-fade-in">
                    <div className="grid grid-cols-3 divide-x divide-[#E4D9BF]">
                      <StatCell icon="🏆" label="Siege" value={s.wins} />
                      <StatCell icon="🎯" label="Runden" value={s.rounds_played} />
                      <StatCell icon="📈" label="Win-Rate" value={`${Math.round(s.win_rate * 100)}%`} />
                    </div>
                    <div className="grid grid-cols-3 divide-x divide-[#E4D9BF] border-t border-[#E4D9BF]">
                      <StatCell icon="💀" label="1. Aus" value={s.first_eliminations} />
                      <StatCell icon="⚔️" label="Finals" value={s.final_appearances} />
                      <StatCell icon="🔥" label="Rekord" value={s.longest_streak} highlight={s.longest_streak >= 3} />
                    </div>
                    <div className="grid grid-cols-3 divide-x divide-[#E4D9BF] border-t border-[#E4D9BF]">
                      <StatCell icon="💉" label="Wiederbelebt" value={s.revivals} />
                      <StatCell icon="🤝" label="Belebt" value={s.revives_given} />
                      <StatCell icon="⚡" label="Serie" value={s.win_streak} />
                    </div>

                    {/* Badges */}
                    {playerBadges.length > 0 && (
                      <div className="border-t border-[#E4D9BF] px-4 py-3 flex flex-wrap gap-1.5">
                        {playerBadges.map(b => (
                          <BadgeChip key={b.label} badge={b} />
                        ))}
                      </div>
                    )}

                    {/* Balance history */}
                    <div className="border-t border-[#E4D9BF] px-4 py-3">
                      <p className="text-[#7C7461] text-[10px] uppercase tracking-wider mb-1 font-medium">Saldo-Verlauf</p>
                      <BalanceSparkline history={s.balance_history} />
                    </div>

                    <Link
                      href={`/spieler/${s.player.id}`}
                      className="border-t border-[#E4D9BF] flex items-center justify-center gap-1 py-3 text-[#2E6B3A] text-sm font-semibold hover:bg-[#FFFDF7] transition-colors"
                    >
                      Profil & Head-to-Head ansehen →
                    </Link>
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

function BadgeChip({ badge }: { badge: Badge }) {
  return (
    <span
      title={badge.desc}
      className="inline-flex items-center gap-1 bg-[#FFFDF7] border border-[#E4D9BF] rounded-full px-2.5 py-1 text-xs text-[#23201A]"
    >
      <span>{badge.icon}</span>
      <span className="font-medium">{badge.label}</span>
    </span>
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
  value: number | string
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
