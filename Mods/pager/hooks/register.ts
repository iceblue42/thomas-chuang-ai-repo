// pager: MAB status line, stall + waiting-on-you detection, pushes, and away-mode auto-continue. Logic lives in the pure files.
import type { EngineInterface, Register, Timer } from 'claude-code'

import { MAX_STEPS, awayState, capFor, isRealUser, prune, shouldPush, takeStep, type Away, type Cap, type Manual } from './away'
import { liveRun, withWorktreeActivity, type Io } from './discover'
import {
  field, isNewEpisode, laneViews, markEpisode, orchestratorView, pruneEpisodes, runLabel, statusLine, type Episodes, type RunFiles, type View,
} from './lanes'
import {
  AUTO_CONTINUE, WAITING_LABELS, classifyText, detectRole, isAutoContinue, isOrchestrator, laneNudge, looksLikeWaiting, pickAnswers,
  saysNothingPending, snippet,
} from './waiting'

type $ = EngineInterface
type Decision = { at: number; session: string; text: string }

const CONTINUE_DELAY_MS = 90_000
const TICK_MS = 60_000
const ROLE_TTL_MS = 5 * 60_000

// Session-local state: the module runs once per session, and a hot reload resets it. Anything that must survive a
// reload (the auto-step cap, stall episodes, the nothing-to-decide quiet) lives in $.store, keyed by session id.
const cfg = { stallMs: 20 * 60_000, awayAfterMs: 30 * 60_000 }
const my = {
  sid: '',
  running: false,
  turnId: '',
  turnSeq: 0,
  lastStepAt: 0,
  lastPushAt: 0,
  pending: null as Timer | null,
  ticking: false,
  role: null as { at: number; runId: string; isOrch: boolean } | null,
  lock: Promise.resolve() as Promise<unknown>,
}

const num = (v: unknown, d: number) => (typeof v === 'number' && v > 0 ? v : d)
const hhmm = (ms: number) => new Date(ms).toTimeString().slice(0, 5)
const quiet = async (fn: () => Promise<unknown>) => {
  try {
    await fn()
  } catch {
    // fs / store / tool failures never leave a hook
  }
}

function io($: $): Io {
  return { read: p => $.fs.read(p), exists: p => $.fs.exists(p), stat: p => $.fs.stat(p), list: p => $.fs.list(p) }
}

// Resolved on demand: a hook can run before this load's session.start has.
async function sid($: $) {
  if (!my.sid) my.sid = await $.session.id().catch(() => '')
  return my.sid
}

// This session's store read-modify-writes run one at a time, so concurrent hooks cannot lose a count.
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = my.lock.then(fn, fn)
  my.lock = run.catch(() => undefined)
  return run
}

async function away($: $): Promise<Away> {
  const lastUser = (await $.store.get('lastUser')) as number | undefined
  const manual = (await $.store.get('away')) as Manual | undefined
  return awayState(await $.clock.now(), lastUser, manual, cfg.awayAfterMs)
}

async function readCap($: $, a: Away) {
  return capFor((await $.store.get(`cap:${await sid($)}`)) as Cap | undefined, a.period)
}

async function findRun($: $, t: number) {
  const run = await liveRun(io($), await $.session.cwd(), t).catch(() => null)
  return run && withWorktreeActivity(io($), run, t, cfg.stallMs).catch(() => run)
}

function views(run: RunFiles | null, t: number): View[] {
  if (!run) return []
  const orch = orchestratorView(run, t, cfg.stallMs)
  return [...(orch ? [orch] : []), ...laneViews(run, t, cfg.stallMs)]
}

// Narrowly typed: `$.tool.call`'s full union (every connected MCP tool, re-laid on each reload) can exceed tsc's depth.
type Push = (call: { tool: 'PushNotification'; message: string; status: 'proactive' }) => Promise<{ deny?: unknown; isError?: boolean }>

