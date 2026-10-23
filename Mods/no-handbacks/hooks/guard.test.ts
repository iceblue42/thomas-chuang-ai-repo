import { describe, expect, test } from 'claude-code/testing'

import type { Detection } from './detect'
import { DOABLE, INITIAL, NEEDS_OWNER, NO_HANDBACK, decide, isRealUser, mayNudge, onAnswer, onSubmit, onTurnStart, parseToggle } from './guard'

const ending = (over: Partial<Parameters<typeof mayNudge>[1]> = {}) => ({
  reason: 'answer',
  isAborted: false,
  turnId: 't1',
  answer: 'You can run `npm test` later to confirm.',
  ...over,
})

describe('who is the person', () => {
  test('typed, bridge, sdk and slack prompts are the person', () => {
    for (const kind of ['composer', 'bridge', 'sdk', 'slack-ping']) expect(isRealUser({ kind }, 'do it')).toBe(true)
  })
  test('marked prompts and plugin/notification origins are not', () => {
    expect(isRealUser({ kind: 'composer' }, '[handoff] resume the run')).toBe(false)
    expect(isRealUser({ kind: 'composer' }, '  [visual-gate] check the screenshot')).toBe(false)
    expect(isRealUser({ kind: 'plugin', name: 'pager' }, 'hello')).toBe(false)
    expect(isRealUser({ kind: 'task-notification' }, 'done')).toBe(false)
  })
})

describe('loop guard', () => {
  test('nudges once, then not again until the person speaks', () => {
    let g = INITIAL
    expect(mayNudge(g, ending())).toBe(true)
    g = { ...g, nudged: true }
    expect(mayNudge(g, ending({ turnId: 't2' }))).toBe(false)
    g = onSubmit(g, { kind: 'plugin', name: 'house-rules' }, '[house-rules] tidy up')
    expect(mayNudge(g, ending({ turnId: 't3' }))).toBe(false)
    g = onSubmit(g, { kind: 'composer' }, 'Do this for me.')
    expect(mayNudge(g, ending({ turnId: 't4' }))).toBe(true)
  })

  test('never nudges the turn its own nudge started, even after the person speaks', () => {
    let g = { ...INITIAL, nudged: true }
    g = onSubmit(g, { kind: 'plugin', name: 'no-handbacks' }, '[no-handbacks] You handed the owner work')
    expect(g.pending).toBe(true)
    g = onTurnStart(g, 'nudge-turn', '')
    expect(g).toEqual({ ...INITIAL, nudged: true, pending: false, nudgeTurn: 'nudge-turn' })
    g = onSubmit(g, { kind: 'composer' }, 'also fix the README') // typed mid-turn
    expect(mayNudge(g, ending({ turnId: 'nudge-turn' }))).toBe(false)
    expect(mayNudge(g, ending({ turnId: 'next' }))).toBe(true)
  })

  test('a framed marker in turn.start text marks the turn too', () => {
    const g = onTurnStart(INITIAL, 't9', 'The no-handbacks plugin sent a message: [no-handbacks] Do it now.')
    expect(g.nudgeTurn).toBe('t9')
    expect(onTurnStart(INITIAL, 't10', 'fix the bug').nudgeTurn).toBe('')
  })

  test('skips subagents, non-answers, aborts, empty answers, closing questions and off', () => {
    expect(mayNudge(INITIAL, ending({ agentId: 'a1' }))).toBe(false)
    expect(mayNudge(INITIAL, ending({ reason: 'error' }))).toBe(false)
    expect(mayNudge(INITIAL, ending({ isAborted: true }))).toBe(false)
    expect(mayNudge(INITIAL, ending({ answer: '  ' }))).toBe(false)
    expect(mayNudge(INITIAL, ending({ answer: 'You can run it later. Want me to run it now instead?' }))).toBe(false)
    expect(mayNudge({ ...INITIAL, enabled: false }, ending())).toBe(false)
  })
})

describe('held MAB sessions', () => {
  const ME = { kind: 'composer' }
  const ARMED = 'Invoke the multi-agent-building skill in hold mode: `hold W-D`.\nProject: E:/Claude/EVI'
  const HELD_REPLY =
    "W-D is registered as HOLDING in `lanes/D.md` and waiting for `ACTIVATE W-D` from P6-O2, or for you to type 'activate'."

  test('an armed holding prompt as the first prompt holds the session until ACTIVATE', () => {
    let g = onSubmit(INITIAL, ME, ARMED)
    expect(g.holding).toBe(true)
    expect(mayNudge(g, ending({ answer: HELD_REPLY }))).toBe(false)
    g = onSubmit(g, ME, 'what lane are you?')
    expect(mayNudge(g, ending({ turnId: 't2' }))).toBe(false)
    g = onSubmit(g, { kind: 'peer-send-message' }, 'Another Claude session sent a message: ACTIVATE W-D')
    expect(g.holding).toBe(false)
    expect(mayNudge(g, ending({ turnId: 't3' }))).toBe(true)
  })

  test('the person typing activate releases the hold', () => {
    const g = onSubmit(onSubmit(INITIAL, ME, 'You are session MAB P5 Holding 3. Standby for activation.'), ME, 'activate')
    expect(g.holding).toBe(false)
  })

  test('a holding prompt that is not the first prompt does not hold the session', () => {
    const g = onSubmit(onSubmit(INITIAL, ME, 'Fix the deploy.'), ME, ARMED)
    expect(g.holding).toBe(false)
  })

  test('a holding reply is never nudged, and a short one holds the session', () => {
    expect(mayNudge(INITIAL, ending({ answer: HELD_REPLY }))).toBe(false)
    const g = onAnswer(INITIAL, ending({ answer: HELD_REPLY }))
    expect(g.holding).toBe(true)
    expect(mayNudge(g, ending({ turnId: 't2' }))).toBe(false)
  })

  test('a long summary or a subagent mentioning ACTIVATE does not hold the session', () => {
    const long = `${'Lane A merged; lane C is done. '.repeat(30)}Lane B is waiting for ACTIVATE B.`
    expect(onAnswer(INITIAL, ending({ answer: long }))).toBe(INITIAL)
    expect(onAnswer(INITIAL, ending({ answer: HELD_REPLY, agentId: 'a1' }))).toBe(INITIAL)
  })
})

describe('decide', () => {
  const d = (over: Partial<Detection> = {}): Detection => ({ hit: true, quote: 'q', ownerBlock: false, nonPs51: false, ...over })
  test('classifier says doable: nudge to do the work', () => {
    expect(decide(d(), DOABLE)).toBe('work')
  })
  test('classifier says owner: no nudge, unless the owner got bash', () => {
    expect(decide(d(), NEEDS_OWNER)).toBe(null)
    expect(decide(d({ ownerBlock: true, nonPs51: true }), NEEDS_OWNER)).toBe('rewrite')
  })
  test('no classifier: trust the prefilter only with a command block for the owner', () => {
    expect(decide(d(), undefined)).toBe(null)
    expect(decide(d({ ownerBlock: true }), undefined)).toBe('work')
  })
  test('classifier says it is no handback at all: nothing, even with a block', () => {
    expect(decide(d({ ownerBlock: true, nonPs51: true }), NO_HANDBACK)).toBe(null)
  })
  test('no prefilter hit: nothing', () => {
    expect(decide(d({ hit: false }), DOABLE)).toBe(null)
  })
})

test('parseToggle', () => {
  expect(parseToggle(' ON ')).toBe(true)
  expect(parseToggle('off')).toBe(false)
  expect(parseToggle('')).toBe(undefined)
  expect(parseToggle('maybe')).toBe(undefined)
})
