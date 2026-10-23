// Pure loop guard and decision logic.
import type { NoHandbacksGuard } from '../types'
import { endsWithQuestion, isActivation, isHoldPrompt, isHoldingReply, type Detection } from './detect'

export type Guard = NoHandbacksGuard
export type Origin = { kind: string; name?: string }
export type Ending = { agentId?: string; reason: string; isAborted: boolean; turnId: string; answer: string }

export const PLUGIN = 'no-handbacks'
export const DOABLE = 'DOABLE_BY_CLAUDE'
export const NEEDS_OWNER = 'NEEDS_OWNER'
export const NO_HANDBACK = 'NO_HANDBACK'
export const LABELS = [DOABLE, NEEDS_OWNER, NO_HANDBACK] as const

export const INITIAL: Guard = { enabled: true, nudged: false, pending: false, nudgeTurn: '', prompted: false, holding: false }

// Prompts the cross-mod convention marks as a mod's, not the person's.
const MARKER = /^\s*\[(?:handoff|pager|house-rules|no-handbacks|visual-gate)\]/i
const OWN = /\[no-handbacks\]/i
// Origins that carry the person's own words.
const PERSON = new Set(['composer', 'bridge', 'sdk', 'slack-ping'])

export const isRealUser = (origin: Origin, text: string) => PERSON.has(origin.kind) && !MARKER.test(text)

const isOwnPrompt = (origin: Origin, text: string) =>
  (origin.kind === 'plugin' && origin.name === PLUGIN) || /^\s*\[no-handbacks\]/i.test(text)

// Held from an armed holding prompt as the person's first prompt; released by ACTIVATE from anyone.
function holdingAfter(g: Guard, real: boolean, text: string): boolean {
  if (real && !g.prompted && isHoldPrompt(text)) return true
  return g.holding && !isActivation(text)
}

export function onSubmit(g: Guard, origin: Origin, text: string): Guard {
  if (isOwnPrompt(origin, text)) return { ...g, pending: true }
  const real = isRealUser(origin, text)
  const holding = holdingAfter(g, real, text)
  if (real) return { ...g, nudged: false, pending: false, prompted: true, holding }
  return holding === g.holding ? g : { ...g, holding }
}

// A short main-session reply registering itself as held marks the session held too.
const HOLD_REPLY_MAX = 600

export function onAnswer(g: Guard, e: Ending): Guard {
  if (g.holding || e.agentId !== undefined || e.answer.length > HOLD_REPLY_MAX || !isHoldingReply(e.answer)) return g
  return { ...g, holding: true }
}

// turn.start's text may carry the plugin frame ahead of the marker, so look near the start.
export function onTurnStart(g: Guard, turnId: string, text: string): Guard {
  if (g.pending || OWN.test(text.slice(0, 300))) return { ...g, pending: false, nudgeTurn: turnId }
  return g
}

export function mayNudge(g: Guard, e: Ending): boolean {
  return (
    g.enabled &&
    !g.nudged &&
    !g.holding &&
    e.agentId === undefined &&
    e.reason === 'answer' &&
    !e.isAborted &&
    e.turnId !== g.nudgeTurn &&
    e.answer.trim() !== '' &&
    !endsWithQuestion(e.answer) &&
    !isHoldingReply(e.answer)
  )
}

export type Nudge = 'work' | 'rewrite' | null

// verdict: the classifier's label, or undefined when it is unavailable or failed.
export function decide(d: Detection, verdict: string | undefined): Nudge {
  if (!d.hit || verdict === NO_HANDBACK) return null
  if (verdict === DOABLE) return 'work'
  if (verdict === NEEDS_OWNER) return d.nonPs51 ? 'rewrite' : null
  return d.ownerBlock ? 'work' : null
}

export function parseToggle(args: string): boolean | undefined {
  const a = args.trim().toLowerCase()
  if (a === 'on' || a === 'enable') return true
  if (a === 'off' || a === 'disable') return false
  return undefined
}
