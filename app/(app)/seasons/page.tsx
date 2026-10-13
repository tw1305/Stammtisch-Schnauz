'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  getCurrentQuarter,
  calculateSettlements,
  calculateBalances,
  formatBalance,
  getBalanceColor,
} from '@/lib/game-logic'
import type { Season, Player, DebtSettlement, Session, Round, RoundPlayer, SessionSummary } from '@/types/database'
import {
  compareSeasonsDesc,
  fetchAll,
  fetchByIds,
  loadFires,
  loadPlayerMap,
  buildSessionSummary,
  clearStatsCache,
  SUMMARY_RP_SELECT,
  type SummaryRoundPlayer,
} from '@/lib/stats'
import Portal from '@/components/ui/Portal'
import { SessionSummaryView } from '@/components/ui/SessionSummaryModal'
import SeasonWrapped from '@/components/ui/SeasonWrapped'
import { wrappedAvailable } from '@/lib/wrapped'
import { initFeedback, startRecapMusic } from '@/lib/feedback'

type SeasonWithStats = Season & { roundCount: number; avgStake: number }
/** `number` is the chronological session number within the season (1 = oldest). */
type SessionWithRounds = { session: Session; number: number; rounds: Round[]; summary: SessionSummary }
type SeasonDetail = {
  balances: { player: Player; total: number }[]
  settlements: DebtSettlement[]
  sessions: SessionWithRounds[]
  playerNames: Record<string, string>
}
const EMPTY_DETAIL: SeasonDetail = { balances: [], settlements: [], sessions: [], playerNames: {} }

/**
 * Season overviews already seen during this visit: opening one again shows it
 * instantly while it refreshes in the background. Lives outside the component,
 * so it also survives switching tabs.
 */
const detailCache = new Map<string, SeasonDetail>()
const listCache = new Map<'list', SeasonWithStats[]>()

async function fetchSeasonDetail(supabase: ReturnType<typeof createClient>, seasonId: string): Promise<SeasonDetail> {
  const [{ data: sessions }, players] = await Promise.all([
    supabase.from('sessions').select('*').eq('season_id', seasonId).order('started_at', { ascending: true }),
    loadPlayerMap(supabase),
  ])
  const sessionList = (sessions || []) as Session[]
  if (sessionList.length === 0) return EMPTY_DETAIL

  const allRounds = (
    await fetchByIds<Round>(supabase, 'rounds', '*', 'session_id', sessionList.map(s => s.id))
  ).sort((a, b) => a.round_number - b.round_number)
  const completedRoundIds = allRounds.filter(r => r.status === 'completed').map(r => r.id)
  // Player rows without the joined player: avatars come once from loadPlayerMap.
  const [rps, fires] = await Promise.all([
    fetchByIds<SummaryRoundPlayer>(supabase, 'round_players', SUMMARY_RP_SELECT, 'round_id', completedRoundIds),
    loadFires(supabase, completedRoundIds),
  ])

  // Session cards: newest first, but keep the chronological "Session N" numbering.
  const sessionsData = sessionList
    .map((s, i) => {
      const sRounds = allRounds.filter(r => r.session_id === s.id)
      const realIds = new Set(sRounds.filter(r => r.status === 'completed' && r.round_number > 0).map(r => r.id))
      return {
        session: s,
        number: i + 1,
        rounds: sRounds,
        summary: buildSessionSummary(
          realIds.size,
          rps.filter(rp => realIds.has(rp.round_id)),
          fires.filter(f => realIds.has(f.round_id)),
          players
        ),
      }
    })
    .reverse()

  const balMap: Record<string, { player: Player; total: number }> = {}
  for (const rp of rps) {
    const p = players.get(rp.player_id)
    if (!p) continue
    if (!balMap[rp.player_id]) balMap[rp.player_id] = { player: p, total: 0 }
    if (rp.balance_change != null) balMap[rp.player_id].total += rp.balance_change
  }
  const balances = Object.values(balMap).sort((a, b) => b.total - a.total)
  return {
    balances,
    settlements: calculateSettlements(balances),
    sessions: sessionsData,
    playerNames: Object.fromEntries([...players.values()].map(p => [p.id, p.name])),
  }
}

