import type { SupabaseClient } from '@supabase/supabase-js'
import type { Player, PlayerStats, Badge, HeadToHead, Session, Season, SessionBalancePoint, AchievementTally, SessionSummary, ScopeSummary } from '@/types/database'

type Supa = SupabaseClient

const PAGE = 1000 // PostgREST's default max rows per request
const ID_CHUNK = 150 // keeps `.in()` URLs well below request-length limits

/**
 * Loads every row of `table` whose `column` is in `ids`, splitting the id list
 * into chunks and paging through each chunk, so neither the URL length nor the
 * 1000-row response cap silently truncates results as the history grows.
 */
export async function fetchByIds<T>(
  supabase: Supa,
  table: string,
  select: string,
  column: string,
  ids: string[]
): Promise<T[]> {
  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += ID_CHUNK) chunks.push(ids.slice(i, i + ID_CHUNK))
  // Chunks load in parallel; pages within a chunk follow each other.
  const parts = await Promise.all(
    chunks.map(async chunk => {
      const rows: T[] = []
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from(table)
          .select(select)
          .in(column, chunk)
          .order('id')
          .range(from, from + PAGE - 1)
        if (error) throw error
        rows.push(...((data || []) as T[]))
        if (!data || data.length < PAGE) break
      }
      return rows
    })
  )
  return parts.flat()
}

/** Every row of `table` (paged past the 1000-row cap), optionally narrowed by `filter`. */
export async function fetchAll<T>(
  supabase: Supa,
  table: string,
  select: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filter: (q: any) => any = q => q
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await filter(supabase.from(table).select(select)).order('id').range(from, from + PAGE - 1)
    if (error) throw error
    out.push(...((data || []) as T[]))
    if (!data || data.length < PAGE) break
  }
  return out
}

// ---------- Short-lived request cache ----------

/**
 * Statistics fire many identical queries at once (key figures, player stats and
 * the achievement tally all need the same rounds). Results are shared for a few
 * seconds per client — real and test DB never mix — so each query runs once.
 */
let memoStore = new WeakMap<object, Map<string, { at: number; p: Promise<unknown> }>>()
const MEMO_MS = 10_000

function memo<T>(supabase: Supa, key: string, fn: () => Promise<T>, ttl = MEMO_MS): Promise<T> {
  let store = memoStore.get(supabase)
  if (!store) memoStore.set(supabase, (store = new Map()))
  const hit = store.get(key)
  if (hit && Date.now() - hit.at < ttl) return hit.p as Promise<T>
  const p = fn()
  store.set(key, { at: Date.now(), p })
  p.catch(() => store.delete(key))
  return p
}

/** Drops all cached query results (call after changing players or game data). */
export function clearStatsCache() {
  memoStore = new WeakMap()
}

/**
 * All players incl. their avatars, loaded once and shared for 5 minutes (the
 * Spieler page clears the cache whenever players are edited).
 * Avatars are base64 images (~50 KB each), so they must never be joined into
 * per-round rows — look players up here instead.
 */
export function loadPlayers(supabase: Supa): Promise<Player[]> {
  return memo(
    supabase,
    'players',
    async () => {
      const { data, error } = await supabase.from('players').select('*').order('name')
      if (error) throw error
      return (data || []) as Player[]
    },
    5 * 60_000
  )
}

export async function loadPlayerMap(supabase: Supa): Promise<Map<string, Player>> {
  return new Map((await loadPlayers(supabase)).map(p => [p.id, p]))
}

/** Fires for the given rounds; empty when the round_fires migration hasn't run yet. */
export async function loadFires(supabase: Supa, roundIds: string[]) {
  try {
    return await fetchByIds<{ round_id: string; player_id: string; session_id: string }>(
      supabase, 'round_fires', 'round_id, player_id, session_id', 'round_id', roundIds
    )
  } catch {
    return []
  }
}

/** Newest season first; seasons sharing a start date fall back to "Season 10" > "Season 2" name order. */
export function compareSeasonsDesc(a: Season, b: Season): number {
  return (
    b.start_date.localeCompare(a.start_date) ||
    b.name.localeCompare(a.name, 'de', { numeric: true }) ||
    b.created_at.localeCompare(a.created_at)
  )
}

