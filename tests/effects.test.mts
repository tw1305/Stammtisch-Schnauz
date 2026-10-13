// Unit tests for lib/effects.ts — run with `npm test` (Node's built-in test runner, no packages).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isFirstBlood,
  computeNoobStreaks,
  noobSigns,
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

// ---------- Stake → storm ----------

test('Storm: nothing below 3 €', () => {
  assert.equal(stormFor(0), null)
  assert.equal(stormFor(2), null)
})

test('Storm: one level per stake step 3, 6, 9, 12, 15, 18 €', () => {
  const steps = [3, 6, 9, 12, 15, 18]
  assert.equal(STORM_LEVELS.length, steps.length)
  steps.forEach((stake, i) => assert.equal(stormFor(stake), STORM_LEVELS[i]))
  // stakes in between keep the level below, above 18 € stays at the top
  assert.equal(stormFor(5), STORM_LEVELS[0])
  assert.equal(stormFor(14), STORM_LEVELS[3])
  assert.equal(stormFor(21), STORM_LEVELS[5])
  assert.equal(stormFor(100), STORM_LEVELS[5])
})

test('Storm: every level is stronger than the one before', () => {
  for (let i = 1; i < STORM_LEVELS.length; i++) {
    const [a, b] = [STORM_LEVELS[i - 1], STORM_LEVELS[i]]
    assert.ok(b.minStake > a.minStake)
    assert.ok(b.bolts > a.bolts && b.darken > a.darken && b.flash > a.flash && b.durationMs > a.durationMs)
    assert.ok(b.rain >= a.rain)
  }
})

test('Storm: only the top level shakes, and only gently', () => {
  const top = stormFor(18)!
  assert.ok(top.shake > 0 && top.shake <= 4)
  assert.ok(STORM_LEVELS.slice(0, -1).every(l => l.shake === 0))
})

test('Storm: reduced motion keeps the effect but drops shake and flicker', () => {
  const soft = softenStorm(stormFor(18)!)
  assert.equal(soft.shake, 0)
  assert.equal(soft.flicker, false)
  assert.ok(soft.flash <= 0.2 && soft.bolts >= 1)
})
