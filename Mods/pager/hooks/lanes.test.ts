import { expect, test } from 'claude-code/testing'

import {
  describe, eventTime, gateActivity, isComplete, isNewEpisode, isTerminal, journalActivity, laneKind, laneViews, markEpisode, mentionRe,
  orchestratorView, parseEvents, pruneEpisodes, runLabel, stateDoneLanes, statusLine, worktreeOf, type Episodes, type RunFiles,
} from './lanes'

const MIN = 60_000
const NOW = Date.parse('2026-10-07T03:00:00Z')

const lane = (session: string, status: string) => `# Lane ${session.slice(-1)}
- Session: ${session}            Session title: MAB ${session} · EVI p1a
- Status: ${status}
- Chunks: A1, A2
- Last update: 10:40 by ${session}`

const RUN: RunFiles = {
  id: '20261006-1708-autonomy-p1a',
  dir: 'E:/Claude/EVI-p1a/.mab/runs/20261006-1708-autonomy-p1a',
  state: `# MAB — EVI — p1a
- Run id: 20261006-1708-autonomy-p1a        Mode: full   Tier: high-risk
- This session: O2 (on activation)   Orchestrator: desktop session "MAB O2 · EVI p1a"
- Phase: 4 — implement   Round: 1/3`,
  stateMtime: NOW - 3 * MIN,
  events: [
    '{"t":"2026-10-07T02:58:00Z","session":"W-A","type":"chunk_done","chunk":"A1"}',
    '{"ts":"2026-10-07T02:30:00Z","event":"lane_status","lane":"W-B","status":"ACTIVE","by":"W-B"}',
    'not json',
    '{"t":"2026-10-07T02:59:00Z","session":"O2","type":"lane_status","lane":"W-B","status":"ACTIVE"}',
  ].join('\n'),
  lanes: [
    { name: 'W-B.md', text: lane('W-B', 'ACTIVE chunk B2'), mtime: NOW - 40 * MIN },
    { name: 'W-A.md', text: lane('W-A', 'ACTIVE chunk A2'), mtime: NOW - 30 * MIN },
    { name: 'W-C.md', text: lane('W-C', 'HOLDING'), mtime: NOW - 300 * MIN },
    { name: 'W-D.md', text: lane('W-D', 'DONE abc123'), mtime: NOW - 300 * MIN },
  ],
}

test('events: both MAB shapes parse, bad lines skipped, both time fields read', () => {
  const ev = parseEvents(RUN.events)
  expect(ev.length).toBe(3)
  expect(eventTime(ev[1]!)).toBe(Date.parse('2026-10-07T02:30:00Z'))
  expect(eventTime({})).toBe(0)
})

test('lane activity is the newest of lane file mtime and the lane session own events', () => {
  const vs = laneViews(RUN, NOW, 20 * MIN)
  expect(vs.map(v => [v.id, v.kind, v.idleMin, v.stalled])).toEqual([
    ['W-A', 'active', 2, false], // its own event 2m ago beats the 30m-old lane file
    ['W-B', 'active', 30, true], // O2's event about W-B does not count as W-B's activity
    ['W-C', 'holding', 300, false], // holding waits for ACTIVATE by design
    ['W-D', 'done', 300, false],
  ])
})

test('stall threshold is configurable', () => {
  expect(laneViews(RUN, NOW, 45 * MIN).some(v => v.stalled)).toBe(false)
})

test('lane kinds from Status', () => {
  expect(['DONE abc', 'RELEASED (merged)', 'HOLDING', 'PLANNED', 'BLOCKED cap hit', 'ACTIVE chunk 2', 'ACTIVATE-PENDING', ''].map(laneKind))
    .toEqual(['done', 'done', 'holding', 'holding', 'blocked', 'active', 'active', 'active'])
})

test('orchestrator from STATE, done once the run completes', () => {
  const o = orchestratorView(RUN, NOW, 20 * MIN)!
  expect([o.id, o.kind, o.idleMin]).toEqual(['O2', 'active', 1])
  const done = { ...RUN, state: RUN.state.replace('Phase: 4 — implement', 'Phase: COMPLETE 23:11') }
  expect(orchestratorView(done, NOW, 20 * MIN)!.kind).toBe('done')
  expect(isComplete('', [{ type: 'run_complete' }])).toBe(true)
  expect(orchestratorView({ ...RUN, state: '- This session: none' }, NOW, 20 * MIN)).toBe(null)
})

