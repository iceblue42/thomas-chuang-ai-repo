// Finds the repo's MAB runs (across every git worktree) and its plan doc, and builds the snapshot the views draw.
import type { FsEntry, FsStat } from 'claude-code'

import type { PlanSection, Run, Snapshot } from '../types'
import {
  PIPELINE, chunkRows, countItems, coveredItems, describeEvent, field, mdRefs,
  mergeTicks, openFindings, parseEvents, parseLane, parsePlanDoc, phaseOf, statusRows,
} from './parse'

/** What discovery needs from the engine; register.tsx builds it from `$` (which may not cross an import). */
export type Io = {
  cwd: () => Promise<string>
  get: (key: string) => Promise<unknown>
  read: (path: string) => Promise<string>
  exists: (path: string) => Promise<boolean>
  stat: (path: string) => Promise<FsStat>
  list: (path: string) => Promise<FsEntry[]>
}

export const join = (a: string, b: string) => (/^([a-zA-Z]:)?[\\/]/.test(b) ? b : `${a.replace(/[\\/]+$/, '')}/${b}`)
const parent = (p: string) => p.replace(/[\\/]+$/, '').replace(/[\\/][^\\/]*$/, '')
export const base = (p: string) => p.replace(/^.*[\\/]/, '')
export const tryRead = (io: Io, p: string) => io.read(p).catch(() => '')
export const pinKey = (cwd: string) => `pin:${cwd}` // repo dir pinned for a session folder
export const planKey = (mainRoot: string) => `plan:${mainRoot}` // plan doc pinned for a whole repo
export type Pin = { root?: string; plan?: string }

export const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '')
const DAY = 864e5
export const hhmm = (ms: number) => new Date(ms).toTimeString().slice(0, 5)
const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

// Nearest ancestor holding `.mab/` or `.git` (worktrees under <repo>/.claude/worktrees resolve to the main repo).
async function findRoot(io: Io, start: string) {
  for (let dir = start, i = 0; i < 40; i++) {
    if ((await io.exists(join(dir, '.mab'))) || (await io.exists(join(dir, '.git')))) return dir
    const up = parent(dir)
    if (!up || up === dir) return null
    dir = up
  }
  return null
}

// Every checkout of the repo: the main one plus each `git worktree` (read from .git/worktrees/*/gitdir),
// since MAB runs often live in a sibling worktree (e.g. E:\Claude\EVI-p1a).
async function checkouts(io: Io, root: string) {
  let gitDir = join(root, '.git')
  const st = await io.stat(gitDir).catch(() => null)
  if (!st) return [norm(root)]
  if (st.kind === 'file') {
    const linked = /gitdir:\s*(.+)/.exec(await tryRead(io, gitDir))?.[1]?.trim()
    if (!linked) return [norm(root)]
    gitDir = parent(parent(linked)) // <main>/.git/worktrees/<name> -> <main>/.git
  }
  const roots = [parent(gitDir)]
  const wtDir = join(gitDir, 'worktrees')
  for (const w of await io.list(wtDir).catch(() => [])) {
    const g = (await tryRead(io, join(join(wtDir, w.name), 'gitdir'))).trim()
    if (g) roots.push(parent(g))
  }
  return [...new Set([...roots, root].map(norm))] // main checkout first
}

/** The main checkout of the repo the session folder belongs to: the key a plan-doc pin is stored under. */
export async function repoMain(io: Io, cwd: string) {
  const pin = ((await io.get(pinKey(cwd))) ?? {}) as Pin
  const root = norm(pin.root ?? (await findRoot(io, cwd)) ?? cwd)
  return (await checkouts(io, root))[0]!
}

type RunRef = { dir: string; root: string; mtime: number }
// Runs across checkouts, newest STATE.md first: .mab/runs/<id>/ (v1.1+ layout), else .mab/ itself.
async function listRuns(io: Io, roots: string[]) {
  const out: RunRef[] = []
  for (const root of roots) {
    const mab = join(root, '.mab')
    const runsDir = join(mab, 'runs')
    const dirs = (await io.list(runsDir).catch(() => [])).filter(r => r.kind === 'dir').map(r => join(runsDir, r.name))
    for (const dir of dirs.length ? dirs : [mab]) {
      const st = await io.stat(join(dir, 'STATE.md')).catch(() => null)
      if (st) out.push({ dir, root, mtime: st.mtimeMs })
    }
  }
  return out.sort((a, b) => b.mtime - a.mtime)
}

