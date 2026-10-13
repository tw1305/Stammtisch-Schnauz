// Unit tests for lib/effects.ts — run with `npm test` (Node's built-in test runner, no packages).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isFirstBlood,
  computeNoobStreaks,
  noobSigns,
  potTierIndex,
  POT_TIERS,
  stormFor,
  softenStorm,
  STORM_LEVELS,
  type NoobRound,
} from '../lib/effects.ts'

// ---------- First Blood ----------

test('First Blood: first real round of the session', () => {
  const rounds = [
    { id: 'r1', round_number: 1, status: 'completed' },
    { id: 'r2', round_number: 2, status: 'active' },
  ]
  assert.equal(isFirstBlood(rounds, 'r1'), true)
  assert.equal(isFirstBlood(rounds, 'r2'), false)
})

test('First Blood: the round itself counts even before its status is saved', () => {
  assert.equal(isFirstBlood([{ id: 'r1', round_number: 1, status: 'active' }], 'r1'), true)
})

test('First Blood: carry-over round 0 is ignored', () => {
  const rounds = [
    { id: 'carry', round_number: 0, status: 'completed' },
    { id: 'r1', round_number: 1, status: 'completed' },
  ]
  assert.equal(isFirstBlood(rounds, 'r1'), true)
  assert.equal(isFirstBlood(rounds, 'carry'), false)
})

test('First Blood: later rounds never qualify', () => {
  const rounds = [
    { id: 'r1', round_number: 1, status: 'completed' },
    { id: 'r2', round_number: 2, status: 'completed' },
    { id: 'r3', round_number: 3, status: 'completed' },
  ]
  assert.equal(isFirstBlood(rounds, 'r3'), false)
})

// ---------- Noob counter ----------

const round = (participants: string[], firstOut: string | string[] | null, winnerId: string | null = null): NoobRound => ({
  participants,
  firstOut: firstOut == null ? [] : Array.isArray(firstOut) ? firstOut : [firstOut],
  winnerId,
})
const ABC = ['a', 'b', 'c']

test('Noob: counts consecutive first-outs', () => {
  const s = computeNoobStreaks([round(ABC, 'a'), round(ABC, 'a'), round(ABC, 'a')])
  assert.equal(s.get('a'), 3)
  assert.equal(s.get('b'), 0)
})

test('Noob: reset as soon as the player is not first out', () => {
  const s = computeNoobStreaks([round(ABC, 'a'), round(ABC, 'a'), round(ABC, 'b')])
  assert.equal(s.get('a'), 0)
  assert.equal(s.get('b'), 1)
})

test('Noob: first out but revived and won → no Noob round', () => {
  const s = computeNoobStreaks([round(ABC, 'a'), round(ABC, 'a', 'a')])
  assert.equal(s.get('a'), 0)
})

test('Noob: sitting a round out keeps the counter', () => {
  const s = computeNoobStreaks([round(ABC, 'a'), round(['b', 'c'], 'b'), round(ABC, 'a')])
  assert.equal(s.get('a'), 2)
})

test('Noob: several flagged players all count', () => {
  const s = computeNoobStreaks([round(ABC, ['a', 'b']), round(ABC, ['a', 'b'])])
  assert.equal(s.get('a'), 2)
  assert.equal(s.get('b'), 2)
})

test('Noob signs: drop in at the start of the round after the 2nd first-out', () => {
  const done = [round(ABC, 'a'), round(ABC, 'a')]
  // between round 2 and 3: not yet visible
  assert.deepEqual(noobSigns(done, false), { shown: [], entering: [], leaving: [] })
  // round 3 starts: the sign falls
  assert.deepEqual(noobSigns(done, true), { shown: ['a'], entering: ['a'], leaving: [] })
})

test('Noob signs: stay without a new drop while still first out', () => {
  const done = [round(ABC, 'a'), round(ABC, 'a'), round(ABC, 'a')]
  assert.deepEqual(noobSigns(done, false), { shown: ['a'], entering: [], leaving: [] })
  assert.deepEqual(noobSigns(done, true), { shown: ['a'], entering: [], leaving: [] })
})

test('Noob signs: vanish at the start of the round after not being first out', () => {
  const done = [round(ABC, 'a'), round(ABC, 'a'), round(ABC, 'b')]
  // still shown between rounds (the round with the sign just ended)
  assert.deepEqual(noobSigns(done, false), { shown: ['a'], entering: [], leaving: [] })
  // next round: the sign leaves, counter is back at 0
  assert.deepEqual(noobSigns(done, true), { shown: [], entering: [], leaving: ['a'] })
  assert.equal(computeNoobStreaks(done).get('a'), 0)
})

test('Noob signs: a new session (no rounds) starts clean', () => {
  assert.deepEqual(noobSigns([], true), { shown: [], entering: [], leaving: [] })
  assert.deepEqual(noobSigns([], false), { shown: [], entering: [], leaving: [] })
})

// ---------- Gold pile ----------

test('Gold pile: tiers grow with the possible winnings and are capped', () => {
  assert.equal(potTierIndex(0), 0)
  assert.equal(potTierIndex(5), 0)
  assert.equal(potTierIndex(9), 1) // 3 players × 3 €
  assert.equal(potTierIndex(12), 2)
  assert.equal(potTierIndex(10000), POT_TIERS.length - 1)
  for (let i = 1; i < POT_TIERS.length; i++) {
    assert.ok(POT_TIERS[i].min > POT_TIERS[i - 1].min)
    assert.ok(POT_TIERS[i].width > POT_TIERS[i - 1].width)
    assert.ok(POT_TIERS[i].coins > POT_TIERS[i - 1].coins)
  }
})

// ---------- Stake → storm ----------

test('Storm: nothing at or below the standard stake', () => {
  assert.equal(stormFor(3, 3), null)
  assert.equal(stormFor(2, 3), null)
  assert.equal(stormFor(5, 0), null)
})

test('Storm: intensity grows with the stake (3 € standard)', () => {
  assert.equal(stormFor(4, 3)?.bolts, 1) // just above standard
  assert.equal(stormFor(6, 3)?.bolts, 2)
  assert.equal(stormFor(9, 3)?.bolts, 3)
  const mid = stormFor(12, 3)!
  assert.ok(mid.flicker && mid.darken >= 0.5 && mid.bolts > 3)
  const storm = stormFor(18, 3)!
  assert.ok(storm.rain > 0 && storm.shake > 0 && storm.bolts >= 10)
  assert.equal(stormFor(21, 3), storm)
  assert.equal(stormFor(100, 3), storm)
})

test('Storm: levels are monotonic', () => {
  for (let i = 1; i < STORM_LEVELS.length; i++) {
    const [a, b] = [STORM_LEVELS[i - 1], STORM_LEVELS[i]]
    assert.ok(b.minRatio > a.minRatio)
    assert.ok(b.bolts > a.bolts && b.darken > a.darken && b.flash >= a.flash)
  }
})

test('Storm: relative to the configured standard stake', () => {
  assert.equal(stormFor(12, 2), stormFor(18, 3)) // 6× standard either way
})

test('Storm: reduced motion keeps the effect but drops shake and flicker', () => {
  const soft = softenStorm(stormFor(18, 3)!)
  assert.equal(soft.shake, 0)
  assert.equal(soft.flicker, false)
  assert.ok(soft.flash <= 0.2 && soft.bolts >= 1)
})
