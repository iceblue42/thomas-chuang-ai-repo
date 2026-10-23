import type { EngineInterface, Register, TurnCompleteInput } from 'claude-code'

import { detectHandback } from './detect'
import { INITIAL, LABELS, decide, mayNudge, onAnswer, onSubmit, onTurnStart, parseToggle, type Guard } from './guard'
import { POLICY, POLICY_ID, classifyText, nudgeText } from './text'

type $ = EngineInterface

const guardRef = { plugin: 'no-handbacks', key: 'guard' } as const

const load = async ($: $): Promise<Guard> => ({ ...INITIAL, ...((await $.state.get(guardRef)).value ?? {}) })
const save = ($: $, g: Guard) => $.state.set(guardRef, g)

// The classifier's label, or undefined when it is unavailable or fails.
async function verdictOf($: $, answer: string, flagged: string): Promise<string | undefined> {
  try {
    return await $.model.classify(classifyText(answer, flagged), LABELS)
  } catch {
    return undefined
  }
}

async function check($: $, e: TurnCompleteInput): Promise<void> {
  const before = await load($)
  const g = onAnswer(before, e)
  if (g !== before) await save($, g)
  if (!mayNudge(g, e)) return
  const d = detectHandback(e.answer)
  if (!d.hit) return
  const kind = decide(d, await verdictOf($, e.answer, d.quote))
  if (!kind) return
  await save($, { ...g, nudged: true })
  // not awaited: it resolves when the nudge's turn starts, which waits for this turn to finish
  void $.prompt.submit({ text: nudgeText(kind, d) }).catch(() => {})
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    try {
      await $.command.register({
        name: 'no-handbacks',
        description: 'Nudge Claude to do handed-back work itself (this session): on | off',
        argumentHint: '[on|off]',
        immediate: true,
      })
    } catch {}
    return next(e)
  })

  on('command.run', { command: 'no-handbacks' }, async ($, e) => {
    try {
      const g = await load($)
      const want = parseToggle(e.args)
      if (want === undefined) return { text: `no-handbacks is ${g.enabled ? 'on' : 'off'} for this session. Use /no-handbacks on|off.` }
      await save($, { ...g, enabled: want })
      return { text: `no-handbacks ${want ? 'on' : 'off'} for this session.` }
    } catch (err) {
      return { text: `no-handbacks: could not change the setting (${String(err)})` }
    }
  })

  on('prompt.compose', async ($, e, next) => {
    const r = await next(e)
    try {
      if (!(await load($)).enabled) return r
      return { ...r, sections: [...r.sections.filter(s => s.id !== POLICY_ID), { id: POLICY_ID, text: POLICY, scope: 'session' }] }
    } catch {
      return r
    }
  })

  // Tracked before next(e): the turn starts before next resolves.
  on('prompt.submit', async ($, e, next) => {
    try {
      await save($, onSubmit(await load($), e.origin, e.text))
    } catch {}
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    try {
      await save($, onTurnStart(await load($), e.turnId, e.text))
    } catch {}
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    try {
      await check($, e)
    } catch {}
    return done
  })
}