type Candidate = { path: string; rel: string; n: number; sections: PlanSection[]; md: string }

async function readDoc(io: Io, path: string, rel: string): Promise<Candidate> {
  const md = await tryRead(io, path)
  const sections = parsePlanDoc(md)
  return { path, rel, n: countItems(sections), sections, md }
}

// Plan-doc candidates: the checklist docs runs name, looked up in every checkout that has runs (EVI's
// EVI-AUTONOMY-BRIEF.md is untracked, so it exists only in the main checkout). The live run's own docs win;
// a run naming none inherits the docs all recent runs name.
async function planCandidates(io: Io, primaryText: string, allTexts: string[], roots: string[]) {
  const lookup = async (rels: string[]) => {
    const found: Candidate[] = []
    for (const rel of rels) {
      for (const r of roots) {
        const doc = await readDoc(io, join(r, rel), rel)
        if (doc.n > 2) found.push(doc)
      }
    }
    return found
  }
  const own = await lookup(mdRefs(primaryText).slice(0, 20))
  return own.length ? own : lookup([...new Set(allTexts.flatMap(t => mdRefs(t).slice(0, 20)))])
}

// Most items wins; on a tie the shallower, shorter path (the root copy over docs/plans/…).
export const pickPlan = <C extends { rel: string; n: number }>(cs: C[]) =>
  [...cs].sort((a, b) => b.n - a.n || a.rel.split('/').length - b.rel.split('/').length || a.rel.length - b.rel.length)[0]

// Last resort when no run names a checklist: the top-level *.md with the most items.
async function scanRoot(io: Io, root: string) {
  let best: Candidate | undefined
  const files = (await io.list(root).catch(() => [])).filter(f => f.kind === 'file' && /\.md$/i.test(f.name) && f.size < 2e6)
  for (const f of files) {
    const doc = await readDoc(io, join(root, f.name), f.name)
    if (doc.n > 2 && doc.n > (best?.n ?? 0)) best = doc
  }
  return best
}

// Copies of the same doc share most item keys; only those lend their ticks.
const keys = (s: PlanSection[]) => new Set(s.flatMap(x => x.items).map(i => i.id || i.text))
const sameDoc = (a: PlanSection[], b: PlanSection[]) => {
  const ka = keys(a)
  const shared = [...keys(b)].filter(k => ka.has(k)).length
  return shared >= ka.size / 2
}

