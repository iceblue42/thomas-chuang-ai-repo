// Pure prefilter: does an assistant's final message hand the owner work?

export type Detection = {
  hit: boolean
  quote: string // short quote of the handback, for the nudge
  ownerBlock: boolean // a fenced shell block addressed to the owner
  nonPs51: boolean // ...written as bash, or with a heredoc or && (breaks in PowerShell 5.1)
}

const NONE: Detection = { hit: false, quote: '', ownerBlock: false, nonPs51: false }

// Cues that address the owner by themselves.
const STRONG = [
  /\byou(?:'ll| will| would)? (?:need|have) to\b/i,
  /\byou'?ll want to\b/i,
  // not a relative clause ("a page you can open" describes a deliverable, it hands nothing back)
  /(?<!\b(?:a|an|the|this|that|which|any|some)\s+(?:\w+\s+){1,2})\byou (?:can|could|may|might|should) (?:now |also |then |just )?(?:run|re-?run|execute|paste|copy|type|open|restart|reboot|install|delete|remove|edit|add|check|verify|confirm|test|try)\b/i,
  /\bon your (?:end|side|machine|pc|computer)\b/i,
  // no "console": in these projects that is usually an app's web console, not a shell
  /\bin your (?:own )?(?:terminal|shell|powershell|command prompt)\b/i,
  /\bfor you to\b/i,
  /\bnext time you\b/i,
  /\bwhen(?:ever)? you (?:get a chance|have a (?:moment|minute|sec))\b/i,
]

// Cues that count only when the sentence addresses the owner (you/your) or is an imperative.
const WEAK = [
  /\bmanually\b/i,
  // ponytail: no bare "later": status lines ("later sessions", "later, your Gate R") were the top false positive
  /\bcopy(?:[- ]and[- ]|\s*\/\s*|-)paste\b/i,
  /\bpaste (?:this|these|the following|it|that)\b/i,
  /\brun (?:this|these|the following|that|it)\b/i,
  /\badd (?:this|these|the following)(?: lines?)? to\b/i,
  /\bin (?:an? )?(?:elevated |admin(?:istrator)? )?(?:powershell|terminal|command prompt|cmd)\b/i,
]

const ADDRESSED = /\byou(?:r|'ll|'d|'re)?\b/i
const IMPERATIVE =
  /^(?:then |next,? |first,? |finally,? |now,? |just |please )?(?:run|re-?run|paste|copy|open|execute|type|install|edit|add|go to|navigate)\b/i

// Steps only the owner can do; a sentence naming one is not a handback the prefilter counts.
const OWNER_ONLY = [
  /\b(?:passwords?|passphrase|credentials?|credit card|payment|bios|uefi|reseat|unplug|plug (?:it )?in|cables?|power button|physically|ram sticks?|dimms?|motherboard|psu|uac|approve|approval|your (?:decision|call)|(?:permission|access) (?:was |is )?denied|was denied|refused|not permitted)\b/i,
  // signing in to a site: 2FA, Singpass, OAuth consent, an account tied to another provider
  /\b(?:sign(?:ing|ed|s)?[- ]?(?:in|on|up)|log(?:ging|ged|s)?[- ]?(?:in(?:to)?|on)|re-?authenticat\w*|2fa|mfa|otp|one-time code|verification code|singpass|oauth consent|consent screen|captcha|account (?:is |was )?(?:tied|linked|connected) to)\b/i,
  // permission mode and permission rules, and what the auto-mode classifier refused
  /\b(?:auto[- ]?mode|bypass[- ]?permissions?|permission[- ]mode|permission rules?|allow[- ]?rules?|allow[- ]?list(?:ed)?|plan mode|accept[- ]edits mode)\b/i,
  /\ballow\s+`[^`\n]+`/i,
  /\bclassifier\b[^.\n]{0,60}\b(?:refused|denied|blocked|rejected)\b/i,
]

const ownerOnly = (s: string) => OWNER_ONLY.some(r => r.test(s))

// The model's own next step, not the owner's.
const SELF = /\b(?:I|I'll|I will|I'm|I am|let me|we'll)\b/

const SHELL_LANG = /^(?:powershell|pwsh|ps1?|bash|sh|shell|zsh|cmd|bat|batch|console|shell-session|terminal)$/i
// An untagged block counts as a command only when its first line starts like one (never prose or a pasted prompt).
// Case-sensitive: commands are lowercase or PowerShell Verb-Noun; prose starts with a capitalised word.
const CMD_START =
  /^(?:(?:sudo|ssh|scp|rsync|cd|ls|dir|cat|echo|git|gh|npm|npx|pnpm|yarn|bun|node|deno|python3?|py|pip3?|uv|docker|wsl|curl|wget|systemctl|journalctl|service|apt(?:-get)?|brew|choco|winget|scoop|claude|ollama|cargo|go|dotnet|make|kubectl|helm|terraform|az|aws|gcloud|reg|sc|netsh|ipconfig|ping|powershell|pwsh|cmd|icacls|robocopy|rm|cp|mv|mkdir|chmod|chown|tar|unzip|export|source|(?:Get|Set|New|Remove|Start|Stop|Restart|Add|Invoke|Test|Copy|Move|Rename|Enable|Disable|Import|Export|Install|Uninstall|Update|Clear|Write|Select|Where|ForEach|Register|Unregister|Resolve|Measure|Wait|Mount|Dismount|Repair|Reset|Format|ConvertTo|ConvertFrom|Expand|Compress|Push|Pop|Join|Split|Out|Unblock)-[A-Z]\w+)(?:\s|$)|\.{1,2}[\\/]|&\s*['"]?\S)/
const BASH_LANG = /^(?:bash|sh|shell|zsh|shell-session)$/i
const HEREDOC = /<<-?\s*['"]?\w+/
const AND_AND = /&&/

const FENCE = /^[ \t]*```([\w+-]*)[^\n]*\n([\s\S]*?)^[ \t]*```[ \t]*$/gm

type Block = { lang: string; body: string; lead: string }

const squash = (s: string) => s.replace(/\s+/g, ' ').trim()

function shorten(s: string, max = 140): string {
  const t = squash(s.replace(/[*_>#]/g, '')).replace(/"/g, "'")
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

function split(text: string): { prose: string[]; blocks: Block[] } {
  const prose: string[] = []
  const blocks: Block[] = []
  let at = 0
  for (const m of text.matchAll(FENCE)) {
    const before = text.slice(at, m.index)
    prose.push(before)
    blocks.push({ lang: m[1] ?? '', body: m[2] ?? '', lead: before.slice(-250) })
    at = (m.index ?? 0) + m[0].length
  }
  prose.push(text.slice(at))
  return { prose, blocks }
}

const sentences = (prose: string) =>
  prose
    .split(/\n+|(?<=[.!?])\s+/)
    .map(s => s.replace(/^\s*(?:[-*>]|\d+[.)])\s+/, '').trim())
    .filter(Boolean)

// Quoted phrases and inline code are mentions, not instructions: cue words inside them do not count.
// A single-quoted span must open after a boundary and close before one, so apostrophes (you'll, can't) survive.
const QUOTED = [
  /`[^`\n]*`/g,
  /"[^"\n]*"/g,
  /“[^”\n]*”/g,
  /‘[^’\n]*’/g,
  /(^|[\s([{:;,])'[^'\n]+'(?=$|[\s.,;:!?)\]}])/g,
]

const unquote = (s: string) => QUOTED.reduce((t, r) => t.replace(r, (_m, pre) => (typeof pre === 'string' ? `${pre} ` : ' ')), s)

function isCue(sentence: string): boolean {
  if (ownerOnly(sentence)) return false
  const s = unquote(sentence)
  if (STRONG.some(r => r.test(s))) return true
  if (!WEAK.some(r => r.test(s))) return false
  return ADDRESSED.test(s) || (IMPERATIVE.test(s) && !SELF.test(s))
}

function leadLine(lead: string): string {
  const lines = lead.split('\n').map(l => l.trim()).filter(Boolean)
  return lines[lines.length - 1] ?? ''
}

function looksLikeShell(body: string): boolean {
  const first = body
    .split('\n')
    .map(l => l.trim().replace(/^(?:\$|PS [^>]*>|[A-Za-z]:\\[^>]*>)\s*/, ''))
    .find(l => l && !l.startsWith('#'))
  return first !== undefined && CMD_START.test(first)
}

const isShellBlock = (b: Block) => (b.lang ? SHELL_LANG.test(b.lang) : looksLikeShell(b.body))

function isAddressed(b: Block): boolean {
  if (!isShellBlock(b)) return false
  const line = leadLine(b.lead)
  if (!line || ownerOnly(b.lead)) return false
  if (sentences(line).some(isCue)) return true
  // "To check, run:" / "Paste this into PowerShell:" introducing the block
  return /\b(?:run|re-?run|paste|execute|type|enter)\b[^:]*:\s*$/i.test(line) && !SELF.test(line)
}

export function detectHandback(text: string): Detection {
  if (!text.trim()) return NONE
  const { prose, blocks } = split(text)
  const cue = prose.flatMap(sentences).find(isCue)
  const owned = blocks.filter(isAddressed)
  if (!cue && owned.length === 0) return NONE
  const nonPs51 = owned.some(b => BASH_LANG.test(b.lang) || HEREDOC.test(b.body) || AND_AND.test(b.body))
  const first = owned[0]
  return {
    hit: true,
    quote: shorten(cue ?? (first ? leadLine(first.lead) : '')),
    ownerBlock: owned.length > 0,
    nonPs51,
  }
}

// The turn ends by asking the owner something (another mod handles decision questions).
export function endsWithQuestion(text: string): boolean {
  const t = text.trim()
  if (!t || /```\s*$/.test(t)) return false
  const { prose } = split(t)
  const lines = (prose[prose.length - 1] ?? '').split('\n').map(l => l.trim()).filter(Boolean)
  const last = (lines[lines.length - 1] ?? '').replace(/[*_)\s]+$/, '')
  return last.endsWith('?')
}

// MAB held sessions: they stop and wait for "ACTIVATE <ID>"; nothing they say is a handback.
// Looked for near the start of the session's first prompt (an armed holding prompt).
const HOLD_PROMPT = [
  /\bin hold mode\b/i,
  /^\s*\/?(?:multi-agent-building(?:-local)?|MABL?)\s+hold\s+[\w-]+/i,
  /\bMABL?\s+[\w-]+\s+Holding\b/i,
  /\bstand(?:ing)?[- ]?by for activation\b/i,
]
// A reply registering or confirming the session as held.
const HOLD_REPLY = [
  /\bHolding as [\w-]+/i,
  /\b(?:registered|registering|marked|recorded|status:?)\s+(?:as\s+)?[`*]*HOLDING\b/,
  /\bwait(?:ing)? for [`'"*]*(?:ACTIVATE\b|activation\b)/i,
  /\bstand(?:ing)?[- ]?by for activation\b/i,
]
// "ACTIVATE <ID>" from the orchestrator (possibly framed), or the person typing "activate".
const ACTIVATION = [/\bACTIVATE\s+[\w-]+/, /^\s*activate\s*[.!]?\s*$/i]

export const isHoldPrompt = (text: string) => HOLD_PROMPT.some(r => r.test(text.slice(0, 600)))
export const isHoldingReply = (text: string) => HOLD_REPLY.some(r => r.test(text))
export const isActivation = (text: string) => ACTIVATION.some(r => r.test(text))
