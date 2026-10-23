import type { EngineInterface, Register, RenderChildren } from 'claude-code'

import type { PlanSection, Run, Snapshot } from '../types'
import { PIPELINE, focusIndex, itemState } from './parse'
import { bandRows } from './band'
import { base, build, hhmm, join, norm, pinKey, planKey, repoMain, type Io, type Pin } from './discover'

type $ = EngineInterface

const io = ($: $): Io => ({
  cwd: () => $.session.cwd(),
  get: key => $.store.get(key),
  read: p => $.fs.read(p),
  exists: p => $.fs.exists(p),
  stat: p => $.fs.stat(p),
  list: p => $.fs.list(p),
})

const PANE = 'progress-tracker'
const TITLE = 'Progress'
const snapRef = { plugin: 'progress-tracker', key: 'snap' } as const

let inFlight: Promise<void> | null = null
const refresh = ($: $) =>
  (inFlight ??= build(io($))
    .catch((err): Snapshot => ({ root: '', plan: null, run: null, others: [], at: hhmm(Date.now()), error: String(err) }))
    .then(async snap => { await $.state.set(snapRef, snap) })
    .finally(() => { inFlight = null }))

export const register: Register = (on, options) => {
  const isPane = options.display === 'pane'

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'progress-tracker',
      description: 'Open the progress pane. Args: <repo dir> or <plan.md> to pin, "reset" to unpin',
    })
    await refresh($)
    // fires again on reload, so flipping the Display option moves the view right away
    void (isPane ? $.ui.open({ id: PANE, title: TITLE }) : $.ui.close({ id: PANE }).catch(() => {}))
    // ponytail: 60s poll so lane workers / successor sessions show up between this session's turns
    $.clock.every(60_000, () => void refresh($))
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    void refresh($)
    return done
  })

  on('command.run', { command: 'progress-tracker' }, async ($, e) => {
    const arg = e.args.trim().replace(/^"(.*)"$/, '$1')
    const cwd = await $.session.cwd()
    let text = 'Progress pane opened.'
    if (arg === 'reset') {
      const main = await repoMain(io($), cwd)
      await $.store.delete(planKey(main))
      await $.store.delete(pinKey(cwd))
      text = 'Unpinned; auto-detecting the repo and plan doc again.'
    } else if (arg) {
      const p = join(cwd, arg)
      if (!(await $.fs.exists(p))) return { text: `Not found: ${p}` }
      if (/\.md$/i.test(p)) {
        // a plan doc pin covers the whole repo: every session and worktree of it
        const main = await repoMain(io($), cwd)
        await $.store.set(planKey(main), p)
        text = `Pinned plan doc for ${main} and all its worktrees: ${p}`
      } else {
        const pin = ((await $.store.get(pinKey(cwd))) ?? {}) as Pin
        await $.store.set(pinKey(cwd), { ...pin, root: p })
        text = `Pinned repo for this folder: ${p}`
      }
    }
    await refresh($)
    await $.ui.open({ id: PANE, title: TITLE })
    return { text }
  })

  // Band above the prompt: stacks over whatever the plugins beneath draw (e.g. token-weather).
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (isPane) return next(e)
    const { value: s } = await $.state.get(snapRef)
    const rows = s && !s.error && !e.props.hasSurvey ? bandRows(s).slice(0, Math.max(1, e.props.maxRows - 1)) : []
    if (rows.length === 0) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const beneath = await next(e)
    return (
      <Box flexDirection="column">
        {rows.map(row => (
          <Box>
            {row.map((seg, i) => (
              <Text wrap={i === row.length - 1 ? 'truncate-end' : undefined} color={seg.color} bold={seg.bold} dimColor={seg.dim}>{seg.text}</Text>
            ))}
          </Box>
        ))}
        {beneath}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const { value: s } = await $.state.get(snapRef)
    const T = (t: string, color?: string, extra: { bold?: boolean; dimColor?: boolean } = {}) => (
      <Text wrap="wrap" color={color} bold={extra.bold} dimColor={extra.dimColor}>{t}</Text>
    )
    // hanging indent: the lead (indent + status mark) keeps its column, wrapped rows line up under the text
    const L: Line = (lead, t, color, extra = {}) => (
      <Box>
        <Box flexShrink={0}><Text color={color} bold={extra.bold} dimColor={extra.dimColor}>{lead}</Text></Box>
        <Box flexShrink={1}>{T(t, color, extra)}</Box>
      </Box>
    )
    const W = (t: string, dim = false) => <Text wrap="wrap" dimColor={dim}>{t}</Text>
    const H = (t: string) => <Box marginTop={1}>{T(t, 'magenta', { bold: true })}</Box>

    if (!s) return <Box flexDirection="column">{T('Loading…', undefined, { dimColor: true })}</Box>
    if (s.error) return <Box flexDirection="column">{T('progress-tracker failed to read:', 'red')}{W(s.error, true)}</Box>
    const { run, plan } = s

    return (
      <Box flexDirection="column">
        <Box justifyContent="space-between">
          <Box flexShrink={1}>{T(run?.title || base(s.root) || 'No project', undefined, { bold: true })}</Box>
          <Button key="refresh" plain label="↻" onPress={() => void refresh($)} />
        </Box>
        {T([run && `run ${run.id}`, run?.session, run?.tier, `updated ${s.at}`].filter(Boolean).join(' · '), undefined, { dimColor: true })}
        {!run && !plan && W(`No .mab/ run or checklist plan doc found under ${s.root}. Pin one: /progress-tracker <repo dir | plan.md>`, true)}
        {run && renderNow(run, T, W, H, Box, Text)}
        {(run || s.others.length > 0) && renderSessions(run, s.others, T, W, H, L)}
        {run && run.chunks.length > 0 && renderChunks(run, L, H)}
        {plan && renderPlan(plan, s.root, T, H, L, Box, Text)}
      </Box>
    )
  })
}