// Phone push via the PushNotification tool when this session has it and may call it unasked; else a toast.
async function send($: $, message: string) {
  $.ui.log(`pager: ${message}`)
  try {
    if ((await $.tool.list()).some(t => t.name === 'PushNotification')) {
      const input = { message: message.slice(0, 200), status: 'proactive' as const }
      const { decision } = await $.tool.check({ tool: 'PushNotification', input })
      if (decision === 'allow') {
        const r = await ($.tool.call as unknown as Push)({ tool: 'PushNotification', ...input })
        if (r.deny === undefined && !r.isError) return
      }
    }
  } catch {
    // fall through to the toast
  }
  $.ui.toast(message, { timeoutMs: 15_000 })
}

// Deduped across sessions by item key; at most one push per session per 10 min. True once the item is out.
async function notify($: $, key: string, message: string) {
  const t = await $.clock.now()
  const pushed = prune(((await $.store.get('pushed')) ?? {}) as Record<string, number>, t)
  if (pushed[key] !== undefined) return true
  if (!shouldPush(key, t, pushed, my.lastPushAt)) return false
  my.lastPushAt = t
  await $.store.set('pushed', { ...pushed, [key]: t })
  await send($, message)
  return true
}

async function record($: $, text: string) {
  const list = ((await $.store.get('decisions')) ?? []) as Decision[]
  await $.store.set('decisions', [...list, { at: await $.clock.now(), session: (await sid($)).slice(0, 8), text }].slice(-20))
}

// One auto-step against this session's cap for the away period, persisted so a reload does not reset it.
async function step($: $, a: Away) {
  const r = await serial(async () => {
    const taken = takeStep(await readCap($, a))
    await $.store.set(`cap:${await sid($)}`, taken.cap)
    return taken
  })
  if (r.justPaused) await send($, `pager paused auto-continue after ${MAX_STEPS} steps`)
  return r.ok
}

// One per stall episode, across sessions and reloads: claimed once `act` succeeds, and again only after new lane activity.
async function episode($: $, map: 'stallAlerts' | 'stallNudges', key: string, activity: number, t: number, act: () => Promise<boolean>) {
  const eps = pruneEpisodes(((await $.store.get(map)) ?? {}) as Episodes, t)
  if (!isNewEpisode(eps, key, activity) || !(await act())) return
  const now = pruneEpisodes(((await $.store.get(map)) ?? {}) as Episodes, t)
  await $.store.set(map, markEpisode(now, key, activity, t))
}

async function amOrchestrator($: $, run: RunFiles) {
  const t = await $.clock.now()
  if (my.role && my.role.runId === run.id && t - my.role.at < ROLE_TTL_MS) return my.role.isOrch
  const msgs = await $.session.messages()
  const isOrch = isOrchestrator(detectRole(msgs), field(run.state, 'This session'), msgs.some(m => m.text.includes(run.id)))
  my.role = { at: t, runId: run.id, isOrch }
  return isOrch
}

// While away, in the orchestrator's idle session: one nudge per stalled lane per episode.
async function nudgeLane($: $, run: RunFiles, v: View, a: Away, t: number) {
  if (my.running || my.pending || !(await amOrchestrator($, run))) return
  let nudge = false
  await episode($, 'stallNudges', `${run.id}:${v.id}`, v.lastActivity, t, async () => (nudge = await step($, a)))
  if (!nudge) return
  await record($, `nudged orchestrator about stalled lane ${v.id} (${v.idleMin}m)`)
  await $.prompt.submit({ text: laneNudge(v.id, v.idleMin) })
}

async function tick($: $) {
  if (my.ticking) return
  my.ticking = true
  try {
    const t = await $.clock.now()
    const a = await away($)
    const run = await findRun($, t)
    const vs = views(run, t)
    const selfIdle = my.running && my.lastStepAt > 0 ? t - my.lastStepAt : 0
    const cap = await readCap($, a)
    const extras = [
      selfIdle >= cfg.stallMs ? `this turn ⚠ ${Math.floor(selfIdle / 60_000)}m` : '',
      a.away ? (cap.paused ? 'away · auto paused' : 'away') : '',
    ].filter(Boolean)
    $.ui.status(statusLine(run ? runLabel(run.id) : null, vs, extras))
    if (!a.away) return
    if (selfIdle >= cfg.stallMs) {
      await notify($, `self:${await sid($)}:${my.turnId}:${my.lastStepAt}`, `pager: this session looks stuck, no model step for ${Math.floor(selfIdle / 60_000)}m`)
    }
    if (!run) return
    for (const v of vs.filter(x => x.stalled && !/^O\d/.test(x.id))) {
      const message = `pager: lane ${v.id} stalled ${v.idleMin}m (${runLabel(run.id)})`
      await episode($, 'stallAlerts', `${run.id}:${v.id}`, v.lastActivity, t, () => notify($, `lane:${run.id}:${v.id}:${v.lastActivity}`, message))
      await nudgeLane($, run, v, a, t)
    }
  } catch {
    // never throw out of a timer
  } finally {
    my.ticking = false
  }
}