function emptyStats(player: Player): PlayerStats {
  return {
    player,
    wins: 0,
    first_eliminations: 0,
    revivals: 0,
    revives_given: 0,
    final_appearances: 0,
    longest_streak: 0,
    rounds_played: 0,
    win_rate: 0,
    total_balance: 0,
    balance_history: [],
    peak_balance: 0,
    low_balance: 0,
    high_stake_score: 0,
    base_stake_wins: 0,
    fires: 0,
    first_bloods: 0,
    comebacks: 0,
  }
}

/**
 * The "simple round" stake. Rounds at or below it are the everyday rounds that
 * feed Kleinvieh; anything above counts towards High Roller. Kept as a constant
 * because `rounds.stake` stores absolute €, while the configurable base stake
 * only lives in localStorage (and has always been 3 € in practice).
 */
const BASE_STAKE = 3

type ScopeRound = {
  id: string
  session_id: string
  round_number: number
  winner_id: string | null
  started_at: string
  stake: number
  status: string
}

function roundIdsForScope(supabase: Supa, seasonId?: string | null): Promise<ScopeRound[]> {
  return memo(supabase, `rounds:${seasonId ?? 'all'}`, () => loadScopeRounds(supabase, seasonId))
}

async function loadScopeRounds(supabase: Supa, seasonId?: string | null): Promise<ScopeRound[]> {
  const select = 'id, session_id, round_number, winner_id, started_at, stake, status'
  let rounds: ScopeRound[]
  if (seasonId && seasonId !== 'all') {
    const { data: sessions } = await supabase.from('sessions').select('id').eq('season_id', seasonId)
    const sessionIds = (sessions || []).map(s => s.id)
    if (sessionIds.length === 0) return []
    rounds = await fetchByIds<ScopeRound>(supabase, 'rounds', select, 'session_id', sessionIds)
  } else {
    rounds = await fetchAll<ScopeRound>(supabase, 'rounds', select)
  }
  return rounds.filter(r => r.status === 'completed')
}

type ScopeRoundPlayer = {
  round_id: string
  player_id: string
  is_winner: boolean
  was_first_eliminated: boolean
  was_revived: boolean
  revives_given: number | null
  reached_final: boolean
  balance_change: number | null
}

/** Player rows of all completed rounds in scope (shared by key figures and player stats). */
function scopeRoundPlayers(supabase: Supa, seasonId: string | null | undefined, rounds: ScopeRound[]) {
  return memo(supabase, `rps:${seasonId ?? 'all'}`, () =>
    fetchByIds<ScopeRoundPlayer>(supabase, 'round_players', '*', 'round_id', rounds.map(r => r.id))
  )
}

function scopeFires(supabase: Supa, seasonId: string | null | undefined, rounds: ScopeRound[]) {
  return memo(supabase, `fires:${seasonId ?? 'all'}`, () => loadFires(supabase, rounds.map(r => r.id)))
}

/**
 * Key figures for the statistics header: real rounds played, sessions with at
 * least one real round, average stake, average players per round and fires within the scope.
 */
export async function computeScopeSummary(supabase: Supa, seasonId?: string | null): Promise<ScopeSummary> {
  const rounds = await roundIdsForScope(supabase, seasonId)
  const real = rounds.filter(r => r.round_number > 0)
  if (real.length === 0) return { rounds: 0, sessions: 0, avg_stake: 0, avg_players: 0, fires: 0 }
  const realIds = new Set(real.map(r => r.id))
  const [rps, allFires] = await Promise.all([
    scopeRoundPlayers(supabase, seasonId, rounds),
    scopeFires(supabase, seasonId, rounds),
  ])
  const seats = rps.filter(rp => realIds.has(rp.round_id)).length
  const fires = allFires.filter(f => realIds.has(f.round_id)).length
  return {
    rounds: real.length,
    sessions: new Set(real.map(r => r.session_id)).size,
    avg_stake: Math.round((real.reduce((a, r) => a + r.stake, 0) / real.length) * 10) / 10,
    avg_players: Math.round((seats / real.length) * 10) / 10,
    fires,
  }
}

/** Number of consecutive wins needed to be shown "on fire". */
export const ON_FIRE_STREAK = 3