type Txt = (t: string, color?: string, extra?: { bold?: boolean; dimColor?: boolean }) => RenderChildren
type Wrap = (t: string, dim?: boolean) => RenderChildren
type Head = (t: string) => RenderChildren
type Line = (lead: string, t: string, color?: string, extra?: { bold?: boolean; dimColor?: boolean }) => RenderChildren

const mark = (done: boolean, current: boolean) => (done ? '✓' : current ? '▶' : '○')
const tone = (done: boolean, current: boolean) => (done ? 'green' : current ? 'cyan' : undefined)

function renderNow(run: Run, T: Txt, W: Wrap, H: Head, Box: any, Text: any) {
  const p = PIPELINE[run.phase]
  const counts = run.openFindings.reduce<Record<string, number>>((m, s) => ({ ...m, [s]: (m[s] ?? 0) + 1 }), {})
  const findings = Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')
  return (
    <Box flexDirection="column">
      {H(run.phase === 7 ? 'NOW · run complete' : `NOW · phase ${run.phase} ${p?.name ?? '?'}`)}
      <Box flexWrap="wrap">
        {PIPELINE.map((ph, i) => (
          <Text color={tone(i < run.phase, i === run.phase)} bold={i === run.phase}>{`${mark(i < run.phase, i === run.phase)}${ph.name} `}</Text>
        ))}
      </Box>
      {p && (
        <Box flexWrap="wrap">
          {p.steps.map((st, i) => (
            <Text color={tone(i < run.substep, i === run.substep)} bold={i === run.substep}>{`${i ? ' → ' : '  '}${st}`}</Text>
          ))}
        </Box>
      )}
      {run.phaseText && W(run.phaseText, true)}
      {(run.round || run.chunk) && T([run.round && `round ${run.round}`, run.chunk && `chunk ${run.chunk}`].filter(Boolean).join(' · '))}
      {run.agents && run.agents !== 'none' && W(`agents: ${run.agents}`)}
      {run.next && W(`next: ${run.next}`)}
      {T(`open findings: ${findings || 'none'} · questions: ${run.questions || 'none'}`, run.openFindings.some(s => /CRIT|HIGH/.test(s)) ? 'red' : undefined, { dimColor: !findings })}
    </Box>
  )
}