async function autoContinue($: $, seq: number, answer: string) {
  my.pending = null
  if (my.running || my.turnSeq !== seq) return // a new turn started: the owner or other mods' nudges win
  const a = await away($)
  if (!a.away || !(await step($, a))) return
  await record($, `auto-continued after: ${snippet(answer, 100)}`)
  await $.prompt.submit({ text: AUTO_CONTINUE })
}

// After an auto-continue whose reply found nothing to decide, stay quiet in this session for the rest of the away period.
async function afterAutoTurn($: $, answer: string, turnId: string) {
  const key = `autoTurn:${await sid($)}`
  if ((await $.store.get(key)) !== turnId) return
  await $.store.delete(key)
  const a = await away($)
  if (a.away && saysNothingPending(answer)) await $.store.set(`quiet:${await sid($)}`, a.period)
}

async function onAnswer($: $, answer: string, id: string) {
  await afterAutoTurn($, answer, id)
  if (!looksLikeWaiting(answer)) return
  const a = await away($)
  if (!a.away || (await $.store.get(`quiet:${await sid($)}`)) === a.period) return
  let waiting = true // heuristic alone when the classifier is unavailable
  try {
    const label = await $.model.classify(classifyText(answer), WAITING_LABELS)
    if (label !== undefined) waiting = label === 'needs-owner-decision'
  } catch {
    // keep the heuristic's verdict
  }
  if (!waiting) return
  await notify($, `wait:${await sid($)}:${id}`, `pager: waiting on you, auto-continuing in 90s: ${snippet(answer, 100)}`)
  const seq = my.turnSeq
  my.pending?.cancel()
  my.pending = $.clock.after(CONTINUE_DELAY_MS, () => void quiet(() => autoContinue($, seq, answer)))
}

async function notifyPermission($: $, tool: string) {
  if ((await away($)).away) await notify($, `perm:${await sid($)}:${my.turnId}:${tool}`, `pager: permission prompt waiting (${tool})`)
}

async function report($: $) {
  const t = await $.clock.now()
  const a = await away($)
  const lastUser = (await $.store.get('lastUser')) as number | undefined
  const cap = await readCap($, a)
  const run = await findRun($, t)
  const decisions = ((await $.store.get('decisions')) ?? []) as Decision[]
  const ago = (ms: number) => `${Math.floor((t - ms) / 60_000)}m ago`
  return [
    a.away
      ? `Away: yes (${a.reason === 'manual' ? `/away since ${hhmm(a.period)}` : `no prompt since ${hhmm(a.period)}`}). Auto-steps this session: ${cap.count}/${MAX_STEPS}${cap.paused ? ', paused' : ''}.`
      : `Away: no (last prompt ${lastUser ? ago(lastUser) : 'unknown'}; away after ${cfg.awayAfterMs / 60_000}m idle, or /away).`,
    `This session: ${my.running ? `turn running, last model step ${ago(my.lastStepAt)}` : 'idle'}.`,
    run ? `Run ${run.id} (${run.dir}):` : 'No live MAB run in this repo.',
    ...views(run, t).map(v => `  ${v.id.padEnd(5)} ${(v.stalled ? 'STALLED' : v.kind).padEnd(8)}${v.kind === 'done' ? '' : `${v.idleMin}m idle  `}${snippet(v.status, 80)}`),
    decisions.length ? 'Recent auto-decisions:' : 'No auto-decisions yet.',
    ...decisions.slice(-8).map(d => `  ${hhmm(d.at)} [${d.session}] ${d.text}`),
  ].join('\n')
}

