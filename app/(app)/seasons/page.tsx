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
import Portal from '@/components/ui/Portal'

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

  async function setSeasonStatus(season: Season, status: 'active' | 'completed') {
    if (status === 'active') {
      if (!confirm('Season wieder aktivieren? Eine andere aktive Season wird dabei abgeschlossen.')) return
      // Nur eine Season darf aktiv sein
      await supabase
        .from('seasons')
        .update({ status: 'completed', end_date: new Date().toISOString().split('T')[0] })
        .eq('status', 'active')
        .neq('id', season.id)
      await supabase
        .from('seasons')
        .update({ status: 'active', end_date: null })
        .eq('id', season.id)
    } else {
      if (!confirm(`Season "${season.name}" wirklich abschließen?`)) return
      await supabase
        .from('seasons')
        .update({ status: 'completed', end_date: new Date().toISOString().split('T')[0] })
        .eq('id', season.id)
    }
    const updated: Season = {
      ...season,
      status,
      end_date: status === 'active' ? null : new Date().toISOString().split('T')[0],
    }
    setDetailSeason(updated)
    await loadSeasons()
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
    return <div className="flex items-center justify-center min-h-[60vh] text-[#7C7461]">Laden...</div>
  }

  // ---------- Detail view ----------
  if (detailSeason) {
    return (
      <div className="flex flex-col max-w-md mx-auto w-full">
        <div className="flex items-center gap-2 px-3 pt-5 pb-3">
          <button
            onClick={() => setDetailSeason(null)}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-[#FFFDF7] text-[#23201A] text-2xl transition-colors"
          >
            ‹
          </button>
          <h1 className="font-[family-name:var(--font-display)] text-xl font-bold text-[#23201A] flex-1 tracking-tight">
            {detailSeason.name}
          </h1>
          <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
            detailSeason.status === 'active'
              ? 'bg-[#1F9D57]/15 text-[#1F9D57]'
              : 'bg-[#E4D9BF] text-[#7C7461]'
          }`}>
            {detailSeason.status === 'active' ? 'Aktiv' : 'Abgeschlossen'}
          </span>
        </div>

        <div className="px-4 py-2 space-y-6">
          {/* Balances */}
          <div>
            <p className="text-[#7C7461] text-xs uppercase tracking-wider mb-3 font-medium">Saisonbilanz</p>
            <div className="bg-[#FBF6EA] rounded-2xl border border-[#E4D9BF] overflow-hidden">
              {seasonBalances.length === 0 ? (
                <p className="text-[#7C7461] text-sm text-center py-6">Noch keine Daten</p>
              ) : (
                seasonBalances.map(b => (
                  <div key={b.player.id} className="flex items-center justify-between px-4 py-3 border-b border-[#E4D9BF] last:border-0">
                    <span className="text-[#23201A]">{b.player.name}</span>
                    <span className={`font-semibold ${getBalanceColor(b.total)}`}>{formatBalance(b.total)}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Settlements */}
          {detailSeason.status === 'completed' && settlements.length > 0 && (
            <div>
              <p className="text-[#7C7461] text-xs uppercase tracking-wider mb-3 font-medium">Auszahlungsübersicht</p>
              <div className="bg-[#FBF6EA] rounded-2xl border border-[#E4D9BF] overflow-hidden">
                {settlements.map((s, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-3 border-b border-[#E4D9BF] last:border-0">
                    <span className="text-[#23201A] text-sm">
                      <span className="text-[#C8443B]">{s.from.name}</span>
                      {' → '}
                      <span className="text-[#1F9D57]">{s.to.name}</span>
                    </span>
                    <span className="text-[#2E6B3A] font-bold">{s.amount} €</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sessions & Rounds */}
          <div>
            <p className="text-[#7C7461] text-xs uppercase tracking-wider mb-3 font-medium">Sessions & Runden</p>
            <div className="space-y-3">
              {sessionsData.length === 0 ? (
                <p className="text-[#7C7461] text-sm text-center py-4">Keine Sessions</p>
              ) : (
                sessionsData.map(({ session, rounds }, idx) => (
                  <div key={session.id} className="bg-[#FBF6EA] rounded-2xl border border-[#E4D9BF] overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5 bg-[#FFFDF7] border-b border-[#E4D9BF]">
                      <div>
                        <span className="text-[#23201A] text-sm font-semibold">Session {idx + 1}</span>
                        <span className="text-[#7C7461] text-xs ml-2">
                          {new Date(session.started_at).toLocaleDateString('de-DE')}
                          {session.status === 'active' && ' · läuft'}
                        </span>
                      </div>
                      <button
                        onClick={() => deleteSession(session)}
                        className="text-[#C8443B] text-xs font-medium px-2.5 py-1 rounded-lg bg-[#C8443B]/10"
                      >
                        Löschen
                      </button>
                    </div>
                    {rounds.length === 0 ? (
                      <p className="text-[#7C7461] text-xs text-center py-3">Keine Runden</p>
                    ) : (
                      rounds.map(r => (
                        <div key={r.id} className="flex items-center justify-between px-4 py-2.5 border-b border-[#E4D9BF] last:border-0">
                          <div className="flex-1 min-w-0">
                            <span className="text-[#23201A] text-sm">
                              {r.round_number === 0 ? 'Saldovortrag' : `Runde ${r.round_number}`}
                            </span>
                            {r.round_number > 0 && (
                              <span className="text-[#7C7461] text-xs ml-2">{r.stake} €</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => setEditingRound(r)}
                              className="text-[#2E6B3A] text-xs font-medium px-2.5 py-1 rounded-lg bg-[#2E6B3A]/10"
                            >
                              Bearbeiten
                            </button>
                            <button
                              onClick={() => deleteRound(r)}
                              className="text-[#C8443B] text-xs font-medium px-2.5 py-1 rounded-lg bg-[#C8443B]/10"
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

          {/* Season status */}
          <div>
            <p className="text-[#7C7461] text-xs uppercase tracking-wider mb-3 font-medium">Status</p>
            {detailSeason.status === 'active' ? (
              <button
                onClick={() => setSeasonStatus(detailSeason, 'completed')}
                className="w-full bg-[#FBF6EA] border border-[#C8443B]/40 text-[#C8443B] font-semibold rounded-2xl py-3.5 transition-colors hover:bg-[#C8443B]/5"
              >
                Season abschließen
              </button>
            ) : (
              <button
                onClick={() => setSeasonStatus(detailSeason, 'active')}
                className="w-full bg-[#FBF6EA] border border-[#1F9D57]/40 text-[#1F9D57] font-semibold rounded-2xl py-3.5 transition-colors hover:bg-[#1F9D57]/5"
              >
                Season wieder aktivieren
              </button>
            )}
          </div>
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
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-[#23201A] tracking-tight">
          Seasons
        </h1>
        <button
          onClick={() => setShowNewForm(true)}
          className="bg-[#2E6B3A] hover:bg-[#3A8049] text-white font-semibold rounded-xl px-4 py-2 text-sm transition-colors"
        >
          + Neu
        </button>
      </div>

      {showNewForm && (
        <div className="mx-4 mb-4 bg-[#FBF6EA] rounded-2xl border border-[#2E6B3A]/40 p-4 space-y-3 animate-pop-in">
          <h2 className="font-semibold text-[#23201A]">Neue Season</h2>
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Name (z.B. Season 3)"
            className="w-full bg-[#F4ECDA] border border-[#E4D9BF] rounded-xl px-4 py-3 text-[#23201A] text-sm outline-none focus:border-[#2E6B3A]"
          />
          <input
            type="date"
            value={newStartDate}
            onChange={e => setNewStartDate(e.target.value)}
            className="w-full bg-[#F4ECDA] border border-[#E4D9BF] rounded-xl px-4 py-3 text-[#23201A] text-sm outline-none focus:border-[#2E6B3A]"
          />
          <div className="flex gap-2">
            <button onClick={() => setShowNewForm(false)} className="flex-1 bg-[#FFFDF7] text-[#7C7461] font-medium rounded-xl py-3 text-sm">
              Abbrechen
            </button>
            <button onClick={createSeason} disabled={!newName} className="flex-1 bg-[#2E6B3A] disabled:opacity-50 text-white font-semibold rounded-xl py-3 text-sm">
              Anlegen
            </button>
          </div>
        </div>
      )}

      <div className="px-4 pb-6 space-y-3">
        {seasons.length === 0 ? (
          <div className="text-center text-[#7C7461] py-10">Noch keine Seasons vorhanden.</div>
        ) : (
          seasons.map(s => (
            <button
              key={s.id}
              onClick={() => loadSeasonDetail(s)}
              className="w-full text-left bg-[#FBF6EA] rounded-2xl border border-[#E4D9BF] p-4 hover:border-[#2E6B3A]/50 transition-colors"
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-semibold text-[#23201A]">{s.name}</span>
                <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                  s.status === 'active' ? 'bg-[#1F9D57]/15 text-[#1F9D57]' : 'bg-[#E4D9BF] text-[#7C7461]'
                }`}>
                  {s.status === 'active' ? 'Aktiv' : 'Fertig'}
                </span>
              </div>
              <div className="flex gap-3 text-[#7C7461] text-xs">
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
    <Portal>
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[100] flex items-end animate-fade-in" onClick={onClose}>
      <div
        className="w-full max-w-md mx-auto bg-[#FBF6EA] rounded-t-3xl border-t border-[#E4D9BF] max-h-[85vh] flex flex-col animate-pop-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E4D9BF]">
          <h2 className="font-[family-name:var(--font-display)] font-bold text-[#23201A]">
            {isCarryOver ? 'Saldovortrag bearbeiten' : `Runde ${round.round_number} bearbeiten`}
          </h2>
          <button onClick={onClose} className="text-[#7C7461] text-2xl leading-none w-8 h-8">×</button>
        </div>

        {loading ? (
          <div className="text-center text-[#7C7461] py-10">Laden...</div>
        ) : (
          <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
            {isCarryOver ? (
              <>
                <p className="text-[#7C7461] text-xs">Bilanz pro Spieler (€)</p>
                {participants.map(rp => (
                  <div key={rp.id} className="flex items-center justify-between gap-3">
                    <span className="text-[#23201A] text-sm">{rp.player?.name}</span>
                    <input
                      type="number"
                      step="1"
                      value={balances[rp.player_id] ?? '0'}
                      onChange={e => setBalances(b => ({ ...b, [rp.player_id]: e.target.value }))}
                      className="w-24 bg-[#FFFDF7] border border-[#E4D9BF] rounded-xl px-3 py-2 text-[#23201A] text-sm outline-none focus:border-[#2E6B3A] text-right"
                    />
                  </div>
                ))}
              </>
            ) : (
              <>
                <div>
                  <label className="block text-[#7C7461] text-xs uppercase tracking-wider mb-2 font-medium">Einsatz (€)</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={stake}
                    onChange={e => setStake(e.target.value)}
                    className="w-full bg-[#FFFDF7] border border-[#E4D9BF] rounded-xl px-4 py-3 text-[#23201A] outline-none focus:border-[#2E6B3A]"
                  />
                </div>
                <div>
                  <label className="block text-[#7C7461] text-xs uppercase tracking-wider mb-2 font-medium">Gewinner</label>
                  <div className="space-y-1.5">
                    {participants.map(rp => (
                      <button
                        key={rp.id}
                        onClick={() => setWinnerId(rp.player_id)}
                        className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl border text-sm transition-colors ${
                          winnerId === rp.player_id
                            ? 'border-[#2E6B3A] bg-[#2E6B3A]/10 text-[#23201A]'
                            : 'border-[#E4D9BF] bg-[#FFFDF7] text-[#7C7461]'
                        }`}
                      >
                        <span>{rp.player?.name}</span>
                        {winnerId === rp.player_id && <span className="text-[#2E6B3A]">👑</span>}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        <div className="px-5 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] border-t border-[#E4D9BF]">
          <button
            onClick={save}
            disabled={saving || loading}
            className="w-full bg-[#2E6B3A] hover:bg-[#3A8049] disabled:opacity-50 text-white font-semibold rounded-2xl py-3.5 transition-colors"
          >
            {saving ? 'Speichern...' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
    </Portal>
  )
}
