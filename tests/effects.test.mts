// Unit tests for lib/effects.ts — run with `npm test` (Node's built-in test runner, no packages).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isFirstBlood,
  computeNoobStreaks,
  noobSigns,
  computeDrySpells,
  rainCloudIds,
  DRY_SPELL_MIN,
  stormFor,
  possibleWin,
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

// ---------- Possible winnings → storm ----------

test('Possible winnings: stake × players − own stake', () => {
  assert.equal(possibleWin(3, 3), 6)
  assert.equal(possibleWin(6, 4), 18)
  assert.equal(possibleWin(21, 9), 168)
})

test('Storm: no lightning up to 10 € winnings', () => {
  assert.equal(stormFor(0), null)
  assert.equal(stormFor(6), null)
  assert.equal(stormFor(10), null)
})

test('Storm: one level per 10 € of winnings, full storm from 60 €', () => {
  const ranges: [number, number][] = [[11, 20], [21, 30], [31, 40], [41, 50], [51, 59]]
  assert.equal(STORM_LEVELS.length, ranges.length + 1)
  ranges.forEach(([lo, hi], i) => {
    assert.equal(stormFor(lo), STORM_LEVELS[i], `${lo} €`)
    assert.equal(stormFor(hi), STORM_LEVELS[i], `${hi} €`)
  })
  assert.equal(stormFor(60), STORM_LEVELS[5])
  assert.equal(stormFor(168), STORM_LEVELS[5])
})

test('Storm: every level is stronger than the one before', () => {
  for (let i = 1; i < STORM_LEVELS.length; i++) {
    const [a, b] = [STORM_LEVELS[i - 1], STORM_LEVELS[i]]
    assert.ok(b.minWin > a.minWin)
    assert.ok(b.bolts > a.bolts && b.darken > a.darken && b.flash > a.flash && b.durationMs > a.durationMs)
    assert.ok(b.rain >= a.rain)
  }
})

test('Storm: only the top level shakes, and only gently', () => {
  const top = stormFor(60)!
  assert.ok(top.shake > 0 && top.shake <= 4)
  assert.ok(STORM_LEVELS.slice(0, -1).every(l => l.shake === 0))
})

test('Storm: reduced motion keeps the effect but drops shake and flicker', () => {
  const soft = softenStorm(stormFor(60)!)
  assert.equal(soft.shake, 0)
  assert.equal(soft.flicker, false)
  assert.ok(soft.flash <= 0.2 && soft.bolts >= 1)
})

// ---------- Rain cloud ----------

test('Rain cloud: from 4 rounds in a row without a win, gone with the next win', () => {
  const lostBy = (w: string) => round(ABC, null, w)
  assert.equal(rainCloudIds([lostBy('b'), lostBy('b'), lostBy('b')]).has('a'), false)
  assert.equal(rainCloudIds([lostBy('b'), lostBy('b'), lostBy('b'), lostBy('c')]).has('a'), true)
  assert.equal(rainCloudIds([lostBy('b'), lostBy('b'), lostBy('b'), lostBy('c'), lostBy('a')]).has('a'), false)
})

test('Rain cloud: sitting a round out keeps the dry spell', () => {
  const s = computeDrySpells([round(ABC, null, 'b'), round(['b', 'c'], null, 'b'), round(ABC, null, 'c')])
  assert.equal(s.get('a'), 2)
  assert.equal(DRY_SPELL_MIN, 4)
})