test('status line', () => {
  const vs = [orchestratorView(RUN, NOW, 20 * MIN)!, ...laneViews(RUN, NOW, 20 * MIN)]
  expect(statusLine(runLabel(RUN.id), vs, ['away'])).toBe('MAB autonomy-p1a · O2 ▶ 1m · W-A ▶ 2m · W-B ⚠ 30m · W-C ⏸ · W-D ✓ · away')
  expect(statusLine(null, [], ['away'])).toBe('away')
  expect(statusLine(null, [], [])).toBe(undefined)
})

// --- A: finished lanes ---

test('terminal lane statuses: DONE, MERGED, RELEASED in any case, as the leading word', () => {
  expect(['MERGED a1b2', 'released by O3', 'DONE-FIX ebdf3084 (merged) — HOLDING', '✅ RELEASED', 'Done'].map(laneKind))
    .toEqual(['done', 'done', 'done', 'done', 'done'])
  expect(['ACTIVE (rework after DONE)', 'IMPLEMENTING A2'].map(isTerminal)).toEqual([false, false])
})

const idle = (status: string, extra: Partial<RunFiles> = {}): RunFiles => ({
  ...RUN,
  events: '',
  lanes: [{ name: 'A.md', text: lane('W-A', status), mtime: NOW - 300 * MIN }],
  ...extra,
})

test('a lane whose latest lane_status event is terminal is done, never stalled, shown ✓', () => {
  const run = idle('ACTIVE chunk A2', {
    events: [
      '{"ts":"2026-10-07T01:00:00Z","event":"lane_status","session":"W-A","lane":"A","status":"ACTIVE"}',
      '{"t":"2026-10-07T02:00:00Z","session":"O2","type":"lane_status","lane":"W-A","status":"RELEASED"}',
    ].join('\n'),
  })
  const [v] = laneViews(run, NOW, 20 * MIN)
  expect([v!.kind, v!.stalled, v!.status]).toEqual(['done', false, 'RELEASED'])
  expect(describe(v!)).toBe('W-A ✓')
  // a later ACTIVE event (lane reopened) wins over an older RELEASED one
  const reopened = { ...run, events: `${run.events}\n{"t":"2026-10-07T02:10:00Z","session":"O2","type":"lane_status","lane":"A","status":"ACTIVE"}` }
  expect(laneViews(reopened, NOW, 20 * MIN)[0]!.stalled).toBe(true)
})

test('STATE.md Lanes / Sessions lines mark lanes finished', () => {
  for (const line of [
    '- Lanes: A DONE | B DONE — RELEASE sent 21:56',
    '- Lanes: A/B/C DONE + MERGED (f73d0a22, 194cf626, cfcc85b0); RELEASED 17:29',
    '- Lanes: A DONE cfaf2985 + fix ebdf3084 MERGED; B DONE 2b758cac MERGED',
    '- Lanes: ALL MERGED and RELEASED (W-C, W-E released by O3 01:19)',
    '- Sessions: O1 Part A complete; O2 done; W-A/W-B/W-C DONE (stopped).',
  ]) {
    const [v] = laneViews(idle('ACTIVE chunk A2', { state: `${RUN.state}\n${line}` }), NOW, 20 * MIN)
    expect([line, v!.kind, v!.stalled]).toEqual([line, 'done', false])
  }
  expect(stateDoneLanes('- Lanes: A ACTIVE | B DONE').ids.has('A')).toBe(false)
  expect(laneViews(idle('ACTIVE', { state: `${RUN.state}\n- Lanes: B DONE | A ACTIVE` }), NOW, 20 * MIN)[0]!.stalled).toBe(true)
})

test('a run whose STATE says STATUS: COMPLETE or RUN COMPLETE is complete', () => {
  expect(isComplete('- Run id: x        Mode: full   STATUS: COMPLETE + PHASE 2b APPLIED', [])).toBe(true)
  expect(isComplete('- Phase: RUN COMPLETE (2026-10-08T18:25:00Z)', [])).toBe(true)
  expect(isComplete('- Phase: 4 — implement', [])).toBe(false)
})

// --- B: activity beyond the lane file ---

const L = (h: number, m: number) => new Date(2026, 9, 7, h, m).getTime() // local time, as JOURNAL.md writes it
const LNOW = L(11, 0)
const quietLane = (extra: Partial<RunFiles> = {}): RunFiles => ({
  ...RUN,
  events: '',
  lanes: [{ name: 'C.md', text: lane('W-C', 'ACTIVE chunk C2'), mtime: LNOW - 60 * MIN }],
  ...extra,
})

