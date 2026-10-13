/**
 * Game-effect rules: First Blood, Noob sign, gold pile and the high-stake storm.
 *
 * Pure functions + configuration only (no imports), so they can be unit-tested
 * with `npm test` (node --test) and tuned in one place.
 */

// ---------- First Blood ----------

export type SessionRoundRef = { id: string; round_number: number; status: string }

/**
 * Whether `roundId` is the first real round of its session (round 0 is the
 * "Saldovortrag" carry-over). Same rule as the First-Blood achievement in stats.
 * Pass all rounds of the session; the round itself counts as completed.
 */
export function isFirstBlood(sessionRounds: SessionRoundRef[], roundId: string): boolean {
  let first: SessionRoundRef | null = null
  for (const r of sessionRounds) {
    if (r.round_number <= 0) continue
    if (r.id !== roundId && r.status !== 'completed') continue
    if (!first || r.round_number < first.round_number) first = r
  }
  return first?.id === roundId
}

// ---------- Noob sign ----------

/** Consecutive first-outs in a session from which a player gets the "Noob" sign. */
export const NOOB_THRESHOLD = 2

/** One completed round, as far as the Noob counter is concerned. */
export type NoobRound = {
  /** Everyone who played the round. */
  participants: string[]
  /** Players flagged `was_first_eliminated` (the app sets at most one per round). */
  firstOut: string[]
  winnerId: string | null
}

/**
 * Consecutive "first out" count per player, over the completed rounds of ONE
 * session in chronological order (a new session starts from zero).
 *  - first out → +1 (several flagged players would all count),
 *  - first out but revived and won the round anyway → not a Noob round, reset,
 *  - played and not first out → reset to 0,
 *  - sat the round out → unchanged.
 */
export function computeNoobStreaks(rounds: NoobRound[]): Map<string, number> {
  const streaks = new Map<string, number>()
  for (const r of rounds) {
    for (const p of r.participants) {
      const out = r.firstOut.includes(p) && p !== r.winnerId
      streaks.set(p, out ? (streaks.get(p) ?? 0) + 1 : 0)
    }
  }
  return streaks
}

export function noobIds(rounds: NoobRound[]): Set<string> {
  const ids = new Set<string>()
  for (const [p, n] of computeNoobStreaks(rounds)) if (n >= NOOB_THRESHOLD) ids.add(p)
  return ids
}

export type NoobSigns = {
  /** Signs on the table. */
  shown: string[]
  /** Of those: signs that drop in at the start of this round. */
  entering: string[]
  /** Signs that tip over and vanish at the start of this round (no longer Noob). */
  leaving: string[]
}

/**
 * Signs only change when a round starts: during a round they reflect all rounds
 * completed before it. Between rounds the table keeps the signs of the round
 * just played (the last result is applied when the next round starts).
 *
 * @param completed completed rounds of the session, chronological
 * @param roundActive whether a round is being played right now
 */
export function noobSigns(completed: NoobRound[], roundActive: boolean): NoobSigns {
  const upTo = roundActive ? completed : completed.slice(0, -1)
  const now = noobIds(upTo)
  if (!roundActive) return { shown: [...now], entering: [], leaving: [] }
  const before = noobIds(upTo.slice(0, -1))
  return {
    shown: [...now],
    entering: [...now].filter(p => !before.has(p)),
    leaving: [...before].filter(p => !now.has(p)),
  }
}

// ---------- Gold pile (possible winnings) ----------

export type PotTier = {
  /** Lowest possible winnings (€ = stake × players at the start) for this tier. */
  min: number
  coins: number
  bars: number
  gems: number
  crown: boolean
  /** Pile width as a share of the table scene's width. */
  width: number
}

/**
 * Thresholds double from tier to tier (logarithmic), so a few euros already make
 * a decent heap while 200 € tops out as an absurd treasure without breaking the
 * layout. Typical: 3 × 3 € = 9 € → tier 1, 5 × 9 € = 45 € → tier 3, 9 × 21 € → tier 5.
 */
