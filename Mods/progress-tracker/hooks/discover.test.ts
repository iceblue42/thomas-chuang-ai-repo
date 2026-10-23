import { expect, test } from 'claude-code/testing'

import { pickPlan } from './discover'

test('plan choice: most items, then the shallower copy', () => {
  const brief = { rel: 'EVI-AUTONOMY-BRIEF.md', n: 77 }
  const tracked = { rel: 'docs/plans/2026-10-04-evi-autonomy-brief.md', n: 77 }
  const master = { rel: 'MasterPlan.md', n: 70 }
  expect(pickPlan([tracked, master, brief])).toBe(brief)
  expect(pickPlan([master, tracked])).toBe(tracked)
  expect(pickPlan([])).toBe(undefined)
})
