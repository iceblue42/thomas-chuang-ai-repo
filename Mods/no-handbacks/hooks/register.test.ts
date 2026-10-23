import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const F = '```'
const HANDBACK = `Run this in PowerShell to add the allowance:\n\n${F}bash\ncd E:/x && npm i\n${F}`
const LATER = 'Everything is wired up. You can run `npm test` later to confirm.'
const DONE = "I've deployed it and the health check passes."
const ME = { kind: 'composer' } as const
const PRESENTATION = { isFullscreen: false, columns: 100 }
const MODEL = 'claude-opus-5-5'
const COMPOSE = { model: MODEL, promptModel: MODEL, surfaces: [], tools: [], outputStyle: null, traits: [] }

const settle = async () => {
  for (let i = 0; i < 50; i++) await Promise.resolve()
}

// The world beneath the plugin: a classifier answering `label`, a recorder of queued prompts.
function world(on: On, label: string | Error | undefined) {
  const sent: string[] = []
  let classified = 0
  on('model.classify', async () => {
    classified++
    if (label instanceof Error) throw label
    return { value: label }
  })
  on('prompt.submit', async ($, e) => {
    sent.push(e.text)
    return { text: e.text }
  })
  on('turn.start', async ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', async ($, e) => ({ text: e.answer }))
  on('prompt.compose', async () => ({ sections: [{ id: 'intro', text: 'You are Claude.', scope: 'shared' as const }] }))
  return { sent, classified: () => classified }
}

const end = (turnId: string, answer: string, over: object = {}) => ({
  answer,
  turnId,
  durationMs: 1000,
  isAborted: false,
  reason: 'answer' as const,
  ...over,
})

test('confirmed handback: one nudge with the PowerShell rewrite, then quiet until the person speaks', async ($, on) => {
  const w = world(on, 'DOABLE_BY_CLAUDE')
  await $.prompt.submit({ text: 'Do this for me.', origin: ME, wait: false })
  await $.turn.complete(end('t1', HANDBACK))
  await settle()
  expect(w.sent.length).toBe(2)
  const nudge = w.sent[1]!
  expect(nudge.startsWith('[no-handbacks] You handed the owner work you can do yourself: "Run this in PowerShell')).toBe(true)
  expect(nudge.includes('Windows PowerShell 5.1')).toBe(true)

  // the nudge's own turn, and anything else before the person speaks, is left alone
  await $.turn.start({ turnId: 't2', text: nudge })
  await $.turn.complete(end('t2', LATER))
  await $.turn.complete(end('t3', LATER))
  await settle()
  expect(w.sent.length).toBe(2)

  await $.prompt.submit({ text: 'Nothing should be for me later.', origin: ME, wait: false })
  await $.turn.complete(end('t4', LATER))
  await settle()
  expect(w.sent.length).toBe(4)
  expect(w.sent[3]!.includes('"Everything is wired up. You can run')).toBe(false)
  expect(w.sent[3]!.includes('"You can run `npm test` later to confirm."')).toBe(true)
})

test('a held MAB session is left alone until ACTIVATE', async ($, on) => {
  const w = world(on, 'DOABLE_BY_CLAUDE')
  await $.prompt.submit({ text: 'Invoke the multi-agent-building skill in hold mode: `hold W-D`.', origin: ME, wait: false })
  await $.turn.complete(end('t1', 'Holding as W-D. Activate with "ACTIVATE W-D" or type "activate".'))
  await $.turn.complete(end('t2', LATER))
  await settle()
  expect(w.classified()).toBe(0)
  expect(w.sent.length).toBe(1)

  await $.prompt.submit({ text: 'ACTIVATE W-D', origin: { kind: 'peer-send-message' }, wait: false })
  await $.turn.complete(end('t3', LATER))
  await settle()
  expect(w.sent.length).toBe(3)
})

test('nudges ask for a short reply', async ($, on) => {
  const w = world(on, 'DOABLE_BY_CLAUDE')
  await $.turn.complete(end('t1', LATER))
  await settle()
  expect(w.sent[0]!.endsWith('Keep the reply short; do the work rather than explaining.')).toBe(true)
})

test('classifier says the owner is needed: no nudge', async ($, on) => {
  const w = world(on, 'NEEDS_OWNER')
  await $.turn.complete(end('t1', LATER))
  await settle()
  expect(w.classified()).toBe(1)
  expect(w.sent).toEqual([])
})

test('no prefilter hit: the classifier is never asked', async ($, on) => {
  const w = world(on, 'DOABLE_BY_CLAUDE')
  await $.turn.complete(end('t1', DONE))
  await settle()
  expect(w.classified()).toBe(0)
  expect(w.sent).toEqual([])
})

test('classifier fails: nudge only for a command block addressed to the owner', async ($, on) => {
  const w = world(on, new Error('api-error'))
  await $.turn.complete(end('t1', LATER))
  await settle()
  expect(w.sent).toEqual([])
  await $.turn.complete(end('t2', HANDBACK))
  await settle()
  expect(w.sent.length).toBe(1)
})

test('subagent turns and closing questions are skipped', async ($, on) => {
  const w = world(on, 'DOABLE_BY_CLAUDE')
  await $.turn.complete(end('t1', HANDBACK, { agentId: 'a1' }))
  await $.turn.complete(end('t2', `${LATER} Want me to run it now instead?`))
  await settle()
  expect(w.classified()).toBe(0)
  expect(w.sent).toEqual([])
})

test('/no-handbacks off stops nudges and drops the policy section; on restores both', async ($, on) => {
  const w = world(on, 'DOABLE_BY_CLAUDE')
  const run = (args: string) => $.command.run({ command: 'no-handbacks', args, origin: ME, presentation: PRESENTATION })
  const ids = async () => (await $.prompt.compose(COMPOSE)).sections.map(s => s.id)

  expect(await ids()).toEqual(['intro', 'no-handbacks:policy'])
  expect((await run('')).text).toBe('no-handbacks is on for this session. Use /no-handbacks on|off.')
  expect((await run('off')).text).toBe('no-handbacks off for this session.')
  expect(await ids()).toEqual(['intro'])
  await $.turn.complete(end('t1', HANDBACK))
  await settle()
  expect(w.sent).toEqual([])

  await run('on')
  expect(await ids()).toEqual(['intro', 'no-handbacks:policy'])
  await $.turn.complete(end('t2', HANDBACK))
  await settle()
  expect(w.sent.length).toBe(1)
})

test('policy section text', async ($, on) => {
  world(on, undefined)
  const { sections } = await $.prompt.compose(COMPOSE)
  const policy = sections.find(s => s.id === 'no-handbacks:policy')
  expect(policy?.scope).toBe('session')
  expect(policy?.text.includes('Windows PowerShell 5.1 syntax')).toBe(true)
  expect(policy?.text.includes('```powershell')).toBe(true)
})
