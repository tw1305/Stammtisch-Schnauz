'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  getCurrentQuarter,
  calculateSettlements,
  calculateBalances,
  formatBalance,
  getBalanceColor,
} from '@/lib/game-logic'
import type { Season, Player, DebtSettlement, Session, Round, RoundPlayer } from '@/types/database'

type SeasonWithStats = Season & { roundCount: number; avgStake: number }
type SessionWithRounds = { session: Session; rounds: Round[] }

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
  const [sessionsData, setSessionsData] = useState<SessionWithRounds[]>([])
  const [editingRound, setEditingRound] = useState<Round | null>(null)

  useEffect(() => { loadSeasons() }, [])

  async function loadSeasons() {
    setLoading(true)
    const { data } = await supabase
      .from('seasons')
      .select('*')
      .order('start_date', { ascending: false })

    const enriched: SeasonWithStats[] = []
    for (const s of data || []) {
      const { data: sessions } = await supabase.from('sessions').select('id').eq('season_id', s.id)
      const sessionIds = sessions?.map(x => x.id) || []
      let roundCount = 0
      let avgStake = 0
      if (sessionIds.length > 0) {
        const { data: rounds } = await supabase
          .from('rounds')
          .select('stake')
          .in('session_id', sessionIds)
          .eq('status', 'completed')
          .gt('round_number', 0)
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
    await loadSeasons()
    loadSeasonDetail({ ...season, status: 'completed' })
  }

  async function loadSeasonDetail(season: Season) {
    setDetailSeason(season)

    const { data: sessions } = await supabase
      .from('sessions')
      .select('*')
      .eq('season_id', season.id)
      .order('started_at', { ascending: true })

    const sessionList = sessions || []
    const sessionIds = sessionList.map(s => s.id)

    if (sessionIds.length === 0) {
      setSeasonBalances([]); setSettlements([]); setSessionsData([])
      return
    }

    const { data: rounds } = await supabase
      .from('rounds')
      .select('*')
      .in('session_id', sessionIds)
      .order('round_number', { ascending: true })

    const allRounds = rounds || []
    setSessionsData(
      sessionList.map(s => ({
        session: s,
        rounds: allRounds.filter(r => r.session_id === s.id),
      }))
    )

    const completedRoundIds = allRounds.filter(r => r.status === 'completed').map(r => r.id)
    if (completedRoundIds.length === 0) {
      setSeasonBalances([]); setSettlements([])
      return
    }

    const { data: rps } = await supabase
      .from('round_players')
      .select('player_id, balance_change, player:players(id, name, avatar_url, is_active, created_at)')
      .in('round_id', completedRoundIds)

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

  async function deleteRound(round: Round) {
    if (!confirm('Runde löschen? Die Bilanzen werden entsprechend angepasst.')) return
    await supabase.from('round_players').delete().eq('round_id', round.id)
    await supabase.from('rounds').delete().eq('id', round.id)
    if (detailSeason) loadSeasonDetail(detailSeason)
  }

  async function deleteSession(session: Session) {
    if (!confirm('Ganze Session inkl. aller Runden löschen? Die Bilanzen werden angepasst.')) return
    const { data: rounds } = await supabase.from('rounds').select('id').eq('session_id', session.id)
    for (const r of rounds || []) {
      await supabase.from('round_players').delete().eq('round_id', r.id)
    }
    await supabase.from('rounds').delete().eq('session_id', session.id)
    await supabase.from('session_players').delete().eq('session_id', session.id)
    await supabase.from('sessions').delete().eq('id', session.id)
    if (detailSeason) loadSeasonDetail(detailSeason)
    loadSeasons()
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh] text-[#8B95A7]">Laden...</div>
  }

  // ---------- Detail view ----------
  if (detailSeason) {
    return (
      <div className="flex flex-col max-w-md mx-auto w-full">
        <div className="flex items-center gap-2 px-3 pt-5 pb-3">
          <button
            onClick={() => setDetailSeason(null)}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-[#1B2230] text-[#F1F5F9] text-2xl transition-colors"
          >
            ‹
          </button>
          <h1 className="font-[family-name:var(--font-display)] text-xl font-bold text-[#F1F5F9] flex-1 tracking-tight">
            {detailSeason.name}
          </h1>
          <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
            detailSeason.status === 'active'
              ? 'bg-[#34D399]/15 text-[#34D399]'
              : 'bg-[#2A3344] text-[#8B95A7]'
          }`}>
            {detailSeason.status === 'active' ? 'Aktiv' : 'Abgeschlossen'}
          </span>
        </div>

        <div className="px-4 py-2 space-y-6">
          {/* Balances */}
          <div>
            <p className="text-[#8B95A7] text-xs uppercase tracking-wider mb-3 font-medium">Saisonbilanz</p>
            <div className="bg-[#141925] rounded-2xl border border-[#2A3344] overflow-hidden">
              {seasonBalances.length === 0 ? (
                <p className="text-[#8B95A7] text-sm text-center py-6">Noch keine Daten</p>
              ) : (
                seasonBalances.map(b => (
                  <div key={b.player.id} className="flex items-center justify-between px-4 py-3 border-b border-[#2A3344] last:border-0">
                    <span className="text-[#F1F5F9]">{b.player.name}</span>
                    <span className={`font-semibold ${getBalanceColor(b.total)}`}>{formatBalance(b.total)}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Settlements */}
          {detailSeason.status === 'completed' && settlements.length > 0 && (
            <div>
              <p className="text-[#8B95A7] text-xs uppercase tracking-wider mb-3 font-medium">Auszahlungsübersicht</p>
              <div className="bg-[#141925] rounded-2xl border border-[#2A3344] overflow-hidden">
                {settlements.map((s, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-3 border-b border-[#2A3344] last:border-0">
                    <span className="text-[#F1F5F9] text-sm">
                      <span className="text-[#F87171]">{s.from.name}</span>
                      {' → '}
                      <span className="text-[#34D399]">{s.to.name}</span>
                    </span>
                    <span className="text-[#6366F1] font-bold">{s.amount} €</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sessions & Rounds */}
          <div>
            <p className="text-[#8B95A7] text-xs uppercase tracking-wider mb-3 font-medium">Sessions & Runden</p>
            <div className="space-y-3">
              {sessionsData.length === 0 ? (
                <p className="text-[#8B95A7] text-sm text-center py-4">Keine Sessions</p>
              ) : (
                sessionsData.map(({ session, rounds }, idx) => (
                  <div key={session.id} className="bg-[#141925] rounded-2xl border border-[#2A3344] overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5 bg-[#1B2230] border-b border-[#2A3344]">
                      <div>
                        <span className="text-[#F1F5F9] text-sm font-semibold">Session {idx + 1}</span>
                        <span className="text-[#8B95A7] text-xs ml-2">
                          {new Date(session.started_at).toLocaleDateString('de-DE')}
                          {session.status === 'active' && ' · läuft'}
                        </span>
                      </div>
                      <button
                        onClick={() => deleteSession(session)}
                        className="text-[#F87171] text-xs font-medium px-2.5 py-1 rounded-lg bg-[#F87171]/10"
                      >
                        Löschen
                      </button>
                    </div>
                    {rounds.length === 0 ? (
                      <p className="text-[#8B95A7] text-xs text-center py-3">Keine Runden</p>
                    ) : (
                      rounds.map(r => (
                        <div key={r.id} className="flex items-center justify-between px-4 py-2.5 border-b border-[#2A3344] last:border-0">
                          <div className="flex-1 min-w-0">
                            <span className="text-[#F1F5F9] text-sm">
                              {r.round_number === 0 ? 'Saldovortrag' : `Runde ${r.round_number}`}
                            </span>
                            {r.round_number > 0 && (
                              <span className="text-[#8B95A7] text-xs ml-2">{r.stake} €</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => setEditingRound(r)}
                              className="text-[#6366F1] text-xs font-medium px-2.5 py-1 rounded-lg bg-[#6366F1]/10"
                            >
                              Bearbeiten
                            </button>
                            <button
                              onClick={() => deleteRound(r)}
                              className="text-[#F87171] text-xs font-medium px-2.5 py-1 rounded-lg bg-[#F87171]/10"
                            >
                              Löschen
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Close season */}
          {detailSeason.status === 'active' && (
            <button
              onClick={() => completeSeason(detailSeason)}
              className="w-full bg-[#141925] border border-[#F87171]/40 text-[#F87171] font-semibold rounded-2xl py-3.5 transition-colors hover:bg-[#F87171]/5"
            >
              Season abschließen
            </button>
          )}
        </div>

        {editingRound && (
          <RoundEditor
            round={editingRound}
            onClose={() => setEditingRound(null)}
            onSaved={() => { setEditingRound(null); if (detailSeason) loadSeasonDetail(detailSeason) }}
          />
        )}
      </div>
    )
  }

  // ---------- List view ----------
  return (
    <div className="flex flex-col max-w-md mx-auto w-full">
      <div className="flex items-center justify-between px-4 pt-6 pb-4">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-[#F1F5F9] tracking-tight">
          Seasons
        </h1>
        <button
          onClick={() => setShowNewForm(true)}
          className="bg-[#6366F1] hover:bg-[#818CF8] text-white font-semibold rounded-xl px-4 py-2 text-sm transition-colors"
        >
          + Neu
        </button>
      </div>

      {showNewForm && (
        <div className="mx-4 mb-4 bg-[#141925] rounded-2xl border border-[#6366F1]/40 p-4 space-y-3 animate-pop-in">
          <h2 className="font-semibold text-[#F1F5F9]">Neue Season</h2>
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Name (z.B. Season 3)"
            className="w-full bg-[#0B0E14] border border-[#2A3344] rounded-xl px-4 py-3 text-[#F1F5F9] text-sm outline-none focus:border-[#6366F1]"
          />
          <input
            type="date"
            value={newStartDate}
            onChange={e => setNewStartDate(e.target.value)}
            className="w-full bg-[#0B0E14] border border-[#2A3344] rounded-xl px-4 py-3 text-[#F1F5F9] text-sm outline-none focus:border-[#6366F1]"
          />
          <div className="flex gap-2">
            <button onClick={() => setShowNewForm(false)} className="flex-1 bg-[#1B2230] text-[#8B95A7] font-medium rounded-xl py-3 text-sm">
              Abbrechen
            </button>
            <button onClick={createSeason} disabled={!newName} className="flex-1 bg-[#6366F1] disabled:opacity-50 text-white font-semibold rounded-xl py-3 text-sm">
              Anlegen
            </button>
          </div>
        </div>
      )}

      <div className="px-4 pb-6 space-y-3">
        {seasons.length === 0 ? (
          <div className="text-center text-[#8B95A7] py-10">Noch keine Seasons vorhanden.</div>
        ) : (
          seasons.map(s => (
            <button
              key={s.id}
              onClick={() => loadSeasonDetail(s)}
              className="w-full text-left bg-[#141925] rounded-2xl border border-[#2A3344] p-4 hover:border-[#6366F1]/50 transition-colors"
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-semibold text-[#F1F5F9]">{s.name}</span>
                <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                  s.status === 'active' ? 'bg-[#34D399]/15 text-[#34D399]' : 'bg-[#2A3344] text-[#8B95A7]'
                }`}>
                  {s.status === 'active' ? 'Aktiv' : 'Fertig'}
                </span>
              </div>
              <div className="flex gap-3 text-[#8B95A7] text-xs">
                <span>{s.roundCount} Runden</span>
                {s.avgStake > 0 && <span>Ø {s.avgStake} €</span>}
                {s.end_date && <span>bis {new Date(s.end_date).toLocaleDateString('de-DE')}</span>}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

// ---------- Round editor ----------
function RoundEditor({
  round,
  onClose,
  onSaved,
}: {
  round: Round
  onClose: () => void
  onSaved: () => void
}) {
  const supabase = createClient()
  const isCarryOver = round.round_number === 0
  const [participants, setParticipants] = useState<RoundPlayer[]>([])
  const [stake, setStake] = useState(String(round.stake))
  const [winnerId, setWinnerId] = useState<string | null>(round.winner_id)
  const [balances, setBalances] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase
      .from('round_players')
      .select('*, player:players(*)')
      .eq('round_id', round.id)
      .then(({ data }) => {
        const rps = (data || []) as RoundPlayer[]
        setParticipants(rps)
        const bal: Record<string, string> = {}
        rps.forEach(rp => { bal[rp.player_id] = String(rp.balance_change ?? 0) })
        setBalances(bal)
        setLoading(false)
      })
  }, [round.id, supabase])

  async function save() {
    setSaving(true)
    if (isCarryOver) {
      for (const rp of participants) {
        const val = parseInt(balances[rp.player_id]) || 0
        await supabase.from('round_players').update({ balance_change: val }).eq('id', rp.id)
      }
    } else {
      const stakeNum = Math.max(0, parseInt(stake) || 0)
      const { winnerGain, loserLoss } = calculateBalances(round.player_count, stakeNum)
      await supabase.from('rounds').update({ stake: stakeNum, winner_id: winnerId }).eq('id', round.id)
      for (const rp of participants) {
        const isWinner = rp.player_id === winnerId
        await supabase
          .from('round_players')
          .update({ is_winner: isWinner, balance_change: isWinner ? winnerGain : loserLoss })
          .eq('id', rp.id)
      }
    }
    setSaving(false)
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-end animate-fade-in" onClick={onClose}>
      <div
        className="w-full max-w-md mx-auto bg-[#141925] rounded-t-3xl border-t border-[#2A3344] max-h-[80vh] flex flex-col animate-pop-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2A3344]">
          <h2 className="font-[family-name:var(--font-display)] font-bold text-[#F1F5F9]">
            {isCarryOver ? 'Saldovortrag bearbeiten' : `Runde ${round.round_number} bearbeiten`}
          </h2>
          <button onClick={onClose} className="text-[#8B95A7] text-2xl leading-none w-8 h-8">×</button>
        </div>

        {loading ? (
          <div className="text-center text-[#8B95A7] py-10">Laden...</div>
        ) : (
          <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
            {isCarryOver ? (
              <>
                <p className="text-[#8B95A7] text-xs">Bilanz pro Spieler (€)</p>
                {participants.map(rp => (
                  <div key={rp.id} className="flex items-center justify-between gap-3">
                    <span className="text-[#F1F5F9] text-sm">{rp.player?.name}</span>
                    <input
                      type="number"
                      step="1"
                      value={balances[rp.player_id] ?? '0'}
                      onChange={e => setBalances(b => ({ ...b, [rp.player_id]: e.target.value }))}
                      className="w-24 bg-[#1B2230] border border-[#2A3344] rounded-xl px-3 py-2 text-[#F1F5F9] text-sm outline-none focus:border-[#6366F1] text-right"
                    />
                  </div>
                ))}
              </>
            ) : (
              <>
                <div>
                  <label className="block text-[#8B95A7] text-xs uppercase tracking-wider mb-2 font-medium">Einsatz (€)</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={stake}
                    onChange={e => setStake(e.target.value)}
                    className="w-full bg-[#1B2230] border border-[#2A3344] rounded-xl px-4 py-3 text-[#F1F5F9] outline-none focus:border-[#6366F1]"
                  />
                </div>
                <div>
                  <label className="block text-[#8B95A7] text-xs uppercase tracking-wider mb-2 font-medium">Gewinner</label>
                  <div className="space-y-1.5">
                    {participants.map(rp => (
                      <button
                        key={rp.id}
                        onClick={() => setWinnerId(rp.player_id)}
                        className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl border text-sm transition-colors ${
                          winnerId === rp.player_id
                            ? 'border-[#6366F1] bg-[#6366F1]/10 text-[#F1F5F9]'
                            : 'border-[#2A3344] bg-[#1B2230] text-[#8B95A7]'
                        }`}
                      >
                        <span>{rp.player?.name}</span>
                        {winnerId === rp.player_id && <span className="text-[#6366F1]">👑</span>}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        <div className="px-5 py-4 border-t border-[#2A3344]">
          <button
            onClick={save}
            disabled={saving || loading}
            className="w-full bg-[#6366F1] hover:bg-[#818CF8] disabled:opacity-50 text-white font-semibold rounded-2xl py-3.5 transition-colors"
          >
            {saving ? 'Speichern...' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  )
}
