import { describe, expect, test } from 'claude-code/testing'

import type { HandoffEntry } from '../types'
import {
  addEntry, aheadCount, classifyPath, entryFromFile, handoffDir, handoffPrompt, holdingFileEntries, holdingPrompts,
  intentSuffix, isHandoffIntent, isHandoffPath, isRealUserPrompt, isSessionPromptPath, keyOf, matchUsed, parseArgs,
  parseFrontmatter, porcelainPaths, setUsed, shouldShelve, shutdownDecision, stamp,
} from './logic'

const BODY = `Repo E:\\Claude\\EVI. First: git fetch && git status; confirm branch mab/autonomy-p0 @ 78bee8cd.
Read EVI-AUTONOMY-BRIEF.md and .mab/runs/20261006-autonomy-p0b/STATE.md, then continue Phase 2 of the autonomy programme.
Everything is committed and pushed. Open follow-ups: F-12 flaky smoke test; decide judge model.`

const FILE = `---
title: Autonomy Phase 2 kickoff
project: E:/Claude/EVI
created: 2026-10-07T21:30:00.000Z
kind: next-session
safe-to-shutdown: yes
---
${BODY}
`

// Modelled on E:/Claude/EVI-p5/.mab/HOLDING-PROMPTS.md (two of its five sections, trimmed), plus the
// "Delivery" note section EVI-p4's copy ends with and a generic holding-session section.
const HOLD_O2 = `Invoke the multi-agent-building skill in hold mode: \`hold O2\`.
Project: E:/Claude/EVI-p5  ·  Run: 20261008-2041-autonomy-p5  ·  Task: EVI Autonomy Programme Phase 5 — browser, sign-ins and payments
Role: orchestrator successor from MAB Phase 4 (activate lanes A/B/C, merge --no-ff, release gate; commit by path only — no push)
Brief: E:/Claude/EVI-p5/.mab/runs/20261008-2041-autonomy-p5/briefs/O2.md   State: E:/Claude/EVI-p5/.mab/runs/20261008-2041-autonomy-p5/STATE.md
Set this session's title to "MAB P5-O2 · EVI". Read the brief and STATE.md, confirm in one line, then stop and wait.`
const HOLD_WA = `Invoke the multi-agent-building skill in hold mode: \`hold W-A\`.
Project: E:/Claude/EVI-p5  ·  Run: 20261008-2041-autonomy-p5  ·  Task: EVI Autonomy Programme Phase 5 — browser, sign-ins and payments
Role: lane worker for lane A
Scope: chunks A1-A6 — the browser broker; worktree: yes (E:/Claude/EVI-p5-A, branch mab/autonomy-p5-A)
Set this session's title to "MAB P5-W-A · EVI". Read the brief and STATE.md, register in lanes/A.md as HOLDING, then stop and wait.`
const HOLD_GENERIC = `You are session MAB P5 Holding 3. You will be activated by another session with your role; until then, reply "holding" and wait.`
const HOLDING_FILE = [
  '# Phase 5 armed holding prompts (run 20261008-2041-autonomy-p5)',
  '',
  'Paste each block into a new desktop session; they hold until `ACTIVATE <ID>`.',
  '',
  'Session titles: `MAB P5-O2 · EVI`, `MAB P5-W-A · EVI`.',
  '',
  '## O2 — orchestrator successor',
  '',
  '```',
  HOLD_O2,
  '```',
  '',
  '## W-A — lane A worker (browser broker: tiers, egress, credentials, checkout, CAPTCHA)',
  '',
  '```',
  HOLD_WA,
  '```',
  '',
  '## Holding 3 — spare',
  '',
  '```text',
  HOLD_GENERIC,
  '```',
  '',
  '## Delivery (owner, 2026-10-08 00:35)',
  '',
  'The owner opens desktop sessions titled `MAB P5 Holding 1` … `3`; O1 sends each its armed prompt by session message.',
  '',
].join('\r\n')

