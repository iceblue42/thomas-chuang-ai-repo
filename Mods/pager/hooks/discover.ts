// Finds this repo's live MAB run across every git worktree (approach from progress-tracker/hooks/discover.ts).
import type { FsEntry, FsStat } from 'claude-code'

import { isComplete, laneId, laneViews, parseEvents, worktreeOf, type RunFiles } from './lanes'

/** What discovery needs from the engine; register.ts builds it from `$` (which may not cross an import). */
export type Io = {
  read: (path: string) => Promise<string>
  exists: (path: string) => Promise<boolean>
  stat: (path: string) => Promise<FsStat>
  list: (path: string) => Promise<FsEntry[]>
}

const DAY = 864e5
export const join = (a: string, b: string) => (/^([a-zA-Z]:)?[\\/]/.test(b) ? b : `${a.replace(/[\\/]+$/, '')}/${b}`)
const parent = (p: string) => p.replace(/[\\/]+$/, '').replace(/[\\/][^\\/]*$/, '')
export const base = (p: string) => p.replace(/^.*[\\/]/, '')
const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '')
const tryRead = (io: Io, p: string) => io.read(p).catch(() => '')
const mtime = (io: Io, p: string) => io.stat(p).then(s => s.mtimeMs, () => 0)

// Nearest ancestor holding `.mab/` or `.git`.
async function findRoot(io: Io, start: string) {
  for (let dir = start, i = 0; i < 40; i++) {
    if ((await io.exists(join(dir, '.mab'))) || (await io.exists(join(dir, '.git')))) return dir
    const up = parent(dir)
    if (!up || up === dir) return null
    dir = up
  }
  return null
}

// The main checkout plus each `git worktree` (from .git/worktrees/*/gitdir): runs often live in a sibling worktree.
async function checkouts(io: Io, root: string) {
  let gitDir = join(root, '.git')
  const st = await io.stat(gitDir).catch(() => null)
  if (!st) return [norm(root)]
  if (st.kind === 'file') {
    const linked = /gitdir:\s*(.+)/.exec(await tryRead(io, gitDir))?.[1]?.trim()
    if (!linked) return [norm(root)]
    gitDir = parent(parent(linked))
  }
  const roots = [parent(gitDir)]
  const wtDir = join(gitDir, 'worktrees')
  for (const w of await io.list(wtDir).catch(() => [])) {
    const g = (await tryRead(io, join(join(wtDir, w.name), 'gitdir'))).trim()
    if (g) roots.push(parent(g))
  }
  return [...new Set([...roots, root].map(norm))]
}

type Ref = { dir: string; mtime: number }
// .mab/runs/<id>/ (v1.1+), else .mab/ itself; newest STATE.md first.
async function listRuns(io: Io, roots: string[]) {
  const out: Ref[] = []
  for (const root of roots) {
    const mab = join(root, '.mab')
    const runsDir = join(mab, 'runs')
    const dirs = (await io.list(runsDir).catch(() => [])).filter(r => r.kind === 'dir').map(r => join(runsDir, r.name))
    for (const dir of dirs.length ? dirs : [mab]) {
      const m = await mtime(io, join(dir, 'STATE.md'))
      if (m) out.push({ dir, mtime: m })
    }
  }
  return out.sort((a, b) => b.mtime - a.mtime)
}