export default function SeasonsPage() {
  const supabase = createClient()
  const [seasons, setSeasons] = useState<SeasonWithStats[]>(() => listCache.get('list') ?? [])
  const [loading, setLoading] = useState(() => !listCache.has('list'))
  const [detailLoading, setDetailLoading] = useState(false)
  // Only the newest detail request may write its result (fast season switching).
  const detailRequest = useRef(0)
  const [showNewForm, setShowNewForm] = useState(false)
  const [newName, setNewName] = useState(getCurrentQuarter())
  const [newStartDate, setNewStartDate] = useState(new Date().toISOString().split('T')[0])
  const [detailSeason, setDetailSeason] = useState<Season | null>(null)
  const [detail, setDetail] = useState<SeasonDetail>(EMPTY_DETAIL)
  const { balances: seasonBalances, settlements, sessions: sessionsData, playerNames } = detail
  const [editingRound, setEditingRound] = useState<Round | null>(null)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [openSessions, setOpenSessions] = useState<Set<string>>(new Set())
  const [wrappedSeason, setWrappedSeason] = useState<Season | null>(null)

  function toggleSession(id: string) {
    setOpenSessions(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  useEffect(() => {
    loadSeasons()
    initFeedback() // the tap that opens the recap unlocks its sounds
  }, [])

  async function renameSeason() {
    if (!detailSeason) return
    const trimmed = nameInput.trim()
    if (!trimmed || trimmed === detailSeason.name) {
      setEditingName(false)
      return
    }
    await supabase.from('seasons').update({ name: trimmed }).eq('id', detailSeason.id)
    setDetailSeason({ ...detailSeason, name: trimmed })
    setEditingName(false)
    await loadSeasons()
  }

  async function loadSeasons() {
    // 3 queries for the whole list instead of 2 per season, one after another.
    const [{ data }, sessions, rounds] = await Promise.all([
      supabase.from('seasons').select('*'),
      fetchAll<{ id: string; season_id: string }>(supabase, 'sessions', 'id, season_id'),
      fetchAll<{ session_id: string; stake: number }>(supabase, 'rounds', 'session_id, stake', q =>
        q.eq('status', 'completed').gt('round_number', 0)
      ),
    ])
    const seasonOf = new Map(sessions.map(x => [x.id, x.season_id]))
    const agg = new Map<string, { n: number; sum: number }>()
    for (const r of rounds) {
      const sid = seasonOf.get(r.session_id)
      if (!sid) continue
      const cur = agg.get(sid) ?? { n: 0, sum: 0 }
      cur.n++
      cur.sum += r.stake
      agg.set(sid, cur)
    }
    const enriched: SeasonWithStats[] = (data || []).sort(compareSeasonsDesc).map(season => {
      const cur = agg.get(season.id)
      return { ...season, roundCount: cur?.n ?? 0, avgStake: cur ? Math.round((cur.sum / cur.n) * 10) / 10 : 0 }
    })
    listCache.set('list', enriched)
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
      // The recap opens right after; its song must be started within this tap.
      if (wrappedAvailable(season) && (seasons.find(x => x.id === season.id)?.roundCount ?? 0) > 0) startRecapMusic()
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
    // Finishing a season rolls straight into its recap.
    const played = (seasons.find(x => x.id === season.id)?.roundCount ?? 0) > 0
    if (status === 'completed' && played && wrappedAvailable(updated)) setWrappedSeason(updated)
  }

  async function loadSeasonDetail(season: Season) {
    const req = ++detailRequest.current
    setDetailSeason(season)
    // Never show the season we came from: cached data of this season, or empty + "Laden…".
    const cached = detailCache.get(season.id)
    setDetail(cached ?? EMPTY_DETAIL)
    setDetailLoading(!cached)
    try {
      const fresh = await fetchSeasonDetail(supabase, season.id)
      detailCache.set(season.id, fresh)
      if (req !== detailRequest.current) return // the user moved on meanwhile
      setDetail(fresh)
    } finally {
      if (req === detailRequest.current) setDetailLoading(false)
    }
  }

  /** After editing data: drop cached results so the overview and statistics recompute. */
  function invalidate() {
    detailCache.clear()
    clearStatsCache()
  }

  async function deleteRound(round: Round) {
    if (!confirm('Runde löschen? Die Bilanzen werden entsprechend angepasst.')) return
    await supabase.from('round_players').delete().eq('round_id', round.id)
    await supabase.from('rounds').delete().eq('id', round.id)
    invalidate()
    if (detailSeason) loadSeasonDetail(detailSeason)
    loadSeasons()
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
    invalidate()
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
            onClick={() => { detailRequest.current++; setDetailSeason(null) }}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-[#FFFDF7] text-[#23201A] text-2xl transition-colors"
          >
            ‹
          </button>
          {editingName ? (
            <div className="flex-1 flex items-center gap-2">
              <input
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') renameSeason()
                  if (e.key === 'Escape') setEditingName(false)
                }}
                autoFocus
                className="flex-1 min-w-0 bg-[#FFFDF7] border border-[#2E6B3A] rounded-xl px-3 py-1.5 text-[#23201A] text-base outline-none"
              />
              <button
                onClick={renameSeason}
                className="text-[#2E6B3A] text-sm font-semibold px-2 py-1.5 rounded-lg bg-[#2E6B3A]/10"
              >
                Speichern
              </button>
              <button
                onClick={() => setEditingName(false)}
                className="text-[#7C7461] text-xl leading-none w-8 h-8 shrink-0"
              >
                ×
              </button>
            </div>
          ) : (
            <>
              <h1 className="font-[family-name:var(--font-display)] text-xl font-bold text-[#23201A] flex-1 tracking-tight">
                {detailSeason.name}
              </h1>
              <button
                onClick={() => { setNameInput(detailSeason.name); setEditingName(true) }}
                className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-[#FFFDF7] text-[#7C7461] text-base transition-colors shrink-0"
                aria-label="Namen bearbeiten"
              >
                ✏️
              </button>
              <span className={`text-xs px-2.5 py-1 rounded-full font-semibold shrink-0 ${
                detailSeason.status === 'active'
                  ? 'bg-[#1F9D57]/15 text-[#1F9D57]'
                  : 'bg-[#E4D9BF] text-[#7C7461]'
              }`}>
                {detailSeason.status === 'active' ? 'Aktiv' : 'Abgeschlossen'}
              </span>
            </>
          )}
        </div>

        <div className="px-4 py-2 space-y-6">
          {wrappedAvailable(detailSeason) && seasonBalances.length > 0 && (
            <WrappedButton onClick={() => { startRecapMusic(); setWrappedSeason(detailSeason) }} />
          )}

          {/* Balances */}
          <div>
            <p className="text-[#7C7461] text-xs uppercase tracking-wider mb-3 font-medium">Saisonbilanz</p>
            <div className="bg-[#FBF6EA] rounded-2xl border border-[#E4D9BF] overflow-hidden">
              {seasonBalances.length === 0 ? (
                <p className="text-[#7C7461] text-sm text-center py-6">{detailLoading ? 'Laden…' : 'Noch keine Daten'}</p>
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
                <p className="text-[#7C7461] text-sm text-center py-4">{detailLoading ? 'Laden…' : 'Keine Sessions'}</p>
              ) : (
                sessionsData.map(({ session, number, rounds, summary }) => {
                  const isOpen = openSessions.has(session.id)
                  return (
                  <div
                    key={session.id}
                    className={`bg-[#FBF6EA] rounded-2xl border overflow-hidden transition-colors ${
                      isOpen ? 'border-[#2E6B3A] shadow-sm' : 'border-[#E4D9BF]'
                    }`}
                  >
                    <div className={`flex items-center gap-2 px-2 py-1.5 border-b border-[#E4D9BF] ${isOpen ? 'bg-[#2E6B3A]/10' : 'bg-[#FFFDF7]'}`}>
                      <button
                        onClick={() => toggleSession(session.id)}
                        aria-expanded={isOpen}
                        className="flex-1 min-w-0 flex items-center gap-2.5 text-left"
                      >
                        {/* Large, clearly stateful toggle: outlined when closed, filled + rotated when open */}
                        <span
                          className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center border-2 transition-all duration-200 ${
                            isOpen ? 'bg-[#2E6B3A] border-[#2E6B3A] text-white rotate-180' : 'bg-[#FFFDF7] border-[#2E6B3A]/50 text-[#2E6B3A]'
                          }`}
                          aria-hidden="true"
                        >
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <path d="M3.5 6l4.5 4.5L12.5 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </span>
                        <span className="min-w-0">
                          <span className="text-[#23201A] text-sm font-semibold">Session {number}</span>
                          <span className="text-[#7C7461] text-xs ml-2">
                            {new Date(session.started_at).toLocaleDateString('de-DE')}
                            {' · '}{summary.rounds} {summary.rounds === 1 ? 'Runde' : 'Runden'}
                            {session.status === 'active' && ' · läuft'}
                          </span>
                        </span>
                      </button>
                      <button
                        onClick={() => deleteSession(session)}
                        className="text-[#C8443B] text-xs font-medium px-2.5 py-1 rounded-lg bg-[#C8443B]/10 shrink-0"
                      >
                        Löschen
                      </button>
                    </div>

                    {/* Collapsed: the same scoreboard shown when a session ends */}
                    <div className="px-1.5 py-0.5">
                      <SessionSummaryView summary={summary} compact />
                    </div>

                    {isOpen && (
                    <div className="border-t border-[#E4D9BF] animate-fade-in">
                    <p className="text-[#7C7461] text-[10px] uppercase tracking-wider font-medium px-4 pt-2.5 pb-1">Runden</p>
                    {rounds.length === 0 ? (
                      <p className="text-[#7C7461] text-xs text-center py-3">Keine Runden</p>
                    ) : (
                      rounds.map(r => (
                        <div key={r.id} className="flex items-center justify-between px-4 py-2.5 border-b border-[#E4D9BF] last:border-0">
                          <div className="flex-1 min-w-0 flex items-baseline gap-2">
                            <span className="text-[#23201A] text-sm shrink-0">
                              {r.round_number === 0 ? 'Saldovortrag' : `Runde ${r.round_number}`}
                            </span>
                            {r.round_number > 0 && (
                              <span className="text-[#7C7461] text-xs shrink-0">{r.stake} €</span>
                            )}
                            {r.round_number > 0 && (
                              r.status === 'active' ? (
                                <span className="text-[#7C7461] text-xs italic truncate">läuft</span>
                              ) : r.winner_id ? (
                                <span className="text-[#2E6B3A] text-xs font-semibold truncate min-w-0">
                                  👑 {playerNames[r.winner_id] ?? '?'}
                                </span>
                              ) : null
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
                    )}
                  </div>
                  )
                })
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
            onSaved={() => {
              setEditingRound(null)
              invalidate()
              if (detailSeason) loadSeasonDetail(detailSeason)
              loadSeasons()
            }}
          />
        )}

        {wrappedSeason && <SeasonWrapped season={wrappedSeason} onClose={() => setWrappedSeason(null)} />}
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
            <div key={s.id} className="bg-[#FBF6EA] rounded-2xl border border-[#E4D9BF] hover:border-[#2E6B3A]/50 transition-colors overflow-hidden">
            <button
              onClick={() => { setOpenSessions(new Set()); loadSeasonDetail(s) }}
              className="w-full text-left p-4"
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
            {wrappedAvailable(s) && s.roundCount > 0 && (
              <div className="px-3 pb-3 -mt-1">
                <WrappedButton compact onClick={() => { startRecapMusic(); setWrappedSeason(s) }} />
              </div>
            )}
            </div>
          ))
        )}
      </div>

      {wrappedSeason && <SeasonWrapped season={wrappedSeason} onClose={() => setWrappedSeason(null)} />}
    </div>
  )
}

/** Entry point to the season recap ("Wrapped"). */
function WrappedButton({ onClick, compact = false }: { onClick: () => void; compact?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-center gap-2 font-semibold text-[#FBF6EA] rounded-2xl shadow-sm active:scale-[0.98] transition-transform ${
        compact ? 'py-2.5 text-sm' : 'py-4 text-base'
      }`}
      style={{ background: 'linear-gradient(135deg, #2E6B3A 0%, #16341D 60%, #6B4E16 100%)' }}
    >
      <span aria-hidden="true">✨</span> Season-Rückblick ansehen
    </button>
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
  const [beforeBalances, setBeforeBalances] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [{ data }, players] = await Promise.all([
        supabase.from('round_players').select('*').eq('round_id', round.id),
        loadPlayerMap(supabase),
      ])
      const rps = ((data || []) as RoundPlayer[]).map(rp => ({ ...rp, player: players.get(rp.player_id) }))

      // Season-wide cumulative balance entering this round: sum of every
      // completed round in the season that happened before it.
      const before: Record<string, number> = {}
      const { data: sess } = await supabase
        .from('sessions')
        .select('season_id')
        .eq('id', round.session_id)
        .single()
      if (sess?.season_id) {
        const { data: sessions } = await supabase.from('sessions').select('id').eq('season_id', sess.season_id)
        const sessionIds = (sessions || []).map(s => s.id)
        if (sessionIds.length > 0) {
          const { data: priorRounds } = await supabase
            .from('rounds')
            .select('id')
            .in('session_id', sessionIds)
            .eq('status', 'completed')
            .lt('started_at', round.started_at)
          const priorIds = (priorRounds || []).map(r => r.id).filter(id => id !== round.id)
          if (priorIds.length > 0) {
            const { data: priorRps } = await supabase
              .from('round_players')
              .select('player_id, balance_change')
              .in('round_id', priorIds)
            for (const rp of priorRps || []) {
              if (rp.balance_change != null) before[rp.player_id] = (before[rp.player_id] ?? 0) + rp.balance_change
            }
          }
        }
      }

      if (cancelled) return
      setParticipants(rps)
      const bal: Record<string, string> = {}
      rps.forEach(rp => { bal[rp.player_id] = String(rp.balance_change ?? 0) })
      setBalances(bal)
      setBeforeBalances(before)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [round.id, round.session_id, round.started_at, supabase])

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

  // Live preview of each participant's balance change for this round.
  const stakeNum = Math.max(0, parseInt(stake) || 0)
  const { winnerGain, loserLoss } = calculateBalances(round.player_count, stakeNum)
  const liveDelta = (rp: RoundPlayer): number =>
    isCarryOver
      ? parseInt(balances[rp.player_id]) || 0
      : rp.player_id === winnerId
        ? winnerGain
        : loserLoss

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

            {/* Balances before / after this round */}
            <div>
              <p className="text-[#7C7461] text-xs uppercase tracking-wider mb-2 font-medium">
                Salden vor / nach dieser Runde
              </p>
              <div className="rounded-xl border border-[#E4D9BF] overflow-hidden">
                <div className="grid grid-cols-[1fr_4rem_3.25rem_4rem] gap-x-2 items-center px-3 py-1.5 bg-[#FFFDF7] border-b border-[#E4D9BF] text-[10px] uppercase tracking-wider text-[#7C7461]">
                  <span>Spieler</span>
                  <span className="text-right">Vorher</span>
                  <span className="text-right">Δ</span>
                  <span className="text-right">Nachher</span>
                </div>
                {participants.map(rp => {
                  const before = beforeBalances[rp.player_id] ?? 0
                  const delta = liveDelta(rp)
                  const after = before + delta
                  return (
                    <div
                      key={rp.id}
                      className="grid grid-cols-[1fr_4rem_3.25rem_4rem] gap-x-2 items-center px-3 py-2 border-b border-[#E4D9BF] last:border-0"
                    >
                      <span className="text-[#23201A] text-sm truncate">{rp.player?.name}</span>
                      <span className="text-[11px] tabular-nums text-right text-[#7C7461]">{formatBalance(before)}</span>
                      <span className={`text-[11px] tabular-nums text-right ${getBalanceColor(delta)}`}>{formatBalance(delta)}</span>
                      <span className={`text-sm font-bold tabular-nums text-right ${getBalanceColor(after)}`}>{formatBalance(after)}</span>
                    </div>
                  )
                })}
              </div>
              <p className="text-[#7C7461] text-[11px] mt-1.5 leading-snug">
                Saison-Saldo vor der Runde und danach – aktualisiert sich live mit den Änderungen oben.
              </p>
            </div>
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
