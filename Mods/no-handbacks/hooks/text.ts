// The words this mod puts in front of the model.
import type { Detection } from './detect'
import type { Nudge } from './guard'

export const POLICY_ID = 'no-handbacks:policy'

export const POLICY =
  "Do the work yourself with your tools; never leave 'for you later' items you could run. " +
  "Only hand a step to the owner when it needs their hands: physical hardware/BIOS, a GUI-only action you have no tool for, " +
  'entering passwords/credentials or payments, signing in to a site (2FA, Singpass, OAuth consent), approving a decision, ' +
  'switching permission mode or approving permission/allow rules, or something you or the auto-mode classifier were refused ' +
  '— and then say exactly why. Any command the owner must run is Windows PowerShell 5.1 syntax ' +
  '(no bash heredocs, no `&&`; use `;` and `if ($?) { }`), one command per fenced ```powershell block.'

const REWRITE =
  ' Any command you leave for the owner must be Windows PowerShell 5.1: no bash heredocs, no && (use ; and if ($?) { }), one command per fenced powershell block.'

const SHORT = ' Keep the reply short; do the work rather than explaining.'

export function nudgeText(kind: Exclude<Nudge, null>, d: Detection): string {
  if (kind === 'rewrite') {
    return `[no-handbacks] The command you left for the owner is not Windows PowerShell 5.1 syntax: "${d.quote}". Give it again as PowerShell 5.1.${REWRITE}${SHORT}`
  }
  return (
    `[no-handbacks] You handed the owner work you can do yourself: "${d.quote}". Do it now with your tools. ` +
    'If a step truly needs the owner, name it and why, and give PowerShell.' +
    (d.nonPs51 ? REWRITE : '') +
    SHORT
  )
}

const MAX = 4000

// What the classifier reads: the criteria, the sentence the prefilter flagged, then the message (its tail, where handbacks sit).
export function classifyText(answer: string, flagged: string): string {
  const msg = answer.length > MAX ? `…${answer.slice(-MAX)}` : answer
  return (
    "An AI coding assistant with shell, file, browser and desktop tools on its owner's Windows PC ended its turn with the message below. " +
    'It can also start new Claude sessions and message other sessions itself. ' +
    'NO_HANDBACK: the message asks the owner to do nothing: a status report, what the assistant or another session will do next, ' +
    'a list of items waiting on the owner\'s approval, gate or decision, a deliverable the owner can open if they like, or a question asking the owner for information only they have. ' +
    'DOABLE_BY_CLAUDE: it tells the owner to do at least one step (a command to run, a file to edit, a check, a prompt to paste into a new session, a "later" item) the assistant could do itself with its tools. ' +
    'NEEDS_OWNER: every step it leaves truly needs the owner: physical hardware or BIOS, a GUI-only action with no tool, entering passwords, credentials or payment, ' +
    'signing in or logging in to a site (2FA, Singpass, OAuth consent), approving a decision, switching permission mode (auto mode, bypass permissions) or approving permission/allow rules, ' +
    'or something the assistant or the auto-mode classifier was refused permission for.\n\n' +
    `Flagged sentence: "${flagged}"\n\n` +
    `Message:\n"""\n${msg}\n"""`
  )
}
