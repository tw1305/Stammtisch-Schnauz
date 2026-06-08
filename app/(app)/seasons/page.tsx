'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getCurrentQuarter, calculateSettlements, formatBalance, getBalanceColor } from '@/lib/game-logic'
import type { Season, Player, DebtSettlement } from '@/types/database'

type SeasonWithStats = Season & { roundCount: number; avgStake: number }

export default function SeasonsPage() {
  const supabase = createClient()
  const [seasons, setSeasons] = useState<SeasonWithStats[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewForm, setShowNewForm] = useState(false)
  const [newName, setNewName] = useState(getCurrentQuarter())
  const [newStartDate, setNewStartDate] = useState(new Date().toISOString().split('T')[0])
  const [detailSeason, setDetailSeason] = useState<Season | null>(null)
  const [settlements, setSettlements] = useState<DebtSettlement[]>([])
  const [seasonBalances, setSeasonBalances] = useState<{ player: Player; total: number }[]>([])

  useEffect(() => { loadSeasons() }, [])

  async function loadSeasons() {
    setLoading(true)
    const { data } = await supabase
      .from('seasons')
      .select('*')
      .order('start_date', { ascending: false })

    const enriched: SeasonWithStats[] = []
    for (const s of data || []) {
      const { data: sessions } = await supabase
        .from('sessions')
        .select('id')
        .eq('season_id', s.id)

      const sessionIds = sessions?.map(x => x.id) || []
      let roundCount = 0
      let avgStake = 0

      if (sessionIds.length > 0) {
        const { data: rounds } = await supabase
          .from('rounds')
          .select('stake')
          .in('session_id', sessionIds)
          .eq('status', 'completed')

        roundCount = rounds?.length || 0
        avgStake = roundCount > 0
          ? Math.round((rounds || []).reduce((a, r) => a + r.stake, 0) / roundCount * 10) / 10
          : 0
      }

      enriched.push({ ...s, roundCount, avgStake })
    }

    setSeasons(enriched)
    setLoading(false)
  }

  async function createSeason() {
    const { error } = await supabase.from('seasons').insert({
      name: newName,
      start_date: newStartDate,
      status: 'active',
    })
    if (!error) {
      setShowNewForm(false)
      setNewName(getCurrentQuarter())
      setNewStartDate(new Date().toISOString().split('T')[0])
      loadSeasons()
    }
  }

  async function completeSeason(season: Season) {
    if (!confirm(`Season "${season.name}" wirklich abschließen?`)) return
    await supabase
      .from('seasons')
      .update({ status: 'completed', end_date: new Date().toISOString().split('T')[0] })
      .eq('id', season.id)
    loadSeasons()
    loadSeasonDetail(season)
  }

  async function loadSeasonDetail(season: Season) {
    setDetailSeason(season)

    const { data: sessions } = await supabase
      .from('sessions')
      .select('id')
      .eq('season_id', season.id)

    const sessionIds = sessions?.map(s => s.id) || []
    if (sessionIds.length === 0) {
      setSeasonBalances([])
      setSettlements([])
      return
    }

    const { data: rounds } = await supabase
      .from('rounds')
      .select('id')
      .in('session_id', sessionIds)
      .eq('status', 'completed')

    const roundIds = rounds?.map(r => r.id) || []
    if (roundIds.length === 0) {
      setSeasonBalances([])
      setSettlements([])
      return
    }

    const { data: rps } = await supabase
      .from('round_players')
      .select('player_id, balance_change, player:players(id, name, avatar_url, is_active, created_at)')
      .in('round_id', roundIds)

    const balMap: Record<string, { player: Player; total: number }> = {}
    for (const rp of rps || []) {
      const p = rp.player as unknown as Player
      if (!p) continue
      if (!balMap[rp.player_id]) balMap[rp.player_id] = { player: p, total: 0 }
      if (rp.balance_change != null) balMap[rp.player_id].total += rp.balance_change
    }

    const bals = Object.values(balMap).sort((a, b) => b.total - a.total)
    setSeasonBalances(bals)
    setSettlements(calculateSettlements(bals))
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh] text-[#9A9A9A]">Laden...</div>
  }

  // Detail view
  if (detailSeason) {
    return (
      <div className="flex flex-col">
        <div className="flex items-center gap-3 px-4 pt-5 pb-3 border-b border-[#2E2E2E]">
          <button onClick={() => setDetailSeason(null)} className="text-[#D62839] text-sm">← Zurück</button>
          <h1 className="font-[family-name:var(--font-display)] text-xl font-bold text-[#F5F5F5] flex-1">
            {detailSeason.name}
          </h1>
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${
            detailSeason.status === 'active'
              ? 'bg-[#22C55E]/20 text-[#22C55E]'
              : 'bg-[#2E2E2E] text-[#9A9A9A]'
          }`}>
            {detailSeason.status === 'active' ? 'Aktiv' : 'Abgeschlossen'}
          </span>
        </div>

        <div className="px-4 py-4 space-y-6">
          {/* Balances */}
          <div>
            <p className="text-[#9A9A9A] text-xs uppercase tracking-wider mb-3 font-medium">Saisonbilanz</p>
            <div className="bg-[#1C1C1C] rounded-2xl border border-[#2E2E2E] overflow-hidden">
              {seasonBalances.length === 0 ? (
                <p className="text-[#9A9A9A] text-sm text-center py-6">Noch keine Daten</p>
              ) : (
                seasonBalances.map(b => (
                  <div
                    key={b.player.id}
                    className="flex items-center justify-between px-4 py-3 border-b border-[#2E2E2E] last:border-0"
                  >
                    <span className="text-[#F5F5F5]">{b.player.name}</span>
                    <span className={`font-semibold ${getBalanceColor(b.total)}`}>
                      {formatBalance(b.total)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Settlements (completed seasons) */}
          {detailSeason.status === 'completed' && settlements.length > 0 && (
            <div>
              <p className="text-[#9A9A9A] text-xs uppercase tracking-wider mb-3 font-medium">
                Auszahlungsübersicht
              </p>
              <div className="bg-[#1C1C1C] rounded-2xl border border-[#2E2E2E] overflow-hidden">
                {settlements.map((s, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-3 border-b border-[#2E2E2E] last:border-0">
                    <span className="text-[#F5F5F5] text-sm">
                      <span className="text-[#EF4444]">{s.from.name}</span>
                      {' zahlt '}
                      <span className="text-[#22C55E]">{s.to.name}</span>
                    </span>
                    <span className="text-[#D62839] font-bold">{s.amount} €</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Close season button */}
          {detailSeason.status === 'active' && (
            <button
              onClick={() => completeSeason(detailSeason)}
              className="w-full bg-[#242424] border border-[#EF4444] text-[#EF4444] font-semibold rounded-xl py-3 transition-colors"
            >
              Season abschließen
            </button>
          )}
        </div>
      </div>
    )
  }

  // List view
  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-4 pt-5 pb-3 border-b border-[#2E2E2E]">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-[#F5F5F5]">
          Seasons
        </h1>
        <button
          onClick={() => setShowNewForm(true)}
          className="bg-[#D62839] text-[#111111] font-semibold rounded-xl px-4 py-2 text-sm"
        >
          + Neu
        </button>
      </div>

      {/* New season form */}
      {showNewForm && (
        <div className="mx-4 mt-4 bg-[#1C1C1C] rounded-2xl border border-[#D62839] p-4 space-y-3">
          <h2 className="font-semibold text-[#F5F5F5]">Neue Season</h2>
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Name (z.B. Q3 2025)"
            className="w-full bg-[#111111] border border-[#2E2E2E] rounded-xl px-4 py-2.5 text-[#F5F5F5] text-sm outline-none focus:border-[#D62839]"
          />
          <input
            type="date"
            value={newStartDate}
            onChange={e => setNewStartDate(e.target.value)}
            className="w-full bg-[#111111] border border-[#2E2E2E] rounded-xl px-4 py-2.5 text-[#F5F5F5] text-sm outline-none focus:border-[#D62839]"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setShowNewForm(false)}
              className="flex-1 bg-[#242424] text-[#9A9A9A] font-medium rounded-xl py-2.5 text-sm"
            >
              Abbrechen
            </button>
            <button
              onClick={createSeason}
              disabled={!newName}
              className="flex-1 bg-[#D62839] disabled:opacity-50 text-[#111111] font-semibold rounded-xl py-2.5 text-sm"
            >
              Anlegen
            </button>
          </div>
        </div>
      )}

      {/* Season list */}
      <div className="px-4 py-4 space-y-3">
        {seasons.length === 0 ? (
          <div className="text-center text-[#9A9A9A] py-10">Noch keine Seasons vorhanden.</div>
        ) : (
          seasons.map(s => (
            <button
              key={s.id}
              onClick={() => loadSeasonDetail(s)}
              className="w-full text-left bg-[#1C1C1C] rounded-2xl border border-[#2E2E2E] p-4 hover:border-[#D62839]/50 transition-colors"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-[#F5F5F5]">
                  {s.status === 'active' ? '▶' : '✓'} {s.name}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  s.status === 'active'
                    ? 'bg-[#22C55E]/20 text-[#22C55E]'
                    : 'bg-[#2E2E2E] text-[#9A9A9A]'
                }`}>
                  {s.status === 'active' ? 'Aktiv' : 'Fertig'}
                </span>
              </div>
              <div className="flex gap-3 text-[#9A9A9A] text-xs">
                <span>Runden: {s.roundCount}</span>
                {s.avgStake > 0 && <span>Ø {s.avgStake} €</span>}
                {s.end_date && <span>Bis {new Date(s.end_date).toLocaleDateString('de-DE')}</span>}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
