// Unit tests for lib/milestones.ts — run with `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findMilestones, isMilestone, applyRound, EMPTY_TOTALS, type PlayerTotals } from '../lib/milestones.ts'

const t = (over: Partial<PlayerTotals>): PlayerTotals => ({ ...EMPTY_TOTALS, ...over })
const kinds = (before: PlayerTotals, after: PlayerTotals) => findMilestones(before, after).map(m => `${m.kind}:${m.value}`)

test('Milestones: listed thresholds and "every 50" after the list', () => {
  for (const n of [10, 25, 50, 75, 100, 150, 200, 250]) assert.equal(isMilestone('wins', n), true, `wins ${n}`)
  for (const n of [1, 9, 11, 99, 101, 125, 175]) assert.equal(isMilestone('wins', n), false, `wins ${n}`)
  for (const n of [50, 100, 200, 300, 500, 750, 1000]) assert.equal(isMilestone('rounds', n), true, `rounds ${n}`)
  assert.equal(isMilestone('rounds', 600), false)
  // lists without "every" stop at their last value
  assert.equal(isMilestone('streak', 10), true)
  assert.equal(isMilestone('streak', 15), false)
  assert.equal(isMilestone('fires', 1), true)
})

test('Milestones: hit when the threshold is reached this round', () => {
  assert.deepEqual(kinds(t({ wins: 99 }), t({ wins: 100 })), ['wins:100'])
  assert.deepEqual(kinds(t({ wins: 100 }), t({ wins: 101 })), [])
  assert.deepEqual(kinds(t({ fires: 0 }), t({ fires: 1 })), ['fires:1'])
})

test('Milestones: counters that jump by 2 still hit the threshold in between', () => {
  assert.deepEqual(kinds(t({ fires: 4 }), t({ fires: 6 })), ['fires:5'])
})

test('Milestones: season balance crossed upwards and downwards', () => {
  assert.deepEqual(kinds(t({ balance: 40 }), t({ balance: 58 })), ['balance:50'])
  assert.deepEqual(kinds(t({ balance: 40 }), t({ balance: 120 })), ['balance:100']) // only the highest mark
  assert.deepEqual(kinds(t({ balance: -95 }), t({ balance: -101 })), ['balance:-100'])
  assert.deepEqual(kinds(t({ balance: 100 }), t({ balance: 110 })), []) // already above
  assert.deepEqual(kinds(t({ balance: -110 }), t({ balance: -90 })), []) // recovering isn't a milestone
})

test('Milestones: applyRound adds one round and resets the streak on a loss', () => {
  const won = applyRound(t({ wins: 9, streak: 4, rounds: 49 }), { won: true, firstOut: false, revived: false, revivesGiven: 0, fires: 0, balanceChange: 6 })
  assert.deepEqual([won.wins, won.streak, won.rounds, won.balance], [10, 5, 50, 6])
  const lost = applyRound(t({ streak: 4, firstOuts: 9 }), { won: false, firstOut: true, revived: true, revivesGiven: 1, fires: 1, balanceChange: -3 })
  assert.deepEqual([lost.streak, lost.firstOuts, lost.revived, lost.revivesGiven, lost.fires], [0, 10, 1, 1, 1])
})

test('Milestones: proud ones first, embarrassing last', () => {
  const before = t({ wins: 9, streak: 4, rounds: 49, firstOuts: 9 })
  const after = t({ wins: 10, streak: 5, rounds: 50, firstOuts: 10 })
  assert.deepEqual(kinds(before, after), ['wins:10', 'streak:5', 'rounds:50', 'firstOuts:10'])
})
