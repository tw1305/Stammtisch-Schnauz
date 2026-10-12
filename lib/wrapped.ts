import type { SupabaseClient } from '@supabase/supabase-js'
import type { Badge, Player, PlayerStats, Season } from '@/types/database'
import { computePlayerStats, deriveBadges, fetchByIds, loadFires } from '@/lib/stats'

/**
 * Season 1 and 2 were only partly tracked in the app (they start from a
 * "Saldovortrag"), so their numbers would make a misleading recap.
 */
const WRAPPED_EXCLUDED_SEASON_IDS = new Set([
  'd5c276eb-59e1-4589-b3e2-4febc329c4ee', // Season 1 – Der Anfang
  '85ca3f1a-9b0b-46c3-902e-0f1983fb30ea', // Season 2 – Pferdeseason
])

/** The recap exists for every finished season that was fully tracked in the app. */
export function wrappedAvailable(season: Pick<Season, 'id' | 'status'>): boolean {
  return season.status === 'completed' && !WRAPPED_EXCLUDED_SEASON_IDS.has(season.id)
}

/** Everyone sharing the top value (value ≥ 1), e.g. the fire king(s). */
export type Leaders = { players: Player[]; value: number }

export type Evening = { player: Player; delta: number; date: string }

export type SeasonWrapped = {
  season: Season
  sessions: number
  rounds: number
  /** Time actually played: first round start → last round end, summed over the evenings. */
  hours: number
  /** Sum of everything won — the money that changed hands. */
  moneyMoved: number
  fires: number
  avgPlayers: number
  /** All players of the season, best balance first. */
  stats: PlayerStats[]
  badges: Record<string, Badge[]>
  bestEvening: Evening | null
  worstEvening: Evening | null
  streak: Leaders | null
  fireKing: Leaders | null
  firstOut: Leaders | null
  finalist: Leaders | null
  medic: Leaders | null
  phoenix: Leaders | null
  comeback: Leaders | null
  biggestRound: { stake: number; winner: Player | null; date: string; players: number } | null
  /** Each player's own best evening (only if they finished one in the plus). */
  personalBest: Record<string, { delta: number; date: string }>
  /** Evenings attended per player id. */
  attendance: Record<string, number>
  /** Players who were there every single evening. */
  regulars: Player[]
  /** Per player: the opponent(s) they lost the most finals (last two standing) against. */
  nemesis: Record<string, { opponents: Player[]; count: number }>
}

type WRound = {
  id: string
  session_id: string
  round_number: number
  stake: number
  winner_id: string | null
  started_at: string
  ended_at: string | null
  status: string
}

type WRoundPlayer = {
  round_id: string
  player_id: string
  is_winner: boolean
  reached_final: boolean
  balance_change: number | null
}

function leaders(stats: PlayerStats[], pick: (s: PlayerStats) => number): Leaders | null {
  let max = 0
  for (const s of stats) max = Math.max(max, pick(s))
  if (max < 1) return null
  return { players: stats.filter(s => pick(s) === max).map(s => s.player), value: max }
}