describe('frontmatter', () => {
  test('parses keys, strips quotes and comments, keeps the body', () => {
    const { meta, body } = parseFrontmatter(`---\r\ntitle: "Hi: there"\r\nrole: W-A   # lane\r\nkind: holding\r\n---\r\nline 1\r\nline 2\r\n`)
    expect(meta).toEqual({ title: 'Hi: there', role: 'W-A', kind: 'holding' })
    expect(body).toBe('line 1\nline 2')
  })
  test('no frontmatter: all body', () => {
    expect(parseFrontmatter('MAB resume — EVI\nmore')).toEqual({ meta: {}, body: 'MAB resume — EVI\nmore' })
  })
  test('entry from a handoff file', () => {
    const e = entryFromFile('E:\\Claude\\EVI\\.mab\\handoffs\\20261007-2130-autonomy-p2.md', FILE, 'x', 5)!
    expect(e.title).toBe('Autonomy Phase 2 kickoff')
    expect(e.kind).toBe('next-session')
    expect(e.project).toBe('E:/Claude/EVI')
    expect(e.created).toBe(Date.parse('2026-10-07T21:30:00.000Z'))
    expect(e.body).toBe(BODY)
    expect(e.used).toBe(false)
  })
  test('a session-prompt file with no frontmatter takes its first line as title', () => {
    const e = entryFromFile('E:/Claude/EVI/.mab/runs/r1/NEXT-SESSION-PROMPT.md', '# MAB resume — EVI rooms\n\nbody', 'E:/Claude/EVI', 7)!
    expect(e.title).toBe('MAB resume — EVI rooms')
    expect(e.created).toBe(7)
    expect(entryFromFile('E:/x/.handoffs/a.md', '---\ntitle: t\n---\n', 'p', 1)).toBe(null)
  })
})

describe('paths', () => {
  test('handoff and session-prompt files', () => {
    expect(isHandoffPath('E:\\Claude\\EVI\\.mab\\handoffs\\20261007-2130-x.md')).toBe(true)
    expect(isHandoffPath('C:/Claude Diagnostics/.handoffs/20261007-2130-x.md')).toBe(true)
    expect(isHandoffPath('E:/Claude/EVI/.mab/HANDOFF-O1.md')).toBe(false)
    expect(isSessionPromptPath('E:/Claude/EVI/.mab/runs/r/NEXT-SESSION-PROMPT.md')).toBe(true)
    expect(isSessionPromptPath('E:/Claude/EVI-p1a/.mab/runs/r/NEXT-SESSION-PROMPT-phase2.md')).toBe(true)
    expect(isSessionPromptPath('E:/Claude/EVI/.mab/briefs/approval-gate-session-prompt.md')).toBe(true)
    expect(isSessionPromptPath('E:/Claude/EVI/.mab/runs/r/reviews/FOLLOWUPS-PROMPT.md')).toBe(true)
    expect(isSessionPromptPath('E:/Claude/EVI/.mab/briefs/codex-prompt-consult.md')).toBe(false)
    expect(isSessionPromptPath('E:/Claude/EVI/docs/next-session-prompt.md')).toBe(false)
  })
  test('classifier: handoff, holding, session-prompt, brief, or not a prompt', () => {
    const cases: [string, string | null][] = [
      ['E:\\Claude\\EVI\\.mab\\handoffs\\20261007-2130-x.md', 'handoff'],
      ['E:\\Claude\\EVI-p5\\.mab\\HOLDING-PROMPTS.md', 'holding'],
      ['E:/Claude/EVI-p6/.mab/holding-prompts.md', 'holding'],
      ['E:/Claude/EVI-p4/.mab/runs/20261007-2339-autonomy-p4/NEXT-SESSION-PROMPT-phase5.md', 'session-prompt'],
      ['E:/Claude/EVI/.mab/runs/r/NEXT-SESSION.md', 'session-prompt'],
      ['E:/Claude/EVI/.mab/runs/r/next-session-notes.md', 'session-prompt'],
      ['E:/Claude/EVI/.mab/briefs/browser-bugfix-prompt.md', 'session-prompt'],
      ['E:/Claude/EVI/.mab/runs/r/reviews/FOLLOWUPS-PROMPT.md', 'session-prompt'],
      ['E:/Claude/EVI/.mab/runs/r/briefs/next-session-prompt.md', 'session-prompt'],
      ['E:/Claude/EVI-p3/.mab/runs/20261007-1915-autonomy-p3/briefs/O4.md', 'brief'],
      ['E:/Claude/EVI/.mab/briefs/W-A.md', 'brief'],
      ['E:/Claude/EVI/.mab/briefs/codex-prompt-consult.md', null],
      ['E:/Claude/EVI/.mab/runs/r/CODEX-PROMPT-review.md', null],
      ['E:/Claude/EVI/.mab/runs/r/reviews/round-01-plan-attempt3-noprompt.md', null],
      ['E:/Claude/EVI/.mab/runs/r/STATE.md', null],
      ['E:/Claude/EVI/docs/NEXT-SESSION-PROMPT.md', null],
      ['E:/Claude/EVI/briefs/O4.md', null],
      ['E:/Claude/EVI/.mab/HOLDING-PROMPTS.txt', null],
    ]
    for (const [p, kind] of cases) expect([p, classifyPath(p)]).toEqual([p, kind])
  })
  test('briefs are shelved only in a turn that asked for a next-session prompt', () => {
    const brief = 'E:/Claude/EVI-p3/.mab/runs/20261007-1915-autonomy-p3/briefs/O4.md'
    expect(shouldShelve(brief, false)).toBe(false)
    expect(shouldShelve(brief, true)).toBe(true)
    expect(shouldShelve('E:/Claude/EVI-p4/.mab/runs/r/NEXT-SESSION-PROMPT-phase5.md', false)).toBe(true)
    expect(shouldShelve('E:/Claude/EVI-p5/.mab/HOLDING-PROMPTS.md', false)).toBe(true)
    expect(shouldShelve('E:/Claude/EVI/src/app.ts', true)).toBe(false)
  })
  test('handoff dir prefers the main checkout .mab', () => {
    expect(handoffDir('E:/Claude/EVI', 'E:/Claude/EVI-p2', true, true)).toBe('E:/Claude/EVI/.mab/handoffs')
    expect(handoffDir('E:/A', 'E:/A-wt', false, true)).toBe('E:/A-wt/.mab/handoffs')
    expect(handoffDir('E:/A', 'E:/A', false, false)).toBe('E:/A/.handoffs')
  })
  test('stamp is local YYYYMMDD-HHMM', () => {
    expect(stamp(new Date(2026, 9, 7, 9, 5))).toBe('20261007-0905')
  })
})

