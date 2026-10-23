import { expect, test } from 'claude-code/testing'

import {
  chunkRows, coveredItems, describeEvent, field, focusIndex, itemId, itemState, mdRefs, mergeTicks, statusRows,
  openFindings, parseEvents, parseLane, parsePlanDoc, phaseOf,
} from './parse'

const STATE = `# MAB — EVI — Autonomy Programme Phase 0b (P0.8 benchmark baseline) + Gate 0 report
- Run id: 20261006-autonomy-p0b        Mode: full   Tier: standard
- This session: O1                      Orchestrator: this desktop session
- Phase: 3 — tests (dispatching test author on briefs/test-author.md)   Round: 1/3   Chunk: 1/5
- Lanes: none yet
- Held sessions: O2 not yet opened
- Active agents: test-author (opus) — chunk F0, dispatched 10:39, expect ~40m
- Next action: dispatch mab-test-author; tick P0.8 in EVI-AUTONOMY-BRIEF.md
- Read next: PLAN.md, briefs/test-author.md, FINDINGS.md`

const DOC = `# Brief
## 8. Phased plan
### Phase 0: Recon
- [x] **P0.1 Confirm live state.** Record:
  - [ ] nested ignored
- [ ] **P0.8 Benchmark baseline.** Build it.
- [x] **P0.9 Incident review** (section 7B).
\`\`\`
- [ ] fenced ignored
\`\`\`
### Phase 1: Harden
- [ ] **P1.1 Immutable releases.**
- [ ] plain item without id`

const PLAN = `# PLAN — Phase 0b
See \`EVI-AUTONOMY-BRIEF.md\` and docs/plans/x.md; briefs/O2.md; .mab/STATE.md
## Chunks

| id | steps | files | depends_on | lane |
|----|-------|-------|-----------|------|
| F0 | 1 | tests | — | in-session |
| C1 | 2-3 | cases | F0 | in-session |
| C2 | 4 | bench | C1 | A |

## Sessions`

test('STATE fields split on runs of spaces', () => {
  expect(field(STATE, 'Run id')).toBe('20261006-autonomy-p0b')
  expect(field(STATE, 'Tier')).toBe('standard')
  expect(field(STATE, 'This session')).toBe('O1')
  expect(field(STATE, 'Round')).toBe('1/3')
  expect(field(STATE, 'Held sessions')).toBe('O2 not yet opened')
  expect(field(STATE, 'Open questions')).toBe('')
})

test('plan doc: top-level checkboxes per heading, ids, fences skipped', () => {
  const s = parsePlanDoc(DOC)
  expect(s.map(x => [x.heading, x.items.length])).toEqual([['Phase 0: Recon', 3], ['Phase 1: Harden', 2]])
  expect(s[0]!.items.map(i => [i.id, i.text, i.done])).toEqual([
    ['P0.1', 'P0.1 Confirm live state', true],
    ['P0.8', 'P0.8 Benchmark baseline', false],
    ['P0.9', 'P0.9 Incident review', true],
  ])
  expect(s[1]!.items[1]!.id).toBe('')
  expect(coveredItems(s, 'Autonomy Programme Phase 0b (P0.8 benchmark)', 'P0.1-7,9 ticked')).toEqual(['P0.8'])
  expect(coveredItems(s, 'P0.81 only', '')).toEqual([])
})

test('a "Phase N" run with no ids in its title covers the section ids its PLAN.md names', () => {
  const s = parsePlanDoc(DOC)
  expect(coveredItems(s, 'Autonomy Programme Phase 1a (harden the boundaries)', 'P1.1 immutable; also touches P0.1')).toEqual(['P1.1'])
  expect(coveredItems(s, 'Chat redesign', 'P1.1')).toEqual([])
})

test('ticks merge across checkouts; built items do not take focus from untouched work', () => {
  const main = parsePlanDoc(DOC)
  const wt = parsePlanDoc(DOC.replace('- [ ] **P0.8', '- [x] **P0.8'))
  const merged = mergeTicks(main, [wt])
  expect(merged[0]!.items[1]!.done).toBe(true)
  expect(main[0]!.items[1]!.done).toBe(false)
  const none = new Set<string>()
  expect(itemState(main[1]!.items[0]!, none, new Set(['P1.1']))).toBe('built')
  expect(focusIndex(main, none, none)).toBe(0)
  expect(focusIndex(main, new Set(['P1.1']), none)).toBe(1)
})

test('phase and substep from STATE + events', () => {
  const ev = parseEvents([
    '{"t":"2026-10-06T10:20:00+08:00","session":"O1","type":"review_round","kind":"plan"}',
    'not json',
    '{"t":"2026-10-06T10:39:18+08:00","session":"O1","type":"phase_start","phase":3}',
    '{"t":"2026-10-06T10:39:41+08:00","session":"O1","type":"dispatch","agent":"test-author","chunk":"F0","brief":"b.md"}',
  ].join('\n'))
  expect(ev.length).toBe(3)
  expect(phaseOf(STATE, ev)).toEqual({ phase: 3, phaseText: 'tests (dispatching test author on briefs/test-author.md)', substep: 0 })
  const reviewed = [...ev, { type: 'review_round', kind: 'test' }]
  expect(phaseOf(STATE, reviewed).substep).toBe(1)
  expect(phaseOf(STATE, [...ev, { type: 'run_complete' }]).phase).toBe(7)
  expect(describeEvent(ev[2]!)).toBe('10:39 O1 dispatch test-author F0')
})