/**
 * Current winning streak per player: how many of their own most recent
 * completed real rounds they won in a row (only players with a streak ≥ 1 are
 * returned). Counted over the player's rounds in chronological order regardless
 * of session or season boundaries, so sessions a player skipped don't break it.
 * 1 → golden ring, 2 → glowing golden ring, ON_FIRE_STREAK+ → ring of flames.
 */
export async function computeWinStreaks(supabase: Supa, playerIds: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>()
  if (playerIds.length === 0) return result
  const rows = await fetchByIds<{
    player_id: string
    is_winner: boolean
    round: { started_at: string; status: string; round_number: number } | null
  }>(supabase, 'round_players', 'id, player_id, is_winner, round:rounds(started_at, status, round_number)', 'player_id', playerIds)

  const byPlayer: Record<string, { at: number; won: boolean }[]> = {}
  for (const r of rows) {
    if (!r.round || r.round.status !== 'completed' || r.round.round_number <= 0) continue
    ;(byPlayer[r.player_id] ??= []).push({ at: new Date(r.round.started_at).getTime(), won: r.is_winner })
  }
  for (const [pid, list] of Object.entries(byPlayer)) {
    list.sort((a, b) => b.at - a.at) // newest first
    let streak = 0
    for (const x of list) {
      if (!x.won) break
      streak++
    }
    if (streak > 0) result.set(pid, streak)
  }
  return result
}

/**
 * Computes stats for all active players (or a given subset) within a season scope.
 * seasonId === undefined | 'all' => across all seasons.
 */
