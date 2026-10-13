/**
 * Milestones celebrated on the round result screen ("100. Sieg!").
 *
 * Pure functions + configuration only (no imports), unit-tested in
 * tests/milestones.test.mts. All counters are all-time over real rounds
 * (the Saldovortrag round 0 doesn't count); the balance is the season balance.
 */

/** A player's totals before or after a round. */
export type PlayerTotals = {
  wins: number
  /** Current winning streak (consecutive wins). */
  streak: number
  rounds: number
  fires: number
  /** Times this player was revived. */
  revived: number
  /** Times this player revived someone else. */
  revivesGiven: number
  /** Times this player was out first. */
  firstOuts: number
  /** Season balance in €. */
  balance: number
}

export type CountKind = Exclude<keyof PlayerTotals, 'balance'>
export type MilestoneKind = keyof PlayerTotals

export type Milestone = { kind: MilestoneKind; value: number; icon: string; label: string }

/** Thresholds per counter: the listed values, then every `every` after the last one. Edit here to retune. */
export const MILESTONE_STEPS: Record<CountKind, { list: number[]; every?: number }> = {
  wins: { list: [10, 25, 50, 75, 100], every: 50 },
  streak: { list: [5, 7, 10] },
  rounds: { list: [50, 100, 200, 300, 500], every: 250 },
  fires: { list: [1, 5, 10, 25, 50] },
  revived: { list: [10, 25, 50] },
  revivesGiven: { list: [10, 25, 50] },
  firstOuts: { list: [10, 25, 50, 100] },
}

/** Season balance marks in €, celebrated (or mourned) when crossed upwards / downwards. */
export const BALANCE_STEPS = [50, 100, 200]

const ICONS: Record<MilestoneKind, string> = {
  wins: '🏆',
  streak: '☄️',
  rounds: '🎯',
  fires: '🔥',
  revived: '💉',
  revivesGiven: '🚑',
  firstOuts: '💀',
  balance: '💰',
}

/** Order on screen: the proud ones first, the embarrassing ones last. */
const ORDER: MilestoneKind[] = ['wins', 'streak', 'balance', 'fires', 'rounds', 'revivesGiven', 'revived', 'firstOuts']

export function isMilestone(kind: CountKind, n: number): boolean {
  const { list, every } = MILESTONE_STEPS[kind]
  if (list.includes(n)) return true
  const last = list[list.length - 1]
  return !!every && n > last && (n - last) % every === 0
}

function label(kind: MilestoneKind, n: number): string {
  switch (kind) {
    case 'wins':
      return `${n}. Sieg!`
    case 'streak':
      return `${n} Siege am Stück – unaufhaltsam!`
    case 'rounds':
      return `${n}. Runde`
    case 'fires':
      return n === 1 ? 'Erstes Feuer!' : `${n}. Feuer`
    case 'revived':
      return `Phönix-Jubiläum: ${n} Mal wiederbelebt`
    case 'revivesGiven':
      return `${n}. Rettung`
    case 'firstOuts':
      return `${n}. Mal Erster raus`
    case 'balance':
      return n > 0 ? `knackt +${n} € in der Season` : `rutscht unter −${Math.abs(n)} € in der Season`
  }
}

/**
 * Milestones reached by going from `before` to `after` (one round). A counter
 * hits a milestone when it passes a threshold (before < t ≤ after); the season
 * balance when it crosses +t upwards or −t downwards. Only the highest crossed
 * balance mark per direction is reported.
 */
export function findMilestones(before: PlayerTotals, after: PlayerTotals): Milestone[] {
  const out: Milestone[] = []
  for (const kind of Object.keys(MILESTONE_STEPS) as CountKind[]) {
    for (let n = before[kind] + 1; n <= after[kind]; n++) {
      if (isMilestone(kind, n)) out.push({ kind, value: n, icon: ICONS[kind], label: label(kind, n) })
    }
  }
  const up = BALANCE_STEPS.filter(t => before.balance < t && after.balance >= t).pop()
  if (up != null) out.push({ kind: 'balance', value: up, icon: '📈', label: label('balance', up) })
  const down = BALANCE_STEPS.filter(t => before.balance > -t && after.balance <= -t).pop()
  if (down != null) out.push({ kind: 'balance', value: -down, icon: '📉', label: label('balance', -down) })
  return out.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))
}

export const EMPTY_TOTALS: PlayerTotals = {
  wins: 0, streak: 0, rounds: 0, fires: 0, revived: 0, revivesGiven: 0, firstOuts: 0, balance: 0,
}

/** What one round adds to a player's totals. */
export type RoundContribution = {
  won: boolean
  firstOut: boolean
  revived: boolean
  revivesGiven: number
  fires: number
  balanceChange: number
}

export function applyRound(t: PlayerTotals, r: RoundContribution): PlayerTotals {
  return {
    wins: t.wins + (r.won ? 1 : 0),
    streak: r.won ? t.streak + 1 : 0,
    rounds: t.rounds + 1,
    fires: t.fires + r.fires,
    revived: t.revived + (r.revived ? 1 : 0),
    revivesGiven: t.revivesGiven + r.revivesGiven,
    firstOuts: t.firstOuts + (r.firstOut ? 1 : 0),
    balance: t.balance + r.balanceChange,
  }
}

/** One player's milestones of a round (for the result screen). */
export type PlayerMilestones = { playerId: string; name: string; items: Milestone[] }

/** Text with the player's name: "Domi: 100. Runde", "Tom knackt +100 € in der Season". */
export function milestoneText(m: Milestone, name?: string): string {
  if (m.kind === 'balance') return name ? `${name} ${m.label}` : m.label.replace(/^\w/, c => c.toUpperCase())
  return name ? `${name}: ${m.label}` : m.label
}
