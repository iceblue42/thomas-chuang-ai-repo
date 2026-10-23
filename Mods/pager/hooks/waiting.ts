// Pure: does a reply wait on the owner, the AskUserQuestion recommended pick, session role, and pager's prompts.

// Holding / handed-off replies wait for an orchestrator's ACTIVATE, not for the owner.
const NOT_OWNER = /\bHolding as (?:O\d+|W-\w+)\b|\bACTIVATE (?:O\d+|W-\w+)\b|\bthis session is finished\b/i
// An explicit decision or approval request, in the reply's last paragraph.
const DECIDE = new RegExp(
  [
    String.raw`\byour (?:call|decision|choice|go-?ahead|sign-?off|approval|confirmation|answer)\b`,
    String.raw`\bplease (?:confirm|approve|choose|pick|decide|advise|reply)\b`,
    String.raw`\b(?:ok|okay) to (?:proceed|continue|go ahead|push|commit|deploy|merge)\b`,
    String.raw`\b(?:awaiting|waiting (?:on|for)) (?:you|your|the owner|owner)\b`,
    String.raw`\bneeds? (?:your|the owner'?s?|owner'?s?) (?:decision|approval|go-?ahead|sign-?off|input|answer|word|confirmation|call)\b`,
    String.raw`\b(?:reply|say|type) ["“'\x60]?(?:approved|go|yes|proceed)\b`,
    String.raw`\bapprove (?:this|it|the|and|to)\b`,
    String.raw`\blet me know (?:which|whether|if you (?:approve|agree))\b`,
    String.raw`\b(?:should|shall|may) I\b[^.!?\n]*\?`,
    String.raw`\b(?:do|would) you (?:want|like|prefer)\b[^.!?\n]*\?`,
    String.raw`\bwhich (?:option|one|approach|way|path)\b[^.!?\n]*\?`,
  ].join('|'),
  'i',
)
// A closing question counts only when it is put to the owner.
const TO_OWNER = /\b(?:you|your|I|me|we|us)\b|\b(?:approve|proceed|go ahead|ok|okay)\b/i
// Offers of more work ("Anything else?", "Let me know if you need anything") decide nothing.
const OFFER = /^\W*(?:anything else\b|is there anything\b|let me know if (?:you|there)\b|happy to\b|if you(?:'d| would)? (?:like|want)\b)/i
/** The reply says there is nothing for the owner to decide (or it is idle until something happens). */
export const NOTHING = new RegExp(
  [
    String.raw`\bnothing (?:\w+ ){0,2}(?:to (?:decide|approve|answer|confirm)|needs? (?:deciding|a decision|your|approval|input|answering))`,
    String.raw`\bnothing (?:is |else |left |more )?(?:pending|outstanding|waiting on you|blocking|for you to)`,
    String.raw`\bno (?:owner |pending |open |further )?(?:decisions?|input|approvals?|action) (?:is |are )?(?:needed|required|pending|outstanding)`,
    String.raw`\bno(?:thing)? (?:pending|open|outstanding) (?:decisions?|questions?|items?)`,
    String.raw`\b(?:still|remain(?:s|ing)?|stay(?:s|ing)?) idle\b`,
    String.raw`\bidle (?:until|till)\b`,
  ].join('|'),
  'i',
)

/**
 * Cheap prefilter: the reply waits on the owner when its closing line is a question put to them, or its
 * last paragraph explicitly asks for a decision or approval; never when it says nothing needs deciding.
 */
export const looksLikeWaiting = (answer: string) => {
  const tail = answer.trim().slice(-800)
  if (!tail || NOT_OWNER.test(tail) || NOTHING.test(tail)) return false
  const lines = tail.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const last = lines.at(-1) ?? ''
  if (OFFER.test(last.split(/[.!]\s+/).at(-1) ?? last)) return false
  const para = tail.split(/\r?\n\s*\r?\n/).at(-1) ?? tail
  return (/\?[\s*_)`"'”]*$/.test(last) && TO_OWNER.test(last)) || DECIDE.test(para)
}

/** The model's answer to an auto-continue: did it find nothing to decide? */
export const saysNothingPending = (answer: string) => NOTHING.test(answer.trim().slice(-1500))

export const WAITING_LABELS = ['needs-owner-decision', 'no-decision-needed'] as const
export const classifyText = (answer: string) =>
  `Final message of an AI coding session to its owner. Does it stop and wait for the owner to decide, approve, or answer something before work can continue?\n\n${answer.trim().slice(-1500)}`

export type Question = { question: string; options: readonly { label: string }[]; multiSelect?: boolean }

/** Per question: the options labelled "(Recommended)" (one for single-select), else the first; free text when none. */
export const pickAnswers = (questions: readonly Question[]) =>
  Object.fromEntries(
    questions.map(q => {
      const rec = q.options.filter(o => /\brecommended\b/i.test(o.label))
      const picked = rec.length ? (q.multiSelect ? rec : rec.slice(0, 1)) : q.options.slice(0, 1)
      const answer = picked.map(o => o.label).join(', ') || 'No preference (owner away): use your best judgment.'
      return [q.question, answer]
    }),
  ) as Record<string, string>

export type Msg = { role: string; text: string }
const ROLE = String.raw`(O\d+|W-[A-Z]\w*)`
const USER_ROLE = new RegExp(String.raw`\b(?:hold|worker|ACTIVATE)\s+\x60?${ROLE}\b`, 'g')
const SELF_ROLE = new RegExp(String.raw`^\s*Holding as ${ROLE}\b`)

/** This session's MAB role (O2, W-A) from its holding prompt / activation / "Holding as" reply; last wins. */
export const detectRole = (msgs: readonly Msg[]): string | undefined => {
  let role: string | undefined
  for (const m of msgs) {
    if (m.role === 'user') for (const x of m.text.matchAll(USER_ROLE)) role = x[1]
    if (m.role === 'assistant') role = SELF_ROLE.exec(m.text)?.[1] ?? role
  }
  return role
}

/** Orchestrator: role O*, or no role and the session has talked about the run whose STATE names an O* session. */
export const isOrchestrator = (role: string | undefined, stateSession: string, mentionsRun: boolean) =>
  role ? /^O\d/.test(role) : /^O\d/.test(stateSession) && mentionsRun

/** A turn pager itself started with AUTO_CONTINUE. */
export const isAutoContinue = (text: string) => text.trimStart().startsWith('[pager] The owner is away.')

export const AUTO_CONTINUE =
  '[pager] The owner is away. Proceed with the option you recommended (or the most reasonable one if you gave none). ' +
  'Record each auto-made decision as `AUTO-DECIDED (owner away): ...` in the run\'s DECISIONS.md if this is a MAB run, otherwise in your reply. ' +
  'Hard stops, park and continue other work instead: spending money or provisioning paid resources, deleting data or destroying infrastructure, ' +
  'sending messages to other people, changing credentials or security settings. ' +
  'Everything else, including commit/push/deploy as this project\'s own rules allow, proceed.'

export const laneNudge = (lane: string, minutes: number) =>
  `[pager] Lane ${lane} looks stalled (no activity ${minutes}m). Check in on it per MAB's stall procedure and take your recommended recovery.`

export const snippet = (text: string, n = 120) => {
  const one = text.replace(/\s+/g, ' ').trim()
  return one.length > n ? `…${one.slice(-(n - 1))}` : one
}