export async function computePlayerStats(
  supabase: Supa,
  opts: { seasonId?: string | null; playerIds?: string[] } = {}
): Promise<PlayerStats[]> {
  const [allPlayers, rounds] = await Promise.all([loadPlayers(supabase), roundIdsForScope(supabase, opts.seasonId)])
  const wanted = opts.playerIds ? new Set(opts.playerIds) : null
  const players = allPlayers.filter(p => (wanted ? wanted.has(p.id) : p.is_active))
  if (players.length === 0) return []

  const statsMap: Record<string, PlayerStats> = {}
  for (const p of players) statsMap[p.id] = emptyStats(p)

  // When scoped to a single season, only surface players who actually played
  // at least one real round in it (not every player who ever joined a session).
  const scoped = opts.seasonId != null && opts.seasonId !== 'all'
  const finalize = (list: PlayerStats[]) =>
    scoped ? list.filter(s => s.rounds_played >= 1) : list

  if (rounds.length === 0) return finalize(Object.values(statsMap))

  const roundMeta: Record<
    string,
    { round_number: number; winner_id: string | null; started_at: string; stake: number }
  > = {}
  for (const r of rounds) roundMeta[r.id] = r

  const [rps, fires] = await Promise.all([
    scopeRoundPlayers(supabase, opts.seasonId, rounds),
    scopeFires(supabase, opts.seasonId, rounds),
  ])

  for (const f of fires) {
    if (statsMap[f.player_id]) statsMap[f.player_id].fires++
  }

  // First Blood: once per session, to the winner of its first real round.
  const firstRoundBySession: Record<string, ScopeRound> = {}
  for (const r of rounds) {
    if (r.round_number <= 0) continue
    const cur = firstRoundBySession[r.session_id]
    if (!cur || r.round_number < cur.round_number) firstRoundBySession[r.session_id] = r
  }
  for (const r of Object.values(firstRoundBySession)) {
    if (r.winner_id && statsMap[r.winner_id]) statsMap[r.winner_id].first_bloods++
  }

  // Aggregate counters
  for (const rp of rps) {
    const s = statsMap[rp.player_id]
    if (!s) continue
    const meta = roundMeta[rp.round_id]
    const isReal = meta && meta.round_number > 0
    if (rp.is_winner) s.wins++
    if (rp.is_winner && isReal) {
      // A win is worth its stake, so one 15 € round outweighs several 3 € ones.
      if (meta.stake > BASE_STAKE) s.high_stake_score += meta.stake
      else s.base_stake_wins++
    }
    if (rp.was_first_eliminated) s.first_eliminations++
    if (rp.was_revived) s.revivals++
    // Aus dem Jenseits: knocked out, brought back, and went on to win the round.
    if (rp.was_revived && rp.is_winner && isReal) s.comebacks++
    s.revives_given += rp.revives_given ?? 0
    if (rp.reached_final) s.final_appearances++
    if (isReal) s.rounds_played++
    if (rp.balance_change != null) s.total_balance += rp.balance_change
  }

  // Per-player chronological pass: streaks + balance history
  const sortedRounds = [...rounds].sort(
    (a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
  )
  const byRoundPlayers: Record<string, Record<string, { is_winner: boolean; balance_change: number | null }>> = {}
  for (const rp of rps) {
    if (!byRoundPlayers[rp.round_id]) byRoundPlayers[rp.round_id] = {}
    byRoundPlayers[rp.round_id][rp.player_id] = {
      is_winner: rp.is_winner,
      balance_change: rp.balance_change,
    }
  }

  for (const p of players) {
    const s = statsMap[p.id]
    let cum = 0
    let cur = 0
    let longest = 0
    const history: number[] = []
    for (const r of sortedRounds) {
      const entry = byRoundPlayers[r.id]?.[p.id]
      if (!entry) continue
      if (entry.balance_change != null) cum += entry.balance_change
      history.push(cum)
      if (r.round_number > 0) {
        if (entry.is_winner) {
          cur++
          if (cur > longest) longest = cur
        } else {
          cur = 0
        }
      }
    }
    s.balance_history = history
    // Mario-Party-style: the best/worst standing ever held, not just the final one.
    s.peak_balance = history.length > 0 ? Math.max(...history) : 0
    s.low_balance = history.length > 0 ? Math.min(...history) : 0
    s.longest_streak = longest
    s.win_rate = s.rounds_played > 0 ? s.wins / s.rounds_played : 0
  }

  return finalize(Object.values(statsMap).sort((a, b) => b.total_balance - a.total_balance))
}

/**
 * Achievement definitions. Each is awarded (per scope, e.g. per season) to the
 * player(s) with the highest value for `pick`, provided the max reaches `min`.
 */
export const ACHIEVEMENTS: {
  icon: string
  label: string
  desc: string
  min: number
  pick: (s: PlayerStats) => number
  /** Show the achieved value (e.g. streak length) instead of how often it was earned. */
  showValue?: boolean
}[] = [
  { icon: '💰', label: 'Bonze', desc: 'Höchste Gesamtbilanz der Season', min: 1, pick: s => s.total_balance },
  { icon: '🌟', label: 'Münzstern', desc: 'Höchster Saldo, der in der Season je erreicht wurde', min: 1, pick: s => s.peak_balance },
  { icon: '💩', label: 'Kotstern', desc: 'Tiefster Saldo, der in der Season je erreicht wurde', min: 1, pick: s => -s.low_balance },
  { icon: '🎯', label: 'Stammgast', desc: 'Meiste gespielte Runden der Season', min: 1, pick: s => s.rounds_played },
  { icon: '🏆', label: 'Seriensieger', desc: 'Meiste Rundensiege der Season', min: 1, pick: s => s.wins },
  { icon: '🎲', label: 'High Roller', desc: `Höchster €-Wert gewonnener Runden über ${BASE_STAKE} € Einsatz`, min: 1, pick: s => s.high_stake_score },
  { icon: '🐜', label: 'Kleinvieh', desc: `Meiste gewonnene ${BASE_STAKE}-€-Runden der Season`, min: 1, pick: s => s.base_stake_wins },
  // ☄️ instead of 🔥: the flame stands for tracked "Feuer" (three aces) / Burning Man.
  { icon: '☄️', label: 'Hot Streak', desc: 'Längste Siegesserie der Season – meiste Siege am Stück', min: 1, pick: s => s.longest_streak, showValue: true },
  { icon: '🔥', label: 'Burning Man', desc: 'Meiste Feuer (drei Asse) der Season', min: 1, pick: s => s.fires },
  { icon: '🩸', label: 'First Blood', desc: 'Hat in der Season am häufigsten die erste Runde einer Session gewonnen', min: 1, pick: s => s.first_bloods },
  { icon: '👻', label: 'Aus dem Jenseits', desc: 'Am häufigsten ausgeschieden, wiederbelebt und dann die Runde gewonnen', min: 1, pick: s => s.comebacks },
  { icon: '🐦', label: 'Phönix', desc: 'In der Season am häufigsten wiederbelebt', min: 1, pick: s => s.revivals },
  { icon: '🚑', label: 'Medic', desc: 'Hat in der Season am häufigsten andere belebt', min: 1, pick: s => s.revives_given },
  { icon: '💀', label: 'Noob', desc: 'In der Season am häufigsten zuerst raus', min: 1, pick: s => s.first_eliminations },
]

/** Relative achievements across the given stat set. Awards to all tied leaders. */
export function deriveBadges(allStats: PlayerStats[]): Record<string, Badge[]> {
  const result: Record<string, Badge[]> = {}
  for (const s of allStats) result[s.player.id] = []

  for (const a of ACHIEVEMENTS) {
    let max = -Infinity
    for (const s of allStats) max = Math.max(max, a.pick(s))
    if (max < a.min) continue
    for (const s of allStats) {
      if (a.pick(s) === max) {
        result[s.player.id].push({ icon: a.icon, label: a.label, desc: a.desc, ...(a.showValue ? { value: max } : {}) })
      }
    }
  }

  return result
}

/**
 * Tally of achievements per player across all seasons: how many seasons each
 * player held each achievement. Achievements are scored independently per season.
 */
export async function computeSeasonAchievements(
  supabase: Supa
): Promise<Record<string, AchievementTally[]>> {
  const { data: seasons } = await supabase.from('seasons').select('id')
  const counts: Record<string, Record<string, number>> = {}
  const best: Record<string, Record<string, number>> = {}

  // Seasons are independent: compute them all at once instead of one after another.
  const perSeason = await Promise.all((seasons || []).map(season => computePlayerStats(supabase, { seasonId: season.id })))
  for (const stats of perSeason) {
    const badges = deriveBadges(stats)
    for (const [pid, list] of Object.entries(badges)) {
      for (const b of list) {
        if (!counts[pid]) counts[pid] = {}
        counts[pid][b.label] = (counts[pid][b.label] ?? 0) + 1
        if (b.value != null) {
          if (!best[pid]) best[pid] = {}
          best[pid][b.label] = Math.max(best[pid][b.label] ?? 0, b.value)
        }
      }
    }
  }

  const result: Record<string, AchievementTally[]> = {}
  for (const [pid, byLabel] of Object.entries(counts)) {
    result[pid] = ACHIEVEMENTS.filter(a => (byLabel[a.label] ?? 0) > 0).map(a => ({
      icon: a.icon,
      label: a.label,
      desc: a.desc,
      count: byLabel[a.label],
      ...(best[pid]?.[a.label] != null ? { value: best[pid][a.label] } : {}),
    }))
  }
  return result
}

/**
 * Scoreboard for a single session: € balance and wins per player over its
 * completed real rounds (the Saldovortrag round 0 is excluded). Shared by the
 * end-of-session flow and the season overview's session review.
 */
export async function computeSessionSummary(
  supabase: Supa,
  sessionId: string
): Promise<SessionSummary> {
  const { data: rounds } = await supabase
    .from('rounds')
    .select('id')
    .eq('session_id', sessionId)
    .eq('status', 'completed')
    .gt('round_number', 0)
  const roundIds = (rounds || []).map(r => r.id)
  if (roundIds.length === 0) return { rounds: 0, players: [] }

  const [rps, fires, players] = await Promise.all([
    fetchByIds<SummaryRoundPlayer>(supabase, 'round_players', SUMMARY_RP_SELECT, 'round_id', roundIds),
    loadFires(supabase, roundIds),
    loadPlayerMap(supabase),
  ])
  return buildSessionSummary(roundIds.length, rps, fires, players)
}

/** round_players columns needed by buildSessionSummary (players come from loadPlayerMap, not a join). */
export const SUMMARY_RP_SELECT = 'id, round_id, player_id, balance_change, is_winner'

export type SummaryRoundPlayer = {
  round_id: string
  player_id: string
  balance_change: number | null
  is_winner: boolean
}

/**
 * Pure scoreboard builder for one session from its real rounds' player rows,
 * so callers that already loaded the data (season overview) needn't refetch.
 */
export function buildSessionSummary(
  roundCount: number,
  rps: SummaryRoundPlayer[],
  fires: { player_id: string }[],
  players: Map<string, Player>
): SessionSummary {
  const map: Record<string, { player: Player; balance: number; wins: number; fires: number }> = {}
  for (const rp of rps) {
    const p = players.get(rp.player_id)
    if (!p) continue
    if (!map[rp.player_id]) map[rp.player_id] = { player: p, balance: 0, wins: 0, fires: 0 }
    if (rp.balance_change != null) map[rp.player_id].balance += rp.balance_change
    if (rp.is_winner) map[rp.player_id].wins++
  }
  for (const f of fires) if (map[f.player_id]) map[f.player_id].fires++
  return { rounds: roundCount, players: Object.values(map).sort((a, b) => b.balance - a.balance) }
}

/**
 * Cumulative balance per session (Spielabend) for one player, chronological.
 * Each point carries the net change that evening plus the running total,
 * so the progression can be labelled with concrete € amounts.
 */
export async function computeBalanceTimeline(
  supabase: Supa,
  playerId: string
): Promise<SessionBalancePoint[]> {
  const { data: rps } = await supabase
    .from('round_players')
    .select('round_id, balance_change')
    .eq('player_id', playerId)
  if (!rps || rps.length === 0) return []

  const changeByRound: Record<string, number> = {}
  for (const rp of rps) {
    if (rp.balance_change == null) continue
    changeByRound[rp.round_id] = (changeByRound[rp.round_id] ?? 0) + rp.balance_change
  }
  const roundIds = Object.keys(changeByRound)
  if (roundIds.length === 0) return []

  // Only completed rounds count towards the balance (matches computePlayerStats).
  const { data: rounds } = await supabase
    .from('rounds')
    .select('id, session_id')
    .in('id', roundIds)
    .eq('status', 'completed')

  const deltaBySession: Record<string, number> = {}
  for (const r of (rounds || []) as { id: string; session_id: string }[]) {
    deltaBySession[r.session_id] = (deltaBySession[r.session_id] ?? 0) + (changeByRound[r.id] ?? 0)
  }
  const sessionIds = Object.keys(deltaBySession)
  if (sessionIds.length === 0) return []

  const { data: sessions } = await supabase
    .from('sessions')
    .select('*')
    .in('id', sessionIds)
    .order('started_at', { ascending: true })

  let cum = 0
  const points: SessionBalancePoint[] = []
  for (const s of (sessions || []) as Session[]) {
    const delta = deltaBySession[s.id] ?? 0
    cum += delta
    points.push({ session: s, delta, cumulative: cum })
  }
  return points
}

/** Head-to-head record for one player across all completed real rounds. */
export async function computeHeadToHead(supabase: Supa, playerId: string): Promise<HeadToHead[]> {
  const { data: rounds } = await supabase
    .from('rounds')
    .select('id, round_number, winner_id')
    .eq('status', 'completed')
    .gt('round_number', 0)

  const realRoundIds = (rounds || []).map(r => r.id)
  if (realRoundIds.length === 0) return []
  const winnerByRound: Record<string, string | null> = {}
  for (const r of rounds || []) winnerByRound[r.id] = r.winner_id

  const { data: rps } = await supabase
    .from('round_players')
    .select('round_id, player_id')
    .in('round_id', realRoundIds)

  const participantsByRound: Record<string, string[]> = {}
  for (const rp of rps || []) {
    if (!participantsByRound[rp.round_id]) participantsByRound[rp.round_id] = []
    participantsByRound[rp.round_id].push(rp.player_id)
  }

  const acc: Record<string, { games: number; myWins: number; theirWins: number }> = {}
  for (const [roundId, parts] of Object.entries(participantsByRound)) {
    if (!parts.includes(playerId)) continue
    const winner = winnerByRound[roundId]
    for (const other of parts) {
      if (other === playerId) continue
      if (!acc[other]) acc[other] = { games: 0, myWins: 0, theirWins: 0 }
      acc[other].games++
      if (winner === playerId) acc[other].myWins++
      else if (winner === other) acc[other].theirWins++
    }
  }

  const otherIds = Object.keys(acc)
  if (otherIds.length === 0) return []
  const all = await loadPlayerMap(supabase)
  const playerMap: Record<string, Player> = {}
  for (const id of otherIds) {
    const p = all.get(id)
    if (p) playerMap[id] = p
  }

  return otherIds
    .filter(id => playerMap[id])
    .map(id => ({ opponent: playerMap[id], ...acc[id] }))
    .sort((a, b) => b.games - a.games)
}
