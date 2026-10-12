export type Player = {
  id: string
  name: string
  avatar_url: string | null
  is_active: boolean
  created_at: string
  birthday?: string | null // "DD.MM" (day + month only), null when unset
}

export type Season = {
  id: string
  name: string
  start_date: string
  end_date: string | null
  status: 'active' | 'completed'
  created_at: string
}

export type Session = {
  id: string
  season_id: string
  created_by: string
  started_at: string
  ended_at: string | null
  status: 'active' | 'completed'
  dealer_player_id?: string | null
}

export type SessionPlayer = {
  id: string
  session_id: string
  player_id: string
  joined_at: string
  removed_at: string | null
  seat_order?: number | null
  player?: Player
}

export type Round = {
  id: string
  session_id: string
  round_number: number
  stake: number
  player_count: number
  winner_id: string | null
  started_at: string
  ended_at: string | null
  status: 'active' | 'completed'
}

export type RoundPlayer = {
  id: string
  round_id: string
  player_id: string
  is_active: boolean
  was_revived: boolean
  was_first_eliminated: boolean
  reached_final: boolean
  is_winner: boolean
  balance_change: number | null
  revives_given: number
  player?: Player
}

/** A "Feuer" (three aces) a player had during a round. */
export type RoundFire = {
  id: string
  round_id: string
  session_id: string
  player_id: string
  created_at: string
}

/** One paragraph (§) of the house rules. */
export type Rule = {
  id: string
  section: string // topic / Abschnitt
  title: string
  body: string
  sort_order: number
  created_at: string
  updated_at: string
  deleted_at: string | null
}

/** Aggregate key figures for the selected statistics scope (one season or all). */
export type ScopeSummary = {
  rounds: number
  sessions: number
  avg_stake: number
  avg_players: number
  fires: number
}

export type AppSettings = {
  id: string
  user_id: string
  default_stake: number
  updated_at: string
}

export type PlayerStats = {
  player: Player
  wins: number
  first_eliminations: number
  revivals: number
  revives_given: number
  final_appearances: number
  longest_streak: number // longest run of consecutive round wins in scope (Hot Streak)
  rounds_played: number
  win_rate: number // 0..1
  total_balance: number
  balance_history: number[] // cumulative balance over completed rounds (chronological)
  peak_balance: number // best cumulative balance ever reached in scope (Münzstern)
  low_balance: number // worst cumulative balance ever reached in scope (Kotstern)
  high_stake_score: number // € summed over won rounds above the base stake (High Roller)
  base_stake_wins: number // won rounds at the base stake (Kleinvieh)
  fires: number // tracked "Feuer" (three aces) in scope
  first_bloods: number // sessions in which this player won the first round (First Blood)
  comebacks: number // rounds won after being eliminated and revived (Aus dem Jenseits)
}

export type Badge = {
  icon: string
  label: string
  desc: string
  /** Set for achievements measured by a length rather than a count (Hot Streak: wins in a row). */
  value?: number
}

/** Per-session scoreboard, shown when a session ends and when reviewing it later. */
export type SessionSummary = {
  rounds: number
  players: { player: Player; balance: number; wins: number; fires: number }[]
}

export type HeadToHead = {
  opponent: Player
  games: number
  myWins: number
  theirWins: number
}

export type SessionBalancePoint = {
  session: Session
  delta: number // net € change during this session
  cumulative: number // running total after this session
}

export type AchievementTally = {
  icon: string
  label: string
  desc: string
  count: number // how many seasons this achievement was earned
  value?: number // best value across those seasons, for value-type achievements (Hot Streak length)
}

export type DebtSettlement = {
  from: Player
  to: Player
  amount: number
}