type RunRead = { run: Run; text: string; title: string; planText: string }
async function readRun(io: Io, runDir: string): Promise<RunRead> {
  const [state = '', plan = '', ev = '', findings = ''] = await Promise.all(
    ['STATE.md', 'PLAN.md', 'events.jsonl', 'FINDINGS.md'].map(f => tryRead(io, join(runDir, f))),
  )
  const events = parseEvents(ev)
  const laneDir = join(runDir, 'lanes')
  const laneFiles = (await io.list(laneDir).catch(() => [])).filter(f => f.kind === 'file' && f.name.endsWith('.md'))
  const lanes = await Promise.all(laneFiles.map(async f => parseLane(await tryRead(io, join(laneDir, f.name)))))
  const { phase, phaseText, substep } = phaseOf(state, events)
  const title = (/^#\s*(.*)/m.exec(state)?.[1] ?? '').replace(/^MAB\s*[—–-]\s*/, '') || (/^#\s*(.*)/m.exec(plan)?.[1] ?? '')
  const run: Run = {
    id: field(state, 'Run id') || base(runDir),
    title,
    session: field(state, 'This session'),
    tier: field(state, 'Tier'),
    phase, phaseText, substep,
    round: field(state, 'Round'),
    chunk: field(state, 'Chunk'),
    agents: field(state, 'Active agents'),
    next: field(state, 'Next action'),
    questions: field(state, 'Open questions'),
    held: field(state, 'Held sessions'),
    lanesLine: field(state, 'Lanes'),
    lanes,
    chunks: chunkRows(plan, events, lanes, phase === 7),
    openFindings: openFindings(findings),
    recent: events.slice(-6).map(describeEvent),
  }
  return { run, text: `${state}\n${plan}`, title, planText: plan }
}

const otherLine = (r: Run, ref: RunRef, primaryRoot: string) =>
  [
    short(r.title || r.id, 50),
    r.phase === 7 ? 'complete' : `phase ${r.phase} ${PIPELINE[r.phase]?.name ?? '?'}`,
    r.session.split(/\s/)[0],
    hhmm(ref.mtime),
    ref.root !== primaryRoot ? base(ref.root) : '',
  ].filter(Boolean).join(' · ')

export async function build(io: Io): Promise<Snapshot> {
  const cwd = await io.cwd()
  const pin = ((await io.get(pinKey(cwd))) ?? {}) as Pin
  const root = norm(pin.root ?? (await findRoot(io, cwd)) ?? cwd)
  const roots = await checkouts(io, root)
  const pinnedPlan = ((await io.get(planKey(roots[0]!))) as string | undefined) ?? pin.plan
  const now = Date.now()
  // ponytail: re-reads every run touched in the last 14 days each refresh; narrow the window if it gets slow
  const refs = (await listRuns(io, roots)).filter((r, i) => i === 0 || now - r.mtime < 14 * DAY)
  const reads = await Promise.all(refs.map(r => readRun(io, r.dir)))
  // "Now" is the newest run still in progress (touched within a day), else the newest run.
  const live = reads.findIndex((r, i) => r.run.phase !== 7 && now - refs[i]!.mtime < DAY)
  const pi = live >= 0 ? live : 0
  const primary = reads[pi]
  const primaryRoot = refs[pi]?.root ?? root

  const runRoots = [...new Set([roots[0]!, primaryRoot, ...refs.map(r => r.root)])]
  const found = await planCandidates(io, primary?.text ?? '', reads.map(r => r.text), runRoots)
  const pinned = pinnedPlan ? found.find(c => norm(c.path) === norm(pinnedPlan)) : undefined
  const chosen: Candidate | undefined = pinnedPlan
    ? pinned ?? (await readDoc(io, pinnedPlan, base(pinnedPlan)))
    : pickPlan(found) ?? (await scanRoot(io, primaryRoot))
  const planPath = chosen?.path ?? ''
  // Ticks land in whichever copy / checkout a run edits, so copies of the same doc lend their ticks.
  const copies = chosen ? found.filter(c => c !== chosen && sameDoc(chosen.sections, c.sections)) : []
  const ticked = chosen ? mergeTicks(chosen.sections, copies.map(c => c.sections)) : []

  // Run coverage first (a complete run's items are built, a live run's current) ...
  const current = new Set<string>()
  const built = new Set<string>()
  const paused = new Set<string>()
  reads.forEach(r => coveredItems(ticked, r.title, r.planText).forEach(id => (r.run.phase === 7 ? built : current).add(id)))
  // ... then the orchestrator's status table, from the most recently written copy, overrides it.
  const stamped = await Promise.all((chosen ? [chosen, ...copies] : []).map(async c => ({ c, t: (await io.stat(c.path).catch(() => null))?.mtimeMs ?? 0 })))
  const status = statusRows(stamped.sort((a, b) => b.t - a.t)[0]?.c.md ?? '')
  for (const [id, { state }] of Object.entries(status)) {
    current.delete(id)
    built.delete(id)
    if (state === 'current') current.add(id)
    if (state === 'built') built.add(id)
    if (state === 'paused') paused.add(id)
  }
  const sections = ticked.map(s => ({ ...s, items: s.items.map(i => ({ ...i, done: i.done || status[i.id]?.state === 'done' })) }))
  const details = Object.fromEntries(Object.entries(status).flatMap(([id, v]) => (v.detail && (v.state === 'current' || v.state === 'built' || v.state === 'paused') ? [[id, v.detail]] : [])))

  return {
    root: primaryRoot,
    plan: planPath ? { path: planPath, sections, current: [...current], built: [...built].filter(id => !current.has(id)), paused: [...paused], details } : null,
    run: primary?.run ?? null,
    others: reads.flatMap((r, i) => (i !== pi && now - refs[i]!.mtime < DAY ? [otherLine(r.run, refs[i]!, primaryRoot)] : [])),
    at: hhmm(now),
  }
}

