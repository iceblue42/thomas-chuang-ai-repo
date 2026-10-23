import type { On } from 'claude-code'
import { expect, mock, test, type Engine, type MockClock } from 'claude-code/testing'

import { AUTO_CONTINUE } from './waiting'

const QUESTIONS = [
  {
    question: 'Which path?',
    header: 'Path',
    multiSelect: false,
    options: [{ label: 'Rebase', description: 'now' }, { label: 'Wait (Recommended)', description: 'for 0b' }],
  },
]

// AskUserQuestion's result is typed loosely (`answers: {}`); read it as a record.
const answersOf = (r: { result?: unknown }) => (r.result as { answers?: Record<string, string> } | undefined)?.answers

// Narrowly typed: `$.tool.call`'s full union (every connected MCP tool, re-laid on each reload) can exceed tsc's depth.
type Ask = (call: { tool: 'AskUserQuestion'; questions: typeof QUESTIONS }) => Promise<{ result?: unknown }>
const ask = ($: Engine) => ($.tool.call as unknown as Ask)({ tool: 'AskUserQuestion', questions: QUESTIONS })

test('while away, AskUserQuestion is answered with the recommended option', async ($, on) => {
  mock.clock(on, { now: 10_000_000 })
  mock.store(on, { away: { since: 9_000_000 } })
  let reachedDialog = false
  on('tool.call', { tool: 'AskUserQuestion' }, () => {
    reachedDialog = true
    return { deny: 'dialog' }
  })
  const r = await ask($)
  expect(reachedDialog).toBe(false)
  expect(answersOf(r)).toEqual({ 'Which path?': 'Wait (Recommended)' })
})

test('when present, AskUserQuestion goes to the person', async ($, on) => {
  mock.clock(on, { now: 10_000_000 })
  mock.store(on, { lastUser: 9_999_000 })
  let reachedDialog = false
  on('tool.call', { tool: 'AskUserQuestion' }, () => {
    reachedDialog = true
    return { deny: 'dialog' }
  })
  await ask($)
  expect(reachedDialog).toBe(true)
})

test('/away turns auto-answering on and /back turns it off', async ($, on) => {
  mock.clock(on, { now: 10_000_000 })
  mock.store(on, { lastUser: 9_999_000 })
  let dialogs = 0
  on('tool.call', { tool: 'AskUserQuestion' }, () => {
    dialogs += 1
    return { deny: 'dialog' }
  })
  await $.command.run({ command: 'away', args: '' } as never)
  const r = await ask($)
  expect(answersOf(r)).toEqual({ 'Which path?': 'Wait (Recommended)' })
  expect(dialogs).toBe(0)
  await $.command.run({ command: 'back', args: '' } as never)
  await ask($)
  expect(dialogs).toBe(1)
})

// --- auto-continue: the cap (D) and the nothing-to-decide quiet (C) ---

const WAITING = 'Gate 2 report is ready.\n\nShould I start the reviewer bench run now?'
let turns = 0

// The world beneath pager for a waiting-on-you run: a session id, a classifier that agrees, and a prompt sink.
function world(on: On, store: Record<string, unknown>) {
  const clock = mock.clock(on, { now: 10_000_000 })
  mock.store(on, store)
  on('session.id', () => ({ value: 'S1' }))
  on('model.classify', () => ({ value: 'needs-owner-decision' }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  const submits: string[] = []
  on('prompt.submit', (_$, e) => {
    submits.push(e.text)
    return { text: e.text }
  })
  return { clock, submits: () => submits.filter(t => t === AUTO_CONTINUE).length }
}

// One turn that ends in `answer`, then the 90s auto-continue delay.
async function turn($: Engine, clock: MockClock, text: string, answer: string) {
  const turnId = `turn-${(turns += 1)}`
  await $.turn.start({ text, turnId })
  await $.turn.complete({ answer, durationMs: 1000, isAborted: false, turnId, reason: 'answer' })
  await clock.advance(90_000)
}

test('nine eligible waiting turns while away submit at most 8 auto-continues', async ($, on) => {
  const w = world(on, { away: { since: 9_000_000 } })
  for (let i = 0; i < 9; i++) await turn($, w.clock, i ? AUTO_CONTINUE : 'go', WAITING)
  expect(w.submits()).toBe(8)
})

test('the cap is read from the store, so a reloaded module keeps counting the same away period', async ($, on) => {
  // 5 steps taken before the reload, in this away period: 3 left
  const w = world(on, { away: { since: 9_000_000 }, 'cap:S1': { period: 9_000_000, count: 5, paused: false } })
  for (let i = 0; i < 9; i++) await turn($, w.clock, i ? AUTO_CONTINUE : 'go', WAITING)
  expect(w.submits()).toBe(3)
})

test('after an auto-continue finds nothing to decide, waiting turns stay quiet until a real prompt', async ($, on) => {
  const w = world(on, { away: { since: 9_000_000 } })
  await turn($, w.clock, 'go', WAITING)
  expect(w.submits()).toBe(1)
  await turn($, w.clock, AUTO_CONTINUE, 'Nothing needs deciding right now; still idle until O2 sends RELEASE.')
  await turn($, w.clock, 'ACTIVATE W-A', WAITING)
  await turn($, w.clock, 'ACTIVATE W-B', WAITING)
  expect(w.submits()).toBe(1)
  // the owner speaks, then goes away again: auto-continue is back
  await $.prompt.submit({ text: 'carry on', origin: { kind: 'composer' }, wait: false })
  await $.command.run({ command: 'away', args: '' } as never)
  await turn($, w.clock, 'carry on', WAITING)
  expect(w.submits()).toBe(2)
})
