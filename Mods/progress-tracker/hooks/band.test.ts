import { expect, test } from 'claude-code/testing'

import type { Snapshot } from '../types'
import { bandRows } from './band'

const text = (rows: ReturnType<typeof bandRows>) => rows.map(r => r.map(s => s.text).join(''))

const snap: Snapshot = {
  root: 'E:/r',
  at: '10:45',
  others: [],
  plan: {
    path: 'E:/r/BRIEF.md',
    current: ['P0.8'],
    built: ['P1.1'],
    details: {},
    sections: [
      { heading: 'Phase 0: Recon', items: [{ id: 'P0.1', text: 'P0.1 Confirm', done: true }, { id: 'P0.8', text: 'P0.8 Benchmark baseline', done: false }] },
      { heading: 'Phase 1: Harden', items: [{ id: 'P1.1', text: 'P1.1 Immutable', done: false }] },
      { heading: 'Phase 2: Policy', items: [{ id: 'P2.1', text: 'P2.1 Rules', done: false }] },
    ],
  },
  run: {
    id: 'run1', title: 'EVI — Phase 0b', session: 'O1', tier: 'standard', phase: 3, phaseText: 'tests', substep: 1,
    round: '1/3', chunk: '', agents: 'test-author (opus)', next: 'confirm RED', questions: '', held: 'O2 HOLDING',
    lanesLine: 'none', lanes: [{ id: 'A', session: 'W-A', status: 'ACTIVE', chunks: 'C2', progress: '', review: '', last: '' }],
    chunks: [{ id: 'F0', steps: '1', lane: '', status: 'done' }, { id: 'C1', steps: '2', lane: '', status: 'active' }],
    openFindings: ['HIGH'], recent: [],
  },
}

test('band summarises run, pipeline, sessions and plan in five rows', () => {
  const rows = bandRows(snap)
  expect(text(rows)).toEqual([
    '◆ EVI — Phase 0b · O1 · standard · round 1/3 · 10:45',
    '✓Triage ✓Recon ✓Plan ▶Tests ○Implement ○Review ○Ship │ test writing › test review › confirm RED',
    'now: test-author (opus)  next: confirm RED',
    'chunks 1/2 ▶C1 · findings 1 open · sessions: O1, O2 HOLDING, W-A ACTIVE',
    'plan 1/4 +1 built · Phase 0: Recon 1/2 ▶ P0.8 Benchmark baseline · then Phase 2: Policy',
  ])
  expect(rows[1]!.find(s => s.text.endsWith('test review'))?.bold).toBe(true)
  expect(rows[3]![1]!.color).toBe('red')
})

test('plan-only and empty snapshots', () => {
  expect(text(bandRows({ ...snap, run: null }))).toHaveLength(1)
  expect(bandRows({ ...snap, run: null, plan: null })).toEqual([])
})