test('unlogged phase start: substep counts only events after the last boundary', () => {
  const state = '- Phase: 6 step 6 — FULL RUN in progress'
  const ev = [
    { type: 'commit', what: 'RED tests' },
    { type: 'phase_start', phase: 5 },
    { type: 'phase_end', phase: 5 },
    { type: 'dispatch', agent: 'impl-fix-smoke' },
  ]
  expect(phaseOf(state, ev)).toEqual({ phase: 6, phaseText: '6 step 6 — FULL RUN in progress', substep: 0 })
  expect(phaseOf(state, [...ev, { type: 'codex_call', kind: 'release' }]).substep).toBe(1)
})

test('a dispatched chunk with a later chunk done is done, not stuck active', () => {
  const rows = chunkRows(PLAN, [{ type: 'dispatch', chunk: 'F0' }, { type: 'chunk_done', chunk: 'C1' }], [], false)
  expect(rows.map(r => r.status)).toEqual(['done', 'done', 'todo'])
})

test('chunks: done from events and lanes, active from dispatch', () => {
  const lane = parseLane(`# Lane A
- Session: W-A            Session title: MAB W-A · evi
- Status: DONE abc123
- Chunks: C2
- Progress: chunk C2 DONE 11:40
- Last update: 12:04 by W-A`)
  expect([lane.id, lane.session, lane.status, lane.chunks, lane.last]).toEqual(['A', 'W-A', 'DONE abc123', 'C2', '12:04 by W-A'])
  const rows = chunkRows(PLAN, [{ type: 'chunk_done', chunk: 'F0' }, { type: 'dispatch', chunk: 'C1' }], [lane], false)
  expect(rows.map(r => [r.id, r.status, r.lane])).toEqual([['F0', 'done', 'in-session'], ['C1', 'active', 'in-session'], ['C2', 'done', 'A']])
  expect(chunkRows(PLAN, [], [], true).every(r => r.status === 'done')).toBe(true)
})

test('open findings and plan-doc references', () => {
  const md = `# FINDINGS
| ID | Round | Sev | Status | Resolution |
|---|---|---|---|---|
| F-001 | r1 | CRITICAL | fixed (r2) | x |
| F-002 | r2 | high | open | |
| F-003 | r2 | LOW | wontfix | |`
  expect(openFindings(md)).toEqual(['HIGH'])
  expect(mdRefs(PLAN)).toEqual(['EVI-AUTONOMY-BRIEF.md', 'docs/plans/x.md'])
})

test('side sections stay listed but the next "Phase N" section takes focus', () => {
  const s = parsePlanDoc(`## 7A. Memory policy
- [ ] **P6.9 Memory policy.**
### Phase 0: Recon
- [x] **P0.1 Confirm.**
### Phase 1: Harden
- [ ] **P1.1 Immutable.**`)
  const none = new Set<string>()
  expect(s[focusIndex(s, none, none)]!.heading).toBe('Phase 1: Harden')
  expect(s[focusIndex(s, none, new Set(['P1.1']))]!.heading).toBe('7A. Memory policy')
})

test('ids like R.0 and R.12 parse; Phase R takes focus before Phase 7', () => {
  expect(['R.0 Owner decisions first', 'R.12 Everything else', 'P1.10 Remove', 'P5.0 Reuse', 'Gate R'].map(itemId))
    .toEqual(['R.0', 'R.12', 'P1.10', 'P5.0', ''])
  const s = parsePlanDoc(`### Phase 6: Responsibilities
- [x] **P6.1 Done.**
### Phase R: Remediation (before Phase 7)
- [x] **R.0 Owner decisions first.**
- [ ] **R.1 Close the secret exposures (I-2).**
### Phase 7: Household
- [ ] **P7.1 Network.**`)
  const none = new Set<string>()
  expect(s[focusIndex(s, none, none)]!.heading).toBe('Phase R: Remediation (before Phase 7)')
  expect(s[1]!.items.map(i => [i.id, i.done])).toEqual([['R.0', true], ['R.1', false]])
})

test('status table: one state and detail per item id; non-item rows and other tables ignored', () => {
  const rows = statusRows(`| Task | Status | Detail |
|---|---|---|
| R.0 owner decisions | DONE | Ledger dffbbb8b |
| R.1 secret exposures | IN PROGRESS | Packet R1: fix round 2 |
| R.6 repair | COMMITTED | R6a committed |
| R.9 browser | NOT STARTED | |
| R.10 drills | PAUSED | waits on Gate R |
| Gate R | NOT STARTED | then verification |

| Chunk | Files |
|---|---|
| R.2 | x |`)
  expect(rows).toEqual({
    'R.0': { state: 'done', detail: 'Ledger dffbbb8b' },
    'R.1': { state: 'current', detail: 'Packet R1: fix round 2' },
    'R.6': { state: 'built', detail: 'R6a committed' },
    'R.9': { state: 'todo', detail: '' },
    'R.10': { state: 'paused', detail: 'waits on Gate R' },
  })
})