describe('intent', () => {
  const yes = [
    'Give me the prompt for the next session.',
    'Give me a prompt to start the VPS deploy in a new session.',
    'output a prompt to continue in a new session',
    'give me a prompt to kick it off in a new session',
    'ok great, now write the next-session prompt',
    'Give me the combined prompt for a fresh session please',
    // missed in the last 30 sessions
    'Push and deploy phase 4. Then I need a prompt to kick off phase 5',
    'Ok. Can you give me a prompt to close out Phase 3 in a different session.',
    'a prompt for a new session',
    'Can I get a prompt for a new session?',
    'prompt to resume the P6 run in a new session',
    'Write a prompt to start the deploy in another session',
    'give me a prompt to continue the review in a fresh session',
    'I need a prompt to resume in a different session',
    'I need a kickoff prompt for phase 6',
    'kickoff prompt for phase 6 please',
    'Can you write the prompt to kick off the P6 lanes?',
    'I want a prompt to start phase 6',
  ]
  const no = [
    'the prompt in the new session failed to load',
    'what did the next session prompt say?',
    'Give me a summary of the session',
    'Fix the system prompt',
    '[handoff] Write ONE combined, paste-ready prompt for the next session.',
    `${BODY}\n${'Context. '.repeat(80)}\nAt the end, give me the prompt for the next session.`,
    // mention a prompt without asking for a next-session one
    'Can you tighten the system prompt so the bot stops rambling in a new chat?',
    'Write a prompt for the image generator to draw a cat',
    'I need a prompt template for the eval harness',
    'the kickoff prompt you wrote yesterday had a typo',
    'the prompt for the next session was wrong',
  ]
  for (const t of yes) test(`matches: ${t}`, () => expect(isHandoffIntent(t)).toBe(true))
  for (const t of no) test(`ignores: ${t.slice(0, 50)}`, () => expect(isHandoffIntent(t)).toBe(false))

  test('real user prompts: the person, not a mod', () => {
    expect(isRealUserPrompt({ kind: 'composer' }, 'hi')).toBe(true)
    expect(isRealUserPrompt({ kind: 'sdk' }, 'hi')).toBe(true)
    expect(isRealUserPrompt({ kind: 'bridge' }, 'hi')).toBe(true)
    expect(isRealUserPrompt({ kind: 'composer' }, '[pager] ping')).toBe(false)
    expect(isRealUserPrompt({ kind: 'plugin' }, 'hi')).toBe(false)
    expect(isRealUserPrompt({ kind: 'peer' }, 'hi')).toBe(false)
  })

  test('args and the queued prompt', () => {
    expect(parseArgs('  --shutdown deploy is next ')).toEqual({ shutdown: true, note: 'deploy is next' })
    expect(parseArgs('')).toEqual({ shutdown: false, note: '' })
    const s = { dir: 'E:/Claude/EVI/.mab/handoffs', stamp: '20261007-2130', project: 'E:/Claude/EVI', createdIso: 'x', note: 'n1' }
    const off = handoffPrompt({ ...s, shutdown: false })
    const on = handoffPrompt({ ...s, shutdown: true })
    expect(off.startsWith('[handoff]')).toBe(true)
    expect(off.includes('E:/Claude/EVI/.mab/handoffs/20261007-2130-<slug>.md')).toBe(true)
    expect(off.includes('n1')).toBe(true)
    expect(off.includes('safe-to-shutdown')).toBe(false)
    expect(on.includes('safe-to-shutdown: yes|no')).toBe(true)
    expect(on.includes('ListAgents')).toBe(true)
  })

  test('the auto-trigger still asks for the file under .mab/handoffs', () => {
    const s = { dir: 'E:/Claude/EVI/.mab/handoffs', stamp: '20261011-0900', project: 'E:/Claude/EVI', createdIso: 'x', note: '', shutdown: false }
    const suffix = intentSuffix(s)
    expect(suffix.startsWith('\n\n[handoff]')).toBe(true)
    expect(suffix.includes('E:/Claude/EVI/.mab/handoffs/20261011-0900-<slug>.md')).toBe(true)
  })
})