/** The newest run not complete and touched within a day, with its lane files; null when none. */
export async function liveRun(io: Io, cwd: string, now: number): Promise<RunFiles | null> {
  const root = await findRoot(io, cwd)
  if (!root) return null
  const refs = (await listRuns(io, await checkouts(io, root))).slice(0, 6)
  for (const ref of refs) {
    const evPath = join(ref.dir, 'events.jsonl')
    const touched = Math.max(ref.mtime, await mtime(io, evPath))
    if (now - touched > DAY) continue
    const [state, events] = await Promise.all([tryRead(io, join(ref.dir, 'STATE.md')), tryRead(io, evPath)])
    if (isComplete(state, parseEvents(events))) continue
    const laneDir = join(ref.dir, 'lanes')
    const laneEntries = await io.list(laneDir).catch(() => [])
    const files = laneEntries.filter(f => f.kind === 'file' && /\.md$/i.test(f.name))
    const lanes = await Promise.all(
      files.map(async f => ({ name: f.name, text: await tryRead(io, join(laneDir, f.name)), mtime: await mtime(io, join(laneDir, f.name)) })),
    )
    const id = /Run id:\s*(\S+)/.exec(state)?.[1] ?? base(ref.dir)
    if (!lanes.length) return { id, dir: ref.dir, state, stateMtime: ref.mtime, events, lanes }
    // the listing carries each file's mtime, so gate logs cost one call per directory
    const gateEntries = await io.list(join(ref.dir, 'gates')).catch(() => [])
    const gates = [...gateEntries, ...laneEntries.filter(f => !/\.md$/i.test(f.name))]
      .filter(f => f.kind === 'file')
      .map(f => ({ name: f.name, mtime: f.mtimeMs }))
    const jPath = join(ref.dir, 'JOURNAL.md')
    const [journal, journalMtime] = await Promise.all([tryRead(io, jPath), mtime(io, jPath)])
    return { id, dir: ref.dir, state, stateMtime: ref.mtime, events, lanes, journal, journalMtime, gates }
  }
  return null
}

// Heavy or generated folders: never walked.
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '__pycache__', '.venv', 'venv', '.tox', 'target', '.next'])
export const WALK = { maxDepth: 2, maxDirs: 150 }

/** Newest file mtime under `root`, breadth first to `maxDepth` folders down, listing at most `maxDirs` folders. */
export async function newestIn(io: Io, root: string, now: number, limits = WALK) {
  let newest = 0
  let listed = 0
  let level = [root]
  for (let depth = 0; depth <= limits.maxDepth && level.length; depth++) {
    const next: string[] = []
    for (const dir of level) {
      if (listed++ >= limits.maxDirs) return newest
      for (const e of await io.list(dir).catch(() => [])) {
        if (e.kind === 'file' && e.mtimeMs <= now + 5 * 60_000) newest = Math.max(newest, e.mtimeMs)
        else if (e.kind === 'dir' && !SKIP.has(e.name)) next.push(join(dir, e.name))
      }
    }
    level = next
  }
  return newest
}

/** A linked worktree's own git index and HEAD log (`git add`, commits) in the main repo's .git/worktrees/<name>/. */
async function gitActivity(io: Io, root: string) {
  const linked = /gitdir:\s*(.+)/.exec(await tryRead(io, join(root, '.git')))?.[1]?.trim()
  const gitDir = linked ? join(root, linked) : join(root, '.git')
  const times = await Promise.all(['index', 'logs/HEAD'].map(p => mtime(io, join(gitDir, p))))
  return Math.max(0, ...times)
}

// Per lane (run dir + lane id): its worktree path, and the last walk's result.
type Walked = { path?: string; at: number; newest: number }
const walked = new Map<string, Walked>()
const RE_WALK_MS = 5 * 60_000

/**
 * Fills `run.extra` with each looks-stalled lane's newest worktree activity (its files, its git index).
 * Only lanes the cheap signals call stalled are walked; a walk is reused while it still covers the
 * stall window, and a lane that stays quiet is walked at most every 5 minutes.
 */
export async function withWorktreeActivity(io: Io, run: RunFiles, now: number, stallMs: number): Promise<RunFiles> {
  const suspects = new Set(laneViews(run, now, stallMs).filter(v => v.stalled).map(v => v.id))
  if (!suspects.size) return run
  const extra: Record<string, number> = { ...run.extra }
  let plan: string | undefined
  for (const f of run.lanes) {
    const id = laneId(f)
    if (!suspects.has(id)) continue
    const key = `${run.dir}|${id}`
    const prev = walked.get(key)
    if (prev && (now - prev.newest < stallMs || now - prev.at < RE_WALK_MS)) {
      extra[id] = prev.newest
      continue
    }
    let path = prev?.path ?? worktreeOf(f)
    if (!path) {
      plan ??= await tryRead(io, join(run.dir, 'PLAN.md'))
      path = worktreeOf(f, plan, await tryRead(io, join(join(run.dir, 'briefs'), `${id}.md`)))
    }
    const newest = path ? Math.max(await newestIn(io, path, now), await gitActivity(io, path)) : 0
    walked.set(key, { path, at: now, newest })
    extra[id] = newest
  }
  return { ...run, extra }
}
