import { expect, test } from 'claude-code/testing'

import { liveRun, newestIn, withWorktreeActivity, type Io } from './discover'
import { laneViews, type RunFiles } from './lanes'

const MIN = 60_000
const NOW = Date.parse('2026-10-07T03:00:00Z')

// An in-memory tree: a path with `text` (or `mtime`) is a file; every ancestor is a folder.
function fakeFs(files: Record<string, { mtime: number; text?: string }>) {
  const calls = { list: 0 }
  const dirs = new Set<string>()
  for (const p of Object.keys(files)) for (let d = p.replace(/\/[^/]*$/, ''); d; d = d.replace(/\/[^/]*$/, '')) dirs.add(d)
  const io: Io = {
    read: async p => {
      const f = files[p]
      if (!f) throw new Error(`ENOENT ${p}`)
      return f.text ?? ''
    },
    exists: async p => p in files || dirs.has(p),
    stat: async p => {
      if (p in files) return { kind: 'file', size: 1, mtimeMs: files[p]!.mtime, isLink: false }
      if (dirs.has(p)) return { kind: 'dir', size: 0, mtimeMs: 0, isLink: false }
      throw new Error(`ENOENT ${p}`)
    },
    list: async dir => {
      calls.list += 1
      if (!dirs.has(dir)) throw new Error(`ENOENT ${dir}`)
      const names = new Map<string, 'file' | 'dir'>()
      for (const p of [...Object.keys(files), ...dirs]) {
        if (!p.startsWith(`${dir}/`)) continue
        const [name, ...rest] = p.slice(dir.length + 1).split('/')
        names.set(name!, rest.length || dirs.has(p) ? 'dir' : 'file')
      }
      return [...names].map(([name, kind]) => ({ name, kind, size: 1, mtimeMs: kind === 'file' ? files[`${dir}/${name}`]!.mtime : 0, isLink: false }))
    },
  }
  return { io, calls }
}

test('worktree walk: newest file, skipping node_modules/.git/build, to two folders down', async () => {
  const { io } = fakeFs({
    '/wt/README.md': { mtime: NOW - 90 * MIN },
    '/wt/tests/phase6/test_x.py': { mtime: NOW - 5 * MIN },
    '/wt/node_modules/pkg/index.js': { mtime: NOW - MIN },
    '/wt/build/out.js': { mtime: NOW - MIN },
    '/wt/.git/index': { mtime: NOW - MIN },
    '/wt/a/b/c/deep.py': { mtime: NOW - MIN }, // three folders down: past the walk
    '/wt/src/future.py': { mtime: NOW + 600 * MIN },
  })
  expect(await newestIn(io, '/wt', NOW)).toBe(NOW - 5 * MIN)
  expect(await newestIn(io, '/wt', NOW, { maxDepth: 2, maxDirs: 1 })).toBe(NOW - 90 * MIN) // the cap stops the walk
})

const laneText = (worktree: string) => `# Lane A
- Session: W-A            Session title: MAB W-A
- Status: ACTIVE chunk A2
- Worktree: yes -> ${worktree}   Branch: mab/x-A`

const runAt = (dir: string, text: string): RunFiles => ({
  id: 'r1', dir, state: '- This session: O2', stateMtime: NOW, events: '',
  lanes: [{ name: 'A.md', text, mtime: NOW - 60 * MIN }],
})

test('a lane quiet on paper but busy in its worktree is not stalled', async () => {
  const { io } = fakeFs({ '/work/wt1/skills/x/handler.py': { mtime: NOW - 3 * MIN } })
  const run = runAt('/repo/.mab/runs/r1', laneText('/work/wt1'))
  expect(laneViews(run, NOW, 20 * MIN)[0]!.stalled).toBe(true)
  const refined = await withWorktreeActivity(io, run, NOW, 20 * MIN)
  expect(refined.extra).toEqual({ 'W-A': NOW - 3 * MIN })
  expect(laneViews(refined, NOW, 20 * MIN)[0]!.stalled).toBe(false)
})

test("a linked worktree's git index counts (git add, commit)", async () => {
  const { io } = fakeFs({
    '/work/wt2/.git': { mtime: NOW - 300 * MIN, text: 'gitdir: /main/.git/worktrees/work/wt2\n' },
    '/main/.git/worktrees/work/wt2/index': { mtime: NOW - 4 * MIN },
  })
  const refined = await withWorktreeActivity(io, runAt('/repo/.mab/runs/r2', laneText('/work/wt2')), NOW, 20 * MIN)
  expect(refined.extra?.['W-A']).toBe(NOW - 4 * MIN)
})

test('the worktree comes from PLAN.md when the lane file has none; walks are cached', async () => {
  const { io, calls } = fakeFs({
    '/repo/.mab/runs/r3/PLAN.md': { mtime: NOW, text: '| W-A | worker | lane A | A1 | /work/wt3 | briefs/W-A.md |' },
    '/work/wt3/x.py': { mtime: NOW - 30 * MIN },
  })
  const run = runAt('/repo/.mab/runs/r3', laneText('').replace(/- Worktree:.*/, ''))
  expect((await withWorktreeActivity(io, run, NOW, 20 * MIN)).extra?.['W-A']).toBe(NOW - 30 * MIN)
  const listed = calls.list
  await withWorktreeActivity(io, run, NOW + MIN, 20 * MIN) // still stalled, walked a minute ago: reuse
  expect(calls.list).toBe(listed)
  await withWorktreeActivity(io, run, NOW + 6 * MIN, 20 * MIN) // past the re-walk interval
  expect(calls.list).toBeGreaterThan(listed)
})

test('lanes nobody suspects are never walked', async () => {
  const { io, calls } = fakeFs({ '/work/wt4/x.py': { mtime: NOW } })
  const run = { ...runAt('/repo/.mab/runs/r4', laneText('/work/wt4')), lanes: [{ name: 'A.md', text: laneText('/work/wt4'), mtime: NOW - MIN }] }
  expect(await withWorktreeActivity(io, run, NOW, 20 * MIN)).toBe(run)
  expect(calls.list).toBe(0)
})

test('liveRun reads JOURNAL.md and the gate logs (gates/ and the lanes folder) with the lanes', async () => {
  const R = '/repo/.mab/runs/20261007-1000-x'
  const { io } = fakeFs({
    [`${R}/STATE.md`]: { mtime: NOW - MIN, text: '- Run id: 20261007-1000-x\n- Phase: 4 — implement' },
    [`${R}/events.jsonl`]: { mtime: NOW - MIN, text: '' },
    [`${R}/JOURNAL.md`]: { mtime: NOW - 2 * MIN, text: '- 10:00 W-A started' },
    [`${R}/lanes/A.md`]: { mtime: NOW - 60 * MIN, text: laneText('/wt') },
    [`${R}/lanes/lane-A.ids`]: { mtime: NOW - 7 * MIN },
    [`${R}/gates/lane-A-console.txt`]: { mtime: NOW - 6 * MIN },
  })
  const run = (await liveRun(io, '/repo', NOW))!
  expect([run.id, run.lanes.length, run.journal, run.journalMtime]).toEqual(['20261007-1000-x', 1, '- 10:00 W-A started', NOW - 2 * MIN])
  expect(run.gates?.map(g => g.name).sort()).toEqual(['lane-A-console.txt', 'lane-A.ids'])
  expect(laneViews(run, NOW, 20 * MIN)[0]!.idleMin).toBe(6)
})