async function setAway($: $, on: boolean) {
  if (on) return $.store.set('away', { since: await $.clock.now() })
  await $.store.delete('away')
  await $.store.set('lastUser', await $.clock.now())
}

async function start($: $) {
  my.sid = await $.session.id()
  await $.command.register({ name: 'away', description: 'pager: mark yourself away (until /back or your next prompt)' })
  await $.command.register({ name: 'back', description: 'pager: end away mode' })
  await $.command.register({ name: 'pager', description: 'pager: lanes, away state, recent auto-decisions' })
}

async function markUser($: $) {
  await $.store.set('lastUser', await $.clock.now())
  await $.store.delete('away')
  await $.store.delete(`quiet:${await sid($)}`)
}

// Away: answer AskUserQuestion with the "(Recommended)" option, else the first; undefined = let the person answer.
async function autoAnswer($: $, questions: Parameters<typeof pickAnswers>[0]) {
  const a = await away($)
  if (!a.away || !(await step($, a))) return undefined
  const answers = pickAnswers(questions)
  const picked = Object.entries(answers).map(([q, x]) => `${snippet(q, 60)} -> ${x}`).join('; ')
  await record($, `auto-picked: ${picked}`)
  $.ui.log(`pager: auto-picked (owner away): ${picked}`)
  return answers
}

export const register: Register = (on, options) => {
  cfg.stallMs = num(options.stallMinutes, 20) * 60_000
  cfg.awayAfterMs = num(options.awayAfterMinutes, 30) * 60_000

  on('session.start', async ($, e, next) => {
    await quiet(() => start($))
    $.clock.every(TICK_MS, () => void tick($))
    $.clock.after(0, () => void tick($))
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    if (isRealUser(e.origin, e.text)) await quiet(() => markUser($))
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    my.running = true
    my.turnId = e.turnId
    my.turnSeq += 1
    my.lastStepAt = await $.clock.now()
    my.pending?.cancel()
    my.pending = null
    if (isAutoContinue(e.text)) await quiet(async () => $.store.set(`autoTurn:${await sid($)}`, e.turnId))
    return next(e)
  })

  // Any model request (main or a subagent's) counts as this turn making progress.
  on('turn.step', async function* ($, e, next) {
    my.lastStepAt = await $.clock.now()
    const r = yield* next(e)
    my.lastStepAt = await $.clock.now()
    return r
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    my.running = false
    if (e.reason === 'answer') await quiet(() => onAnswer($, e.answer, e.turnId))
    $.clock.after(0, () => void tick($))
    return next(e)
  })

  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e, next) => {
    if (e.tool !== 'AskUserQuestion') return next(e)
    const answers = await autoAnswer($, e.questions).catch(() => undefined)
    if (!answers) return next(e)
    return {
      result: { questions: e.questions, answers },
      context: ['[pager] auto-picked: owner away. These answers are the options marked (Recommended), else the first. Treat each as an AUTO-DECIDED (owner away) decision and record it (DECISIONS.md for a MAB run).'],
    }
  })

  // Never approved here: only a push while away (deferred, so the dialog is not held up).
  on('classic.PermissionRequest', async ($, e, next) => {
    const tool = e.tool_name
    $.clock.after(0, () => void quiet(() => notifyPermission($, tool)))
    return next(e)
  })

  on('command.run', { command: 'away' }, async $ => {
    await quiet(() => setAway($, true))
    $.clock.after(0, () => void tick($))
    return { text: `Away mode on. pager pushes stalls and waiting items, and follows the recommended path (max ${MAX_STEPS} auto-steps per session). /back or your next prompt ends it.` }
  })

  on('command.run', { command: 'back' }, async $ => {
    await quiet(() => setAway($, false))
    $.clock.after(0, () => void tick($))
    return { text: 'Welcome back: away mode off.' }
  })

  on('command.run', { command: 'pager' }, async $ => {
    try {
      return { text: await report($) }
    } catch (err) {
      return { text: `pager: could not build the report (${String(err)})` }
    }
  })
}
