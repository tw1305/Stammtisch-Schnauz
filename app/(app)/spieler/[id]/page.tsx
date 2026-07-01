'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { computePlayerStats, deriveBadges, computeHeadToHead, computeBalanceTimeline } from '@/lib/stats'
import { formatBalance, getBalanceColor } from '@/lib/game-logic'
import PlayerAvatar from '@/components/ui/PlayerAvatar'
import BalanceSparkline from '@/components/ui/BalanceSparkline'
import type { Player, PlayerStats, Badge, HeadToHead, Season, SessionBalancePoint } from '@/types/database'

function formatSessionDate(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export default function PlayerDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const router = useRouter()
  const supabase = createClient()

  const [player, setPlayer] = useState<Player | null>(null)
  const [stat, setStat] = useState<PlayerStats | null>(null)
  const [badges, setBadges] = useState<Badge[]>([])
  const [h2h, setH2h] = useState<HeadToHead[]>([])
  const [timeline, setTimeline] = useState<SessionBalancePoint[]>([])
  const [seasonRows, setSeasonRows] = useState<{ season: Season; balance: number }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [id])

  async function load() {
    setLoading(true)
    const { data: p } = await supabase.from('players').select('*').eq('id', id).single()
    setPlayer(p as Player)

    const allStats = await computePlayerStats(supabase, {})
    const mine = allStats.find(s => s.player.id === id) ?? null
    setStat(mine)
    setBadges(deriveBadges(allStats)[id] ?? [])

    setH2h(await computeHeadToHead(supabase, id))
    setTimeline(await computeBalanceTimeline(supabase, id))

    const { data: seasons } = await supabase
      .from('seasons')
      .select('*')
      .order('start_date', { ascending: false })
    const rows: { season: Season; balance: number }[] = []
    for (const s of seasons || []) {
      const st = await computePlayerStats(supabase, { seasonId: s.id, playerIds: [id] })
      rows.push({ season: s as Season, balance: st[0]?.total_balance ?? 0 })
    }
    setSeasonRows(rows)
    setLoading(false)
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh] text-[#7C7461]">Laden...</div>
  }
  if (!player) {
    return <div className="flex items-center justify-center min-h-[60vh] text-[#7C7461]">Spieler nicht gefunden.</div>
  }

  return (
    <div className="flex flex-col max-w-md mx-auto w-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 pt-5 pb-2">
        <button
          onClick={() => router.back()}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-[#FFFDF7] text-[#23201A] text-2xl transition-colors"
          aria-label="Zurück"
        >
          ‹
        </button>
        <h1 className="font-[family-name:var(--font-display)] text-xl font-bold text-[#23201A] tracking-tight">
          Profil
        </h1>
      </div>

      {/* Identity */}
      <div className="flex flex-col items-center gap-2 px-4 py-3">
        <PlayerAvatar name={player.name} avatarUrl={player.avatar_url} size={88} />
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-[#23201A]">{player.name}</h2>
        {stat && (
          <span className={`text-lg font-bold ${getBalanceColor(stat.total_balance)}`}>
            {formatBalance(stat.total_balance)} gesamt
          </span>
        )}
        {badges.length > 0 && (
          <div className="flex flex-wrap gap-1.5 justify-center mt-1">
            {badges.map(b => (
              <span key={b.label} title={b.desc} className="inline-flex items-center gap-1 bg-[#FBF6EA] border border-[#E4D9BF] rounded-full px-2.5 py-1 text-xs text-[#23201A]">
                <span>{b.icon}</span><span className="font-medium">{b.label}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {stat && (
        <div className="px-4 py-3 space-y-5">
          {/* Stat grid */}
          <div className="bg-[#FBF6EA] rounded-2xl border border-[#E4D9BF] overflow-hidden">
            <div className="grid grid-cols-3 divide-x divide-[#E4D9BF]">
              <Cell icon="🏆" label="Siege" value={stat.wins} />
              <Cell icon="🎯" label="Runden" value={stat.rounds_played} />
              <Cell icon="📈" label="Win-Rate" value={`${Math.round(stat.win_rate * 100)}%`} />
            </div>
            <div className="grid grid-cols-3 divide-x divide-[#E4D9BF] border-t border-[#E4D9BF]">
              <Cell icon="💀" label="1. Aus" value={stat.first_eliminations} />
              <Cell icon="⚔️" label="Finals" value={stat.final_appearances} />
              <Cell icon="🔥" label="Rekord" value={stat.longest_streak} />
            </div>
            <div className="grid grid-cols-3 divide-x divide-[#E4D9BF] border-t border-[#E4D9BF]">
              <Cell icon="💉" label="Wiederbelebt" value={stat.revivals} />
              <Cell icon="🤝" label="Belebt" value={stat.revives_given} />
              <Cell icon="⚡" label="Serie" value={stat.win_streak} />
            </div>
          </div>

          {/* Balance history */}
          <div>
            <p className="text-[#7C7461] text-xs uppercase tracking-wider mb-2 font-medium">Saldo-Verlauf</p>
            <div className="bg-[#FBF6EA] rounded-2xl border border-[#E4D9BF] overflow-hidden">
              {timeline.length < 2 ? (
                <div className="px-4 py-3">
                  <BalanceSparkline history={stat.balance_history} height={80} />
                </div>
              ) : (
                <>
                  <div className="px-4 pt-3 pb-1">
                    <BalanceSparkline history={timeline.map(t => t.cumulative)} height={80} />
                  </div>
                  <div className="grid grid-cols-[1.5rem_1fr_3.5rem_4rem] gap-x-2 items-center border-t border-[#E4D9BF] px-4 py-1.5 text-[10px] uppercase tracking-wider text-[#7C7461]">
                    <span>#</span>
                    <span>Datum</span>
                    <span className="text-right">Abend</span>
                    <span className="text-right">Gesamt</span>
                  </div>
                  {timeline.map((t, i) => (
                    <div
                      key={t.session.id}
                      className="grid grid-cols-[1.5rem_1fr_3.5rem_4rem] gap-x-2 items-center px-4 py-2 border-t border-[#E4D9BF]"
                    >
                      <span className="text-[#7C7461] text-xs tabular-nums">{i + 1}</span>
                      <span className="text-[#23201A] text-sm">{formatSessionDate(t.session.started_at)}</span>
                      <span className={`text-xs text-right tabular-nums ${getBalanceColor(t.delta)}`}>
                        {formatBalance(t.delta)}
                      </span>
                      <span className={`text-sm font-bold text-right tabular-nums ${getBalanceColor(t.cumulative)}`}>
                        {formatBalance(t.cumulative)}
                      </span>
                    </div>
                  ))}
                </>
              )}
            </div>
            {timeline.length >= 2 && (
              <p className="text-[#7C7461] text-[11px] mt-1.5 leading-snug">
                „Abend" = Ergebnis des jeweiligen Spielabends, „Gesamt" = daraus aufsummierter Saldo.
              </p>
            )}
          </div>

          {/* Season breakdown */}
          {seasonRows.length > 0 && (
            <div>
              <p className="text-[#7C7461] text-xs uppercase tracking-wider mb-2 font-medium">Pro Saison</p>
              <div className="bg-[#FBF6EA] rounded-2xl border border-[#E4D9BF] overflow-hidden">
                {seasonRows.map(r => (
                  <div key={r.season.id} className="flex items-center justify-between px-4 py-2.5 border-b border-[#E4D9BF] last:border-0">
                    <span className="text-[#23201A] text-sm">{r.season.name}</span>
                    <span className={`font-semibold ${getBalanceColor(r.balance)}`}>{formatBalance(r.balance)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Head-to-head */}
          <div>
            <p className="text-[#7C7461] text-xs uppercase tracking-wider mb-1 font-medium">Kopf-an-Kopf</p>
            <p className="text-[#7C7461] text-[11px] mb-2 leading-snug">
              Rundensiege in euren gemeinsam gespielten Runden ({player.name} : Gegner).
              Beispiel <span className="font-semibold">8 : 3</span> = {player.name} hat 8 dieser Runden
              gewonnen, der Gegner 3 – die übrigen gingen an andere Mitspieler.
            </p>
            <div className="bg-[#FBF6EA] rounded-2xl border border-[#E4D9BF] overflow-hidden">
              {h2h.length === 0 ? (
                <p className="text-[#7C7461] text-sm text-center py-5">Noch keine gemeinsamen Runden</p>
              ) : (
                <>
                  <div className="flex items-center gap-3 px-4 py-1.5 border-b border-[#E4D9BF] text-[10px] uppercase tracking-wider text-[#7C7461]">
                    <span className="w-8 shrink-0" />
                    <span className="flex-1">Gegner</span>
                    <span className="w-16 text-right">Runden</span>
                    <span className="w-14 text-right">Siege</span>
                  </div>
                  {h2h.map(h => {
                    const diff = h.myWins - h.theirWins
                    const color = diff > 0 ? 'text-[#1F9D57]' : diff < 0 ? 'text-[#C8443B]' : 'text-[#7C7461]'
                    return (
                      <div key={h.opponent.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-[#E4D9BF] last:border-0">
                        <PlayerAvatar name={h.opponent.name} avatarUrl={h.opponent.avatar_url} size={32} />
                        <span className="text-[#23201A] text-sm flex-1 truncate">{h.opponent.name}</span>
                        <span className="text-[#7C7461] text-xs w-16 text-right tabular-nums">{h.games}</span>
                        <span className={`text-sm font-bold ${color} w-14 text-right tabular-nums`}>{h.myWins} : {h.theirWins}</span>
                      </div>
                    )
                  })}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Cell({ icon, label, value }: { icon: string; label: string; value: number | string }) {
  return (
    <div className="flex flex-col items-center justify-center py-3 gap-0.5">
      <span className="text-base">{icon}</span>
      <span className="text-lg font-bold text-[#23201A]">{value}</span>
      <span className="text-[10px] text-[#7C7461]">{label}</span>
    </div>
  )
}