describe('shelf', () => {
  const entry = (id: string, body: string, created: number): HandoffEntry =>
    ({ id, title: id, kind: 'next-session', project: 'p', created, body, key: keyOf(body), used: false })

  test('prefix match on the first ~200 normalized chars', () => {
    const shelf = [entry('a', BODY, 1), entry('short', 'tiny prompt', 2)]
    const pasted = `  ${BODY.replace(/\n/g, '\r\n  ').toUpperCase()}\n\nplus my extra line`
    expect(matchUsed(shelf, pasted)).toEqual(['a'])
    expect(matchUsed(shelf, 'tiny prompt')).toEqual([]) // too short to match safely
    expect(matchUsed(shelf, `Hello. ${BODY}`)).toEqual([])
    expect(matchUsed(setUsed(shelf, 'a', 9), BODY)).toEqual([])
  })

  test('add: newest first, same file replaces, same body elsewhere skipped', () => {
    const one = addEntry([], entry('f1', BODY, 1))
    const two = addEntry(one, entry('f2', 'another prompt body that is long enough to be a key', 2))
    expect(two.map(e => e.id)).toEqual(['f2', 'f1'])
    expect(addEntry(two, entry('f3', BODY, 3))).toEqual(two)
    const rewritten = addEntry(setUsed(two, 'f1', 5), entry('f1', `${BODY} v2`, 4))
    expect(rewritten.map(e => [e.id, e.used])).toEqual([['f1', false], ['f2', false]])
  })

  test('MAB holding prompts printed in chat', () => {
    const answer = [
      'Paste each into a new desktop session now:',
      '```',
      'Invoke the multi-agent-building skill in hold mode: `hold W-A`.',
      'Project: E:\\Claude\\EVI  ·  Run: 20261007-x  ·  Task: Autonomy P2',
      '```',
      '```text',
      'Invoke the multi-agent-building skill in hold mode: `hold O2`.',
      'Project: E:\\Claude\\EVI  ·  Run: 20261007-x  ·  Task: Autonomy P2',
      '```',
      '```bash',
      'git status',
      '```',
    ].join('\n')
    const found = holdingPrompts(answer, 'E:/Claude/EVI', 1)
    expect(found.map(e => [e.role, e.kind, e.title])).toEqual([
      ['W-A', 'holding', 'MAB hold W-A · Autonomy P2'],
      ['O2', 'holding', 'MAB hold O2 · Autonomy P2'],
    ])
    expect(found.reduce(addEntry, [] as HandoffEntry[]).length).toBe(2)
  })

  test('HOLDING-PROMPTS.md: one entry per fenced section, notes skipped', () => {
    const path = 'E:\\Claude\\EVI-p5\\.mab\\HOLDING-PROMPTS.md'
    const found = holdingFileEntries(path, HOLDING_FILE, 'E:/Claude/EVI', 3)
    expect(found.map(e => [e.role, e.kind, e.title])).toEqual([
      ['O2', 'holding', 'MAB hold O2 · EVI Autonomy Programme Phase 5 — browser, sign-ins and payments'],
      ['W-A', 'holding', 'MAB hold W-A · EVI Autonomy Programme Phase 5 — browser, sign-ins and payments'],
      ['Holding 3', 'holding', 'Holding 3 — spare'],
    ])
    expect(found.map(e => e.body)).toEqual([HOLD_O2, HOLD_WA, HOLD_GENERIC])
    expect(found.map(e => e.id)).toEqual([
      'file:e:/claude/evi-p5/.mab/holding-prompts.md#o2',
      'file:e:/claude/evi-p5/.mab/holding-prompts.md#w-a',
      'file:e:/claude/evi-p5/.mab/holding-prompts.md#holding 3',
    ])
    expect(found.every(e => e.path === 'E:/Claude/EVI-p5/.mab/HOLDING-PROMPTS.md' && e.project === 'E:/Claude/EVI' && !e.used)).toBe(true)
  })

  test('HOLDING-PROMPTS.md without sections is shelved whole; empty gives nothing', () => {
    const whole = holdingFileEntries('E:/x/.mab/HOLDING-PROMPTS.md', `# Holding prompts\n\n${HOLD_O2}\n`, 'E:/x', 4)
    expect(whole.map(e => [e.id, e.kind, e.title])).toEqual([['file:e:/x/.mab/holding-prompts.md', 'holding', 'Holding prompts']])
    expect(holdingFileEntries('E:/x/.mab/HOLDING-PROMPTS.md', '## O2 — notes only\n\nnothing fenced here\n', 'E:/x', 4).length).toBe(1)
    expect(holdingFileEntries('E:/x/.mab/HOLDING-PROMPTS.md', '  \n', 'E:/x', 4)).toEqual([])
  })

  test('re-saving HOLDING-PROMPTS.md keeps used marks; chat copies of the same prompts are not doubled', () => {
    const path = 'E:/Claude/EVI-p5/.mab/HOLDING-PROMPTS.md'
    const first = holdingFileEntries(path, HOLDING_FILE, 'E:/Claude/EVI', 1).reduce(addEntry, [] as HandoffEntry[])
    const used = setUsed(first, first.find(e => e.role === 'O2')!.id, 2)
    const again = holdingFileEntries(path, `${HOLDING_FILE}\nAppended note.\n`, 'E:/Claude/EVI', 3).reduce(addEntry, used)
    expect(again).toEqual(used)
    const chat = holdingPrompts(['```', HOLD_O2, '```', '```', HOLD_WA, '```'].join('\n'), 'E:/Claude/EVI', 4)
    expect(chat.reduce(addEntry, again)).toEqual(again)
  })
})