export async function computeSeasonWrapped(supabase: SupabaseClient, season: Season): Promise<SeasonWrapped> {
  const { data: sessionRows } = await supabase.from('sessions').select('id, started_at').eq('season_id', season.id)
  const sessions = (sessionRows || []) as { id: string; started_at: string }[]
  const sessionDate = Object.fromEntries(sessions.map(s => [s.id, s.started_at]))

  const rounds = (
    await fetchByIds<WRound>(
      supabase,
      'rounds',
      'id, session_id, round_number, stake, winner_id, started_at, ended_at, status',
      'session_id',
      sessions.map(s => s.id)
    )
  ).filter(r => r.status === 'completed' && r.round_number > 0)
  const roundIds = rounds.map(r => r.id)

  const rps = await fetchByIds<WRoundPlayer>(
    supabase,
    'round_players',
    'id, round_id, player_id, is_winner, reached_final, balance_change',
    'round_id',
    roundIds
  )
  const fires = await loadFires(supabase, roundIds)

  const playerIds = [...new Set(rps.map(r => r.player_id))]
  const stats = playerIds.length > 0 ? await computePlayerStats(supabase, { seasonId: season.id, playerIds }) : []
  const playerById: Record<string, Player> = Object.fromEntries(stats.map(s => [s.player.id, s.player]))

  const roundById = Object.fromEntries(rounds.map(r => [r.id, r]))
  const rpsByRound: Record<string, WRoundPlayer[]> = {}
  for (const rp of rps) (rpsByRound[rp.round_id] ??= []).push(rp)

  // Playing time per evening
  let ms = 0
  const roundsBySession: Record<string, WRound[]> = {}
  for (const r of rounds) (roundsBySession[r.session_id] ??= []).push(r)
  for (const list of Object.values(roundsBySession)) {
    const start = Math.min(...list.map(r => new Date(r.started_at).getTime()))
    const end = Math.max(...list.map(r => new Date(r.ended_at ?? r.started_at).getTime()))
    if (end > start && end - start < 14 * 3600_000) ms += end - start
  }

  // Evenings: net result per player and session, attendance
  const evening: Record<string, Record<string, number>> = {}
  const attendedSessions: Record<string, Set<string>> = {}
  let moneyMoved = 0
  for (const rp of rps) {
    const r = roundById[rp.round_id]
    if (!r) continue
    ;(attendedSessions[rp.player_id] ??= new Set()).add(r.session_id)
    const delta = rp.balance_change ?? 0
    if (delta > 0) moneyMoved += delta
    const bySession = (evening[r.session_id] ??= {})
    bySession[rp.player_id] = (bySession[rp.player_id] ?? 0) + delta
  }
  const personalBest: SeasonWrapped['personalBest'] = {}
  let bestEvening: Evening | null = null
  let worstEvening: Evening | null = null
  for (const [sid, byPlayer] of Object.entries(evening)) {
    for (const [pid, delta] of Object.entries(byPlayer)) {
      const player = playerById[pid]
      if (!player) continue
      if (delta > 0 && delta > (personalBest[pid]?.delta ?? 0)) personalBest[pid] = { delta, date: sessionDate[sid] }
      if (delta > 0 && (!bestEvening || delta > bestEvening.delta)) bestEvening = { player, delta, date: sessionDate[sid] }
      if (delta < 0 && (!worstEvening || delta < worstEvening.delta)) worstEvening = { player, delta, date: sessionDate[sid] }
    }
  }
  const attendance = Object.fromEntries(Object.entries(attendedSessions).map(([pid, set]) => [pid, set.size]))
  const playedSessions = Object.keys(roundsBySession).length
  const regulars = stats.filter(s => attendance[s.player.id] === playedSessions).map(s => s.player)

  // Biggest stake of the season (earliest such round if several)
  let biggestRound: SeasonWrapped['biggestRound'] = null
  for (const r of [...rounds].sort((a, b) => a.started_at.localeCompare(b.started_at))) {
    if (!biggestRound || r.stake > biggestRound.stake) {
      biggestRound = {
        stake: r.stake,
        winner: r.winner_id ? playerById[r.winner_id] ?? null : null,
        date: r.started_at,
        players: rpsByRound[r.id]?.length ?? 0,
      }
    }
  }

  // Erzfeind: the player you lost the most finals against
  const lostFinals: Record<string, Record<string, number>> = {}
  for (const r of rounds) {
    if (!r.winner_id) continue
    const table = rpsByRound[r.id] ?? []
    for (const rp of table) {
      // A two-player round is a final from the start (reached_final is only set
      // once a bigger table is down to two).
      if (rp.player_id === r.winner_id || !(rp.reached_final || table.length === 2)) continue
      const byOpp = (lostFinals[rp.player_id] ??= {})
      byOpp[r.winner_id] = (byOpp[r.winner_id] ?? 0) + 1
    }
  }
  const nemesis: SeasonWrapped['nemesis'] = {}
  for (const [pid, byOpp] of Object.entries(lostFinals)) {
    const count = Math.max(...Object.values(byOpp))
    const opponents = Object.entries(byOpp)
      .filter(([, n]) => n === count)
      .map(([oid]) => playerById[oid])
      .filter(Boolean)
    if (opponents.length > 0) nemesis[pid] = { opponents, count }
  }

  return {
    season,
    sessions: playedSessions,
    rounds: rounds.length,
    hours: Math.round(ms / 360_000) / 10,
    moneyMoved,
    fires: fires.length,
    avgPlayers: rounds.length > 0 ? Math.round((rps.length / rounds.length) * 10) / 10 : 0,
    stats,
    badges: deriveBadges(stats),
    bestEvening,
    worstEvening,
    streak: leaders(stats, s => s.longest_streak),
    fireKing: leaders(stats, s => s.fires),
    firstOut: leaders(stats, s => s.first_eliminations),
    finalist: leaders(stats, s => s.final_appearances),
    medic: leaders(stats, s => s.revives_given),
    phoenix: leaders(stats, s => s.revivals),
    comeback: leaders(stats, s => s.comebacks),
    biggestRound,
    personalBest,
    attendance,
    regulars,
    nemesis,
  }
}
