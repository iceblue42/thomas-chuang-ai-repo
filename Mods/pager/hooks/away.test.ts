import { expect, test } from 'claude-code/testing'

import { MAX_STEPS, awayState, capFor, isRealUser, prune, shouldPush, takeStep, type Cap } from './away'

const MIN = 60_000
const NOW = 1_000_000_000

test('real user prompts: the person\'s origins, minus mod markers', () => {
  expect(isRealUser({ kind: 'composer' }, 'where are we at?')).toBe(true)
  expect(isRealUser({ kind: 'bridge' }, 'status?')).toBe(true)
  expect(isRealUser({ kind: 'sdk' }, 'Approved.')).toBe(true)
  expect(isRealUser({ kind: 'plugin', name: 'pager' }, 'go')).toBe(false)
  expect(isRealUser({ kind: 'peer' }, 'ACTIVATE W-A')).toBe(false)
  expect(isRealUser({ kind: 'task-notification' }, 'done')).toBe(false)
  expect(isRealUser({ kind: 'composer' }, '[handoff] next session')).toBe(false)
  expect(isRealUser({ kind: 'sdk' }, '  [visual-gate] check')).toBe(false)
})

test('away: manual wins, else idle past the threshold, else present', () => {
  expect(awayState(NOW, NOW - 5 * MIN, { since: NOW - MIN }, 30 * MIN)).toEqual({ away: true, reason: 'manual', period: NOW - MIN })
  expect(awayState(NOW, NOW - 31 * MIN, undefined, 30 * MIN)).toEqual({ away: true, reason: 'idle', period: NOW - 31 * MIN })
  expect(awayState(NOW, NOW - 29 * MIN, undefined, 30 * MIN).away).toBe(false)
  expect(awayState(NOW, undefined, undefined, 30 * MIN).away).toBe(false) // never seen a prompt: unknown, not away
})

test('cap: 8 steps per away period, pauses once, resets with a new period', () => {
  let cap: Cap = capFor(undefined, 1)
  const oks: boolean[] = []
  const paused: boolean[] = []
  for (let i = 0; i < MAX_STEPS + 2; i++) {
    const r = takeStep(cap)
    oks.push(r.ok)
    paused.push(r.justPaused)
    cap = r.cap
  }
  expect(oks.filter(Boolean).length).toBe(8)
  expect(oks[8]).toBe(false)
  expect(paused.filter(Boolean).length).toBe(1) // the "paused" push goes out once
  expect(capFor(cap, 1)).toBe(cap)
  expect(capFor(cap, 2)).toEqual({ period: 2, count: 0, paused: false })
})

test('takeStep does not mutate its input', () => {
  const cap = capFor(undefined, 1)
  takeStep(cap)
  expect(cap.count).toBe(0)
})

test('push dedupe: once per item, at most one per 10 minutes per session', () => {
  expect(shouldPush('lane:x:W-B:1', NOW, {}, 0)).toBe(true)
  expect(shouldPush('lane:x:W-B:1', NOW, { 'lane:x:W-B:1': NOW - 60 * MIN }, 0)).toBe(false)
  expect(shouldPush('lane:x:W-B:2', NOW, { 'lane:x:W-B:1': NOW - 60 * MIN }, 0)).toBe(true) // new episode
  expect(shouldPush('wait:s:t', NOW, {}, NOW - 9 * MIN)).toBe(false)
  expect(shouldPush('wait:s:t', NOW, {}, NOW - 10 * MIN)).toBe(true)
  expect(prune({ old: NOW - 3 * 864e5, fresh: NOW - MIN }, NOW)).toEqual({ fresh: NOW - MIN })
})
