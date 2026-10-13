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

// ---------- Rain cloud (losing streak in a session) ----------

/** Rounds in a row without a win (within one session) from which a rain cloud hangs over the player. */
export const DRY_SPELL_MIN = 4

/**
 * Rounds in a row each player played without winning, over the completed rounds
 * of ONE session in chronological order: a win resets to 0, sitting a round out
 * keeps the count.
 */
export function computeDrySpells(rounds: NoobRound[]): Map<string, number> {
  const spells = new Map<string, number>()
  for (const r of rounds) {
    for (const p of r.participants) spells.set(p, p === r.winnerId ? 0 : (spells.get(p) ?? 0) + 1)
  }
  return spells
}

export function rainCloudIds(rounds: NoobRound[]): Set<string> {
  const ids = new Set<string>()
  for (const [p, n] of computeDrySpells(rounds)) if (n >= DRY_SPELL_MIN) ids.add(p)
  return ids
}

// ---------- Storm (round won with a stake of 3 € or more) ----------

export type StormLevel = {
  /** Applies from this stake (€) upwards. */
  minStake: number
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
 * Stake → storm intensity: one level per stake step (3, 6, 9, 12, 15, 18 €).
 * Stakes in between get the level below, everything above 18 € the top level.
 * Edit here to retune.
 */
export const STORM_LEVELS: StormLevel[] = [
  { minStake: 3, bolts: 1, durationMs: 600, darken: 0.15, flash: 0.22, flicker: false, rain: 0, shake: 0, clouds: false },
  { minStake: 6, bolts: 2, durationMs: 1600, darken: 0.25, flash: 0.3, flicker: false, rain: 0, shake: 0, clouds: false },
  { minStake: 9, bolts: 3, durationMs: 2600, darken: 0.38, flash: 0.36, flicker: false, rain: 0, shake: 0, clouds: false },
  { minStake: 12, bolts: 5, durationMs: 4000, darken: 0.52, flash: 0.42, flicker: true, rain: 30, shake: 0, clouds: true },
  { minStake: 15, bolts: 9, durationMs: 6000, darken: 0.68, flash: 0.48, flicker: true, rain: 75, shake: 0, clouds: true },
  // full thunderstorm; the shake stays gentle so the card remains readable
  { minStake: 18, bolts: 18, durationMs: 8000, darken: 0.82, flash: 0.55, flicker: true, rain: 130, shake: 3.5, clouds: true },
]

/** Storm for a won round's stake, or null below the first level (unchanged result screen). */
export function stormFor(stake: number): StormLevel | null {
  let level: StormLevel | null = null
  for (const l of STORM_LEVELS) if (stake >= l.minStake) level = l
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
