import { expect, test } from 'claude-code/testing'

import { AUTO_CONTINUE, detectRole, isAutoContinue, isOrchestrator, laneNudge, looksLikeWaiting, pickAnswers, saysNothingPending } from './waiting'

test('waiting-on-you heuristic: asks for a decision', () => {
  for (const reply of [
    'Plan rev 3 is ready. Approve to proceed?',
    'Two options:\n1. Rebase now\n2. Wait for 0b\n\nI recommend 1. Your call.',
    'Gates are green. Reply "Approved" and I will commit.',
    'Should I push the branch as well?',
    'Let me know which option you prefer.',
    'Done with chunk A2. OK to proceed with A3',
  ]) expect(looksLikeWaiting(reply)).toBe(true)
})

test('waiting-on-you heuristic: status reports and holding replies are not', () => {
  for (const reply of [
    '',
    'Committed e16503ae. Lane A DONE, lane B DONE, run complete.',
    'Review r2 APPROVED after 2 rounds; open CRITICAL 0 HIGH 0.',
    'Holding as W-A. Activate with "ACTIVATE W-A" or type "activate".',
    'Handed off to O2; this session is finished.',
  ]) expect(looksLikeWaiting(reply)).toBe(false)
})

test('waiting-on-you: replies that say nothing needs deciding, or only offer more work, are not waiting', () => {
  for (const reply of [
    'Nothing needs deciding right now. Lanes B and C are running. Should I keep polling?',
    'All four lanes are held for O2. Nothing to decide; still idle until O2 sends RELEASE.',
    'No owner decision is needed: Gate 2 waits for the bench run.',
    'Status: W-A 3 chunks left, W-B in review.\n\nLet me know if you want anything else.',
    'Merged lane C as 105f1f4b. Anything else you want me to look at?',
    'Q-C1 for O2: does lane C own reconcile.py?',
    'Lane A RED baseline recorded; your call recorded in DECISIONS.md was option 2.\n\nRunning the gate now.',
  ]) expect([reply, looksLikeWaiting(reply)]).toEqual([reply, false])
})

test('waiting-on-you: the request has to be in the closing paragraph', () => {
  expect(looksLikeWaiting('Should I rebase first?\n\nRebased anyway; gate is green and committed as 1a2b3c.')).toBe(false)
  expect(looksLikeWaiting('Gate is green.\n\nShould I push the branch to origin?')).toBe(true)
})

test('nothing-pending replies to an auto-continue are recognised', () => {
  for (const reply of ['Nothing needs deciding.', 'There is nothing to decide right now.', 'Still idle, waiting for O2.', 'No decisions pending.'])
    expect([reply, saysNothingPending(reply)]).toEqual([reply, true])
  expect(saysNothingPending('Proceeded with option 2 (recommended); pushed 1a2b3c.')).toBe(false)
  expect(isAutoContinue(AUTO_CONTINUE)).toBe(true)
  expect(isAutoContinue('[pager] Lane W-B looks stalled')).toBe(false)
})

test('AskUserQuestion: the (Recommended) option, else the first', () => {
  const answers = pickAnswers([
    { question: 'Which lib?', options: [{ label: 'dayjs' }, { label: 'date-fns (Recommended)' }], multiSelect: false },
    { question: 'Deploy now?', options: [{ label: 'Yes' }, { label: 'No' }], multiSelect: false },
    { question: 'Which checks?', options: [{ label: 'lint (Recommended)' }, { label: 'e2e' }, { label: 'types (recommended)' }], multiSelect: true },
    { question: 'Name?', options: [], multiSelect: false },
  ])
  expect(answers['Which lib?']).toBe('date-fns (Recommended)')
  expect(answers['Deploy now?']).toBe('Yes')
  expect(answers['Which checks?']).toBe('lint (Recommended), types (recommended)')
  expect(answers['Name?']).toContain('owner away')
})

test('AskUserQuestion: single-select takes one recommended option', () => {
  const a = pickAnswers([{ question: 'Q?', options: [{ label: 'A (Recommended)' }, { label: 'B (Recommended)' }], multiSelect: false }])
  expect(a['Q?']).toBe('A (Recommended)')
})

test('session role from the holding prompt, activation, or own reply', () => {
  expect(detectRole([{ role: 'user', text: 'Invoke the multi-agent-building skill in hold mode: `hold W-B`.' }])).toBe('W-B')
  expect(detectRole([{ role: 'assistant', text: 'Holding as O2. Activate with "ACTIVATE O2".' }])).toBe('O2')
  // an orchestrator printing holding prompts or sending ACTIVATE is not itself that worker
  expect(detectRole([{ role: 'assistant', text: 'Sent ACTIVATE W-A. Prompt: `hold W-B`' }])).toBe(undefined)
  expect(isOrchestrator('O2', 'O2', false)).toBe(true)
  expect(isOrchestrator('W-A', 'O1', true)).toBe(false)
  expect(isOrchestrator(undefined, 'O1 (this session)', true)).toBe(true)
  expect(isOrchestrator(undefined, 'O1', false)).toBe(false)
})

test('pager prompts carry the marker', () => {
  expect(AUTO_CONTINUE.startsWith('[pager] The owner is away.')).toBe(true)
  expect(laneNudge('W-B', 25)).toBe(
    "[pager] Lane W-B looks stalled (no activity 25m). Check in on it per MAB's stall procedure and take your recommended recovery.",
  )
})
