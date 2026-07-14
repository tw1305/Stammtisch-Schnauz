import type { SupabaseClient } from '@supabase/supabase-js'
import type { Player, PlayerStats, Badge, HeadToHead, Session, SessionBalancePoint, AchievementTally } from '@/types/database'

type Supa = SupabaseClient

function emptyStats(player: Player): PlayerStats {
  return {
    player,
    wins: 0,
    first_eliminations: 0,
    revivals: 0,
    revives_given: 0,
    final_appearances: 0,
    win_streak: 0,
    longest_streak: 0,
    rounds_played: 0,
    win_rate: 0,
    total_balance: 0,
    balance_history: [],
  }
}

async function roundIdsForScope(supabase: Supa, seasonId?: string | null) {
  let query = supabase
    .from('rounds')
    .select('id, round_number, winner_id, started_at')
    .eq('status', 'completed')

  if (seasonId && seasonId !== 'all') {
    const { data: sessions } = await supabase.from('sessions').select('id').eq('season_id', seasonId)
    const sessionIds = (sessions || []).map(s => s.id)
    if (sessionIds.length === 0) return []
    query = query.in('session_id', sessionIds)
  }

  const { data } = await query
  return (data || []) as { id: string; round_number: number; winner_id: string | null; started_at: string }[]
}

/**
 * Computes stats for all active players (or a given subset) within a season scope.
 * seasonId === undefined | 'all' => across all seasons.
 */
export async function computePlayerStats(
  supabase: Supa,
  opts: { seasonId?: string | null; playerIds?: string[] } = {}
): Promise<PlayerStats[]> {
  let pq = supabase.from('players').select('*').order('name')
  if (opts.playerIds) pq = pq.in('id', opts.playerIds)
  else pq = pq.eq('is_active', true)
  const { data: players } = await pq
  if (!players || players.length === 0) return []

  const rounds = await roundIdsForScope(supabase, opts.seasonId)
  const statsMap: Record<string, PlayerStats> = {}
  for (const p of players) statsMap[p.id] = emptyStats(p)

  // When scoped to a single season, only surface players who actually played
  // at least one real round in it (not every player who ever joined a session).
  const scoped = opts.seasonId != null && opts.seasonId !== 'all'
  const finalize = (list: PlayerStats[]) =>
    scoped ? list.filter(s => s.rounds_played >= 1) : list

  if (rounds.length === 0) return finalize(Object.values(statsMap))

  const roundMeta: Record<string, { round_number: number; winner_id: string | null; started_at: string }> = {}
  for (const r of rounds) roundMeta[r.id] = r
  const roundIds = rounds.map(r => r.id)

  const { data: rps } = await supabase
    .from('round_players')
    .select('*')
    .in('round_id', roundIds)

  // Aggregate counters
  for (const rp of rps || []) {
    const s = statsMap[rp.player_id]
    if (!s) continue
    const meta = roundMeta[rp.round_id]
    const isReal = meta && meta.round_number > 0
    if (rp.is_winner) s.wins++
    if (rp.was_first_eliminated) s.first_eliminations++
    if (rp.was_revived) s.revivals++
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
  for (const rp of rps || []) {
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
    s.longest_streak = longest
    s.win_streak = cur // trailing streak over participated real rounds
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
}[] = [
  { icon: '💰', label: 'Krösus', desc: 'Höchste Gesamtbilanz der Season', min: 1, pick: s => s.total_balance },
  { icon: '🎯', label: 'Stammgast', desc: 'Meiste gespielte Runden der Season', min: 1, pick: s => s.rounds_played },
  { icon: '🏆', label: 'Seriensieger', desc: 'Meiste Rundensiege der Season', min: 1, pick: s => s.wins },
  { icon: '🔥', label: 'Heißlauf', desc: 'Längste Siegesserie der Season (≥3)', min: 3, pick: s => s.longest_streak },
  { icon: '🐦', label: 'Phönix', desc: 'In der Season am häufigsten wiederbelebt', min: 1, pick: s => s.revivals },
  { icon: '🤝', label: 'Lebensretter', desc: 'Hat in der Season am häufigsten andere belebt', min: 1, pick: s => s.revives_given },
  { icon: '💀', label: 'Pechvogel', desc: 'In der Season am häufigsten zuerst raus', min: 1, pick: s => s.first_eliminations },
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
      if (a.pick(s) === max) result[s.player.id].push({ icon: a.icon, label: a.label, desc: a.desc })
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

  for (const season of seasons || []) {
    const stats = await computePlayerStats(supabase, { seasonId: season.id })
    const badges = deriveBadges(stats)
    for (const [pid, list] of Object.entries(badges)) {
      for (const b of list) {
        if (!counts[pid]) counts[pid] = {}
        counts[pid][b.label] = (counts[pid][b.label] ?? 0) + 1
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
    }))
  }
  return result
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
  const { data: players } = await supabase.from('players').select('*').in('id', otherIds)
  const playerMap: Record<string, Player> = {}
  for (const p of players || []) playerMap[p.id] = p as Player

  return otherIds
    .filter(id => playerMap[id])
    .map(id => ({ opponent: playerMap[id], ...acc[id] }))
    .sort((a, b) => b.games - a.games)
}