export const POT_TIERS: PotTier[] = [
  { min: 0, coins: 10, bars: 0, gems: 0, crown: false, width: 0.2 },
  { min: 6, coins: 15, bars: 0, gems: 0, crown: false, width: 0.23 },
  { min: 12, coins: 21, bars: 1, gems: 0, crown: false, width: 0.26 },
  { min: 24, coins: 30, bars: 2, gems: 1, crown: false, width: 0.29 },
  { min: 48, coins: 40, bars: 3, gems: 2, crown: false, width: 0.32 },
  { min: 96, coins: 52, bars: 4, gems: 3, crown: true, width: 0.355 },
  { min: 192, coins: 66, bars: 6, gems: 4, crown: true, width: 0.39 },
]

export function potTierIndex(pot: number): number {
  let i = 0
  for (let k = 0; k < POT_TIERS.length; k++) if (pot >= POT_TIERS[k].min) i = k
  return i
}

// ---------- Storm (round won above the standard stake) ----------

export type StormLevel = {
  /** Applies from stake ÷ standard stake ≥ minRatio (level 1: strictly above 1). */
  minRatio: number
  /** Lightning strikes over the whole storm. */
  bolts: number
  /** How long strikes keep coming (ms); the first one hits right away. */
  durationMs: number
  /** Darkening of the sky behind the card, 0..1. */
  darken: number
  /** Peak opacity of the full-screen flash per strike, 0..1. */
  flash: number
  /** Extra quick flashes after a strike (screen flicker). */
  flicker: boolean
  /** Raindrops on screen at once (0 = dry). */
  rain: number
  /** Screen shake per strike in px (0 = none). */
  shake: number
  /** Brooding storm clouds drifting at the top. */
  clouds: boolean
}

/**
 * Stake → storm intensity, relative to the configured standard stake (€ values
 * in the comments for the usual 3 € standard). Edit here to retune.
 */
export const STORM_LEVELS: StormLevel[] = [
  // just above the standard (e.g. 4–5 €): a single bolt
  { minRatio: 1, bolts: 1, durationMs: 600, darken: 0.18, flash: 0.25, flicker: false, rain: 0, shake: 0, clouds: false },
  // Double (6 €)
  { minRatio: 2, bolts: 2, durationMs: 1800, darken: 0.28, flash: 0.32, flicker: false, rain: 0, shake: 0, clouds: false },
  // Triple (9 €): 2–3 bolts
  { minRatio: 3, bolts: 3, durationMs: 2600, darken: 0.4, flash: 0.38, flicker: false, rain: 0, shake: 0, clouds: false },
  // Quattro / Quinto (12–15 €): more bolts, dark sky, flicker
  { minRatio: 4, bolts: 6, durationMs: 4500, darken: 0.6, flash: 0.45, flicker: true, rain: 40, shake: 0, clouds: true },
  // from Sesto (18 €): full thunderstorm
  { minRatio: 6, bolts: 18, durationMs: 8000, darken: 0.82, flash: 0.55, flicker: true, rain: 130, shake: 6, clouds: true },
]

/** Storm for a won round, or null at/below the standard stake (unchanged result screen). */
export function stormFor(stake: number, standardStake: number): StormLevel | null {
  if (!(standardStake > 0) || !(stake > standardStake)) return null
  const ratio = stake / standardStake
  let level: StormLevel | null = null
  for (const l of STORM_LEVELS) if (ratio >= l.minRatio) level = l // ratio > 1 is guaranteed above
  return level
}

/** Milder version for "reduce motion": no shake, no flicker, softer flashes, less rain. */
export function softenStorm(l: StormLevel): StormLevel {
  return {
    ...l,
    bolts: Math.max(1, Math.ceil(l.bolts / 3)),
    flash: Math.min(l.flash, 0.18),
    flicker: false,
    rain: Math.round(l.rain / 3),
    shake: 0,
  }
}
