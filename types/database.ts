export type Player = {
  id: string
  name: string
  avatar_url: string | null
  is_active: boolean
  created_at: string
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
  win_streak: number
  longest_streak: number
  rounds_played: number
  win_rate: number // 0..1
  total_balance: number
  balance_history: number[] // cumulative balance over completed rounds (chronological)
}

export type Badge = {
  icon: string
  label: string
  desc: string
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
}

export type DebtSettlement = {
  from: Player
  to: Player
  amount: number
}