describe('shutdown decision', () => {
  const clean = { exitCode: 0, stdout: '# branch.oid abc\n# branch.head main\n# branch.upstream origin/main\n# branch.ab +0 -2\n' }

  test('safe only with yes + clean + pushed', () => {
    expect(shutdownDecision(FILE, clean)).toEqual({ ok: true })
  })
  test('the handoff file itself does not count as dirty', () => {
    expect(shutdownDecision(FILE, { ...clean, stdout: `${clean.stdout}? .handoffs/20261007-2130-x.md\n` })).toEqual({ ok: true })
    expect(shutdownDecision(FILE, { ...clean, stdout: `${clean.stdout}? .handoffs/\n` })).toEqual({ ok: true })
  })
  test('refuses for every other reason', () => {
    const no = (text: string | null, git = clean as { exitCode: number; stdout: string } | null) => shutdownDecision(text, git).ok
    expect(no(null)).toBe(false)
    expect(no(FILE.replace('safe-to-shutdown: yes', 'safe-to-shutdown: no'))).toBe(false)
    expect(no(FILE.replace('safe-to-shutdown: yes\n', ''))).toBe(false)
    expect(no(FILE, null)).toBe(false)
    expect(no(FILE, { exitCode: 128, stdout: '' })).toBe(false)
    expect(no(FILE, { exitCode: 0, stdout: `${clean.stdout}1 .M N... 100644 100644 100644 a b src/app.ts\n` })).toBe(false)
    expect(no(FILE, { exitCode: 0, stdout: `${clean.stdout}? notes.txt\n` })).toBe(false)
    expect(no(FILE, { exitCode: 0, stdout: clean.stdout.replace('+0', '+3') })).toBe(false)
    expect(no(FILE, { exitCode: 0, stdout: '# branch.oid abc\n# branch.head feat\n' })).toBe(false)
    expect(shutdownDecision(FILE, { exitCode: 0, stdout: clean.stdout.replace('+0', '+3') })).toEqual({ ok: false, reason: '3 commit(s) not pushed' })
  })
  test('porcelain v2 paths', () => {
    const out = '# branch.ab +1 -0\n1 .M N... 1 1 1 a b dir/my file.ts\n2 R. N... 1 1 1 a b R100 new.ts\told.ts\n? untracked.md\n'
    expect(porcelainPaths(out)).toEqual(['dir/my file.ts', 'new.ts', 'untracked.md'])
    expect(aheadCount(out)).toBe(1)
    expect(aheadCount('# branch.head x\n')).toBe(null)
  })
})