test('JOURNAL.md lines naming the lane count as its activity (lane C, W-C)', () => {
  const journal = ['- 09:00 dispatch W-C implementer', '- 10:20 lane B gate PASS', '- 10:52 lane C RED baseline: 40 failed', '- 10:55 O2 merged A'].join('\n')
  const v = laneViews(quietLane({ journal, journalMtime: L(10, 56) }), LNOW, 20 * MIN)[0]!
  expect([v.idleMin, v.stalled]).toEqual([8, false])
  expect(journalActivity(journal, L(10, 56), mentionRe(['W-B', 'B']), LNOW)).toBe(L(10, 20))
  expect(journalActivity(journal, L(10, 56), mentionRe(['W-D', 'D']), LNOW)).toBe(0)
})

test('journal times cross midnight walking back from the file mtime; dated lines in the future are skipped', () => {
  const now = new Date(2026, 9, 8, 0, 30).getTime()
  const journal = ['- 23:50 W-C tests running', '- 00:10 O2 note', '- 2026-10-09 18:05 W-C typo from the future'].join('\n')
  expect(journalActivity(journal, new Date(2026, 9, 8, 0, 11).getTime(), mentionRe(['W-C', 'C']), now)).toBe(new Date(2026, 9, 7, 23, 50).getTime())
})

test('gate logs naming the lane count as its activity; other lanes and lookalikes do not', () => {
  const gates = [
    { name: 'lane-C-console.txt', mtime: LNOW - 3 * MIN },
    { name: 'lane-CD.txt', mtime: LNOW - MIN },
    { name: 'base-main.txt', mtime: LNOW - MIN },
  ]
  expect(laneViews(quietLane({ gates }), LNOW, 20 * MIN)[0]!.idleMin).toBe(3)
  expect(gateActivity(gates.slice(1), mentionRe(['W-C', 'C']), LNOW)).toBe(0)
})

test('worktree activity (extra) counts; future times never do, and "Last update" text is not read', () => {
  expect(laneViews(quietLane({ extra: { 'W-C': LNOW - 2 * MIN } }), LNOW, 20 * MIN)[0]!.stalled).toBe(false)
  const future = quietLane({
    extra: { 'W-C': LNOW + 7 * 60 * MIN },
    events: '{"t":"2026-10-08T18:05:00","session":"W-C","type":"chunk_done"}',
    lanes: [{ name: 'C.md', text: lane('W-C', 'ACTIVE').replace('10:40', '18:05'), mtime: LNOW - 60 * MIN }],
  })
  expect(laneViews(future, LNOW, 20 * MIN)[0]!.idleMin).toBe(60)
})

test('worktree path: lane file field, else brief, else the PLAN session table or lane line', () => {
  const f = (text: string) => ({ name: 'A.md', text, mtime: 0 })
  expect(worktreeOf(f('- Session: W-A\n- Worktree: yes -> E:/Claude/EVI-p6-A   Branch: mab/p6-A'))).toBe('E:/Claude/EVI-p6-A')
  expect(worktreeOf(f('- Session: W-A\n- Worktree: yes → E:/Claude/EVI-p5-A   Branch: x'))).toBe('E:/Claude/EVI-p5-A')
  const plan = '| O1 | orchestrator | F0 | F0 | main (E:/Claude/EVI-p6) | - |\n| W-A | worker | lane A | A1-A4 | E:/Claude/EVI-p6-A | briefs/W-A.md |'
  expect(worktreeOf(f('- Session: W-A'), plan)).toBe('E:/Claude/EVI-p6-A')
  expect(worktreeOf(f('- Session: W-A'), '- **Lane A (responsibilities; worktree E:/Claude/EVI-p6-A):** skills/**')).toBe('E:/Claude/EVI-p6-A')
  expect(worktreeOf(f('- Session: W-A'), plan, 'Your worktree: E:\\Claude\\EVI-p6-A2 (branch x)')).toBe('E:\\Claude\\EVI-p6-A2')
  expect(worktreeOf(f('- Session: W-A'), '| W-B | worker | lane B | B1 | E:/Claude/EVI-p6-B | - |')).toBe(undefined)
})

// --- E: one alert per stall episode ---

test('stall episodes: one per lane until it shows activity past the last one', () => {
  let eps: Episodes = {}
  expect(isNewEpisode(eps, 'run:W-B', 100)).toBe(true)
  eps = markEpisode(eps, 'run:W-B', 100, NOW)
  expect(isNewEpisode(eps, 'run:W-B', 100)).toBe(false)
  expect(isNewEpisode(eps, 'run:W-B', 90)).toBe(false) // an older reading (a skipped walk) is not new activity
  expect(isNewEpisode(eps, 'run:W-B', 101)).toBe(true)
  expect(isNewEpisode(eps, 'run:W-C', 100)).toBe(true)
  expect(pruneEpisodes({ ...eps, old: { activity: 1, at: NOW - 3 * 864e5 } }, NOW)).toEqual(eps)
})