function renderSessions(run: Run | null, others: string[], T: Txt, W: Wrap, H: Head, L: Line) {
  if (!run) return [H('OTHER RUNS (24h)'), ...others.map(o => L('· ', o, undefined, { dimColor: true }))]
  return [
    H('SESSIONS'),
    T(`${run.session || '?'} · orchestrator (STATE.md)`),
    run.held && W(`held: ${run.held}`, true),
    ...(run.lanes.length
      ? run.lanes.map(l => {
          const [m, c] = /^DONE|^RELEASED/i.test(l.status) ? ['✓', 'green'] : /^BLOCKED/i.test(l.status) ? ['✗', 'red'] : /^ACTIVE/i.test(l.status) ? ['▶', 'cyan'] : ['○', undefined]
          return L(`${m} `, [l.session || `lane ${l.id}`, l.status, l.progress, l.review && `review ${l.review}`, l.last].filter(Boolean).join(' · '), c)
        })
      : run.lanesLine && !/^none/i.test(run.lanesLine) ? [W(`lanes: ${run.lanesLine}`)] : []),
    ...run.recent.map(r => L('  · ', r, undefined, { dimColor: true })),
    ...(others.length ? [T('other runs (24h):'), ...others.map(o => L('  · ', o, o.includes('complete') ? 'green' : undefined))] : []),
  ]
}

function renderChunks(run: Run, L: Line, H: Head) {
  const done = run.chunks.filter(c => c.status === 'done').length
  return [
    H(`THIS RUN · chunks ${done}/${run.chunks.length}`),
    ...run.chunks.map(c => L(`${mark(c.status === 'done', c.status === 'active')} `, `${c.id}${c.steps ? ` (steps ${c.steps})` : ''}${c.lane ? ` · ${c.lane}` : ''}`, tone(c.status === 'done', c.status === 'active'))),
  ]
}

const STATE_LOOK = {
  done: { mark: '✓', color: 'green', label: 'done' },
  current: { mark: '▶', color: 'cyan', label: 'in progress' },
  built: { mark: '◐', color: 'yellow', label: 'built, not ticked' },
  paused: { mark: '‖', color: 'magenta', label: 'paused' },
  todo: { mark: '○', color: undefined, label: 'to do' },
} as const

function renderPlan(plan: NonNullable<Snapshot['plan']>, root: string, T: Txt, H: Head, L: Line, Box: any, Text: any) {
  const cur = new Set(plan.current)
  const bld = new Set(plan.built)
  const pau = new Set(plan.paused ?? [])
  const all = plan.sections.flatMap(s => s.items)
  const count = (items: typeof all, st: string) => items.filter(i => itemState(i, cur, bld, pau) === st).length
  const tally = (items: typeof all) =>
    [count(items, 'current') && `${count(items, 'current')} in progress`, count(items, 'built') && `${count(items, 'built')} built`, count(items, 'paused') && `${count(items, 'paused')} paused`]
      .filter(Boolean).map(t => ` · ${t}`).join('')
  const rel = norm(plan.path).startsWith(`${norm(root)}/`) ? norm(plan.path).slice(norm(root).length + 1) : plan.path
  const focus = focusIndex(plan.sections, cur, bld, pau)
  return [
    H(`PLAN · ${count(all, 'done')}/${all.length} done${tally(all)}`),
    T(rel, undefined, { dimColor: true }),
    <Box flexWrap="wrap" columnGap={2}>
      {Object.values(STATE_LOOK).map(l => <Text color={l.color}>{`${l.mark} ${l.label}`}</Text>)}
    </Box>,
    ...plan.sections.flatMap((s: PlanSection, i) => {
      const done = count(s.items, 'done')
      const complete = done === s.items.length
      const look = complete ? STATE_LOOK.done : i === focus ? STATE_LOOK.current : done + count(s.items, 'built') === s.items.length ? STATE_LOOK.built : count(s.items, 'paused') && done + count(s.items, 'built') + count(s.items, 'paused') === s.items.length ? STATE_LOOK.paused : STATE_LOOK.todo
      const head = L(`${look.mark} `, `${s.heading || '(untitled)'}  ${done}/${s.items.length}${tally(s.items)}`, look.color, { bold: i === focus })
      // a finished section folds to its header; any other shows every item, done ones included
      if (complete) return [head]
      return [head, ...s.items.flatMap(x => {
        const st = itemState(x, cur, bld, pau)
        const detail = plan.details[x.id]
        const line = L(`   ${STATE_LOOK[st].mark} `, `${x.text}${st === 'built' && !detail ? '  (built, not ticked)' : ''}`, STATE_LOOK[st].color, { dimColor: st === 'done' })
        return detail ? [line, L('       ', detail, undefined, { dimColor: true })] : [line]
      })]
    }),
  ]
}
