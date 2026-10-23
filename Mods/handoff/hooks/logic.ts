// Pure logic of the handoff mod: no `$`, no I/O. Everything here is covered by logic.test.ts.
import type { HandoffEntry, HandoffKind } from '../types'

export const MARKERS = ['[handoff]', '[pager]', '[house-rules]', '[no-handbacks]', '[visual-gate]'] as const
const USER_ORIGINS = new Set(['composer', 'bridge', 'sdk'])
const KEY_CHARS = 200
const MIN_KEY_CHARS = 40
const MAX_INTENT_CHARS = 500
export const SHELF_CAP = 30

// ---------- paths ----------

export const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '')
export const join = (a: string, b: string) => `${norm(a)}/${b}`
export const base = (p: string) => norm(p).replace(/^.*\//, '')
/** Store key for a repo's shelf: Windows paths are case-insensitive, so the key is lowercased. */
export const shelfKey = (main: string) => `shelf:${norm(main).toLowerCase()}`

/** A file Claude writes for a `/handoff`: `<repo>/.mab/handoffs/*.md` or `<repo>/.handoffs/*.md`. */
export const isHandoffPath = (p: string) => /\/(?:\.mab\/handoffs|\.handoffs)\/[^/]+\.md$/i.test(norm(p))

/**
 * A paste-ready next-session prompt written under `.mab/` (seen in EVI: NEXT-SESSION-PROMPT.md,
 * NEXT-SESSION-PROMPT-phase2.md, briefs/next-session-prompt.md, briefs/approval-gate-session-prompt.md,
 * reviews/FOLLOWUPS-PROMPT.md, HOLDING-PROMPTS.md): `NEXT-SESSION*.md`, or a name with the word `prompt(s)`
 * in it. Prompts addressed to Codex (codex-prompt-*.md) are not ingested; `noprompt` is not the word.
 */
export function isSessionPromptPath(p: string) {
  const m = /\/\.mab\/(?:[^/]+\/)*([^/]+)\.md$/i.exec(norm(p))
  if (!m) return false
  const name = m[1]!
  if (/^codex-prompt-/i.test(name)) return false
  return /^next-session/i.test(name) || /(?:^|[-_.])prompts?(?:[-_.]|$)/i.test(name)
}

/** MAB's saved armed holding prompts: `<repo>/.mab/HOLDING-PROMPTS.md`. */
export const isHoldingFilePath = (p: string) => /\/\.mab\/(?:[^/]+\/)*HOLDING-PROMPTS\.md$/i.test(norm(p))

/** A MAB brief (`.mab/**\/briefs/*.md`): shelved only in a turn whose prompt asked for a next-session prompt. */
export const isBriefPath = (p: string) => /\/\.mab\/(?:[^/]+\/)*briefs\/[^/]+\.md$/i.test(norm(p))

export type PromptFileKind = 'handoff' | 'holding' | 'session-prompt' | 'brief'
/** Which kind of shelvable prompt file a Write/Edit touched; null for any other file. */
export function classifyPath(p: string): PromptFileKind | null {
  if (isHandoffPath(p)) return 'handoff'
  if (/^codex-prompt-/i.test(base(p))) return null
  if (isHoldingFilePath(p)) return 'holding'
  if (isSessionPromptPath(p)) return 'session-prompt'
  if (isBriefPath(p)) return 'brief'
  return null
}

/** Whether a Write/Edit of `p` is shelved: briefs only in a turn where the person asked for a next-session prompt. */
export function shouldShelve(p: string, intentTurn: boolean) {
  const kind = classifyPath(p)
  return kind !== null && (kind !== 'brief' || intentTurn)
}

/** Where `/handoff` asks Claude to write: the main checkout's .mab, else this checkout's, else <main>/.handoffs. */
export function handoffDir(main: string, root: string, mainHasMab: boolean, rootHasMab: boolean) {
  if (mainHasMab) return join(main, '.mab/handoffs')
  if (rootHasMab) return join(root, '.mab/handoffs')
  return join(main, '.handoffs')
}

const pad = (n: number) => String(n).padStart(2, '0')
/** Local-time `YYYYMMDD-HHMM`. */
export const stamp = (d: Date) =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`

// ---------- prompts ----------

/** True for a prompt the person sent (terminal, phone bridge, desktop app) that no mod queued. */
export function isRealUserPrompt(origin: { kind: string }, text: string) {
  if (!USER_ORIGINS.has(origin.kind)) return false
  const head = text.trimStart().toLowerCase()
  return !MARKERS.some(m => head.startsWith(m))
}

const VERB = '(?:give|write|output|print|draft|generate|make|prepare|produce|create|send)'
const NEXT = '(?:new|next|fresh|another|following|different|separate|clean)'
const SESSION = '(?:claude\\s+)?(?:session|chat|conversation)s?\\b'
/** "a [combined] prompt", "give me the prompt", or a text opening with "prompt": one asked for, not talked about. */
const ASKED = `(?:^prompts?\\b|(?:\\b(?:a|an|one|another)\\s+|\\b${VERB}\\s+(?:me\\s+|us\\s+)?(?:the\\s+|a\\s+|an\\s+)?)(?:[\\w-]+\\s+){0,3}?prompts?\\b)`
const KICK = '(?:kick(?:s|ing)?[- ]?off|kick-?start)'
const INTENT = [
  // "give me the prompt for the next session", "give me a prompt to close out Phase 3 in a different session"
  new RegExp(`(?:\\b${VERB}\\b|\\b(?:need|want)\\s+(?:a|an|another|one)\\b)[^.?!\\n]{0,40}?\\bprompts?\\b[^.?!\\n]{0,80}?\\b${NEXT}\\s+${SESSION}`, 'i'),
  // "write the next-session prompt"
  new RegExp(`\\b${VERB}\\b[^.?!\\n]{0,40}?\\b${NEXT}[- ](?:session|chat)\\s+prompts?\\b`, 'i'),
  // "a prompt for a new session", "a prompt to resume the run in a fresh session"
  new RegExp(`${ASKED}\\s+(?:for|to\\b[^.?!\\n]{0,80}?\\b(?:in|for|into|on))\\s+(?:(?:a|an|the)\\s+)?${NEXT}\\s+${SESSION}`, 'i'),
  // "I need a prompt to kick off phase 5", "a prompt to start phase 6"
  new RegExp(`${ASKED}\\s+(?:to|for|that)\\s+(?:[\\w-]+\\s+){0,2}?(?:${KICK}\\b|(?:start|begin|continue|resume|close[- ]out|finish)\\s+(?:the\\s+)?phase\\s+\\w+)`, 'i'),
  // "give me a kickoff prompt", "kickoff prompt for phase 6"
  new RegExp(`(?:^|\\b(?:a|an|me|${VERB}|need|want)\\b[^.?!\\n]{0,40}?)\\b${KICK}\\s+prompts?\\b`, 'i'),
]

/**
 * The person asking for a next-session prompt. Long texts are skipped: a pasted next-session prompt
 * often says "at the end, give me the prompt for the next session" and must not trigger here.
 */
export function isHandoffIntent(text: string) {
  const t = text.trim()
  if (t.length > MAX_INTENT_CHARS || t.includes('[handoff]')) return false
  return INTENT.some(re => re.test(t))
}

export type Args = { shutdown: boolean; note: string }
/** `/handoff [--shutdown] [note...]`; the flag may appear anywhere. */
export function parseArgs(args: string): Args {
  const words = args.trim().split(/\s+/).filter(Boolean)
  const shutdown = words.some(w => w === '--shutdown')
  return { shutdown, note: words.filter(w => w !== '--shutdown').join(' ') }
}

export type PromptSpec = { dir: string; stamp: string; project: string; createdIso: string; shutdown: boolean; note: string }

function rules(s: PromptSpec) {
  return [
    `Save it to \`${s.dir}/${s.stamp}-<slug>.md\` (<slug>: 2-5 word kebab-case name of the next task; create the folder if missing). File format:`,
    '```',
    '---',
    'title: <one line naming the next task>',
    `project: ${s.project}`,
    `created: ${s.createdIso}`,
    'kind: next-session        # or `holding` for a MAB holding prompt',
    'role: <O2|W-A|...>        # only when the prompt is for a MAB role; otherwise omit this line',
    ...(s.shutdown ? ['safe-to-shutdown: yes|no'] : []),
    '---',
    '<the prompt body: exactly what the owner pastes into the new session>',
    '```',
    'Rules for the body:',
    '- ONE combined prompt. Never split it into parts, options or several blocks.',
    '- Start with a git sync step (fetch, confirm branch and HEAD sha, pull or rebase as appropriate).',
    "- Name the plan/brief doc by path (e.g. EVI-AUTONOMY-BRIEF.md) and the active run's STATE.md (`.mab/runs/<run-id>/STATE.md`) if there is one.",
    '- State the commit/push state: branch, HEAD sha, what is committed, pushed or not, any uncommitted files.',
    '- List the open follow-ups and the decisions made in THIS session.',
    "- Do not carry forward constraints the owner overrode during this session; state the rule as it now stands.",
    ...(s.note ? [`- Include the owner's note: ${s.note}`] : []),
    ...(s.shutdown
      ? [
          '',
          'Set `safe-to-shutdown: no` if any other Claude session is still mid-work (check with ListAgents), or if anything in this repo or its worktrees is uncommitted or unpushed; otherwise `yes`.',
          'Do not shut the computer down yourself: the handoff mod does that after this turn, only when the file says yes and git is clean and pushed.',
        ]
      : []),
    'Then print the same body in your reply as one fenced block.',
  ]
}

/** The `[handoff]` prompt `/handoff` queues. */
export const handoffPrompt = (s: PromptSpec) =>
  ['[handoff] Write ONE combined, paste-ready prompt for the next session.', ...rules(s)].join('\n')

/** What the auto-trigger appends to the person's own "give me the prompt for the next session". */
export const intentSuffix = (s: PromptSpec) =>
  ['', '', '[handoff] Also save that combined prompt as a file.', ...rules(s)].join('\n')

// ---------- frontmatter ----------

export type Parsed = { meta: Record<string, string>; body: string }
/** `---\nkey: value\n---\nbody`; a file without frontmatter is all body. Inline `# comments` are dropped. */
export function parseFrontmatter(text: string): Parsed {
  const src = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  const m = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(src)
  if (!m) return { meta: {}, body: src.trim() }
  const meta: Record<string, string> = {}
  for (const line of m[1]!.split('\n')) {
    const kv = /^([A-Za-z][\w-]*)\s*:\s*(.*)$/.exec(line)
    if (!kv) continue
    const value = kv[2]!.replace(/\s+#.*$/, '').trim().replace(/^(['"])(.*)\1$/, '$2')
    meta[kv[1]!.toLowerCase()] = value
  }
  return { meta, body: src.slice(m[0].length).trim() }
}

const firstLine = (body: string) => (body.split('\n').find(l => l.trim()) ?? '').replace(/^#+\s*/, '').trim()
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

// ---------- shelf ----------

/** Whitespace collapsed, lowercased: what "the same prompt" means when comparing pasted text. */
export const normalize = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase()
export const keyOf = (body: string) => normalize(body).slice(0, KEY_CHARS)

/** A shelf entry from a handoff or session-prompt file; null when it holds no body. */
export function entryFromFile(path: string, text: string, project: string, now: number): HandoffEntry | null {
  const { meta, body } = parseFrontmatter(text)
  if (!body) return null
  const kind: HandoffKind = meta.kind === 'holding' ? 'holding' : 'next-session'
  const created = Date.parse(meta.created ?? '')
  return {
    id: `file:${norm(path).toLowerCase()}`,
    title: clip(meta.title || firstLine(body) || base(path), 100),
    kind,
    ...(meta.role ? { role: meta.role } : {}),
    project: meta.project || project,
    path: norm(path),
    created: Number.isFinite(created) ? created : now,
    body,
    key: keyOf(body),
    used: false,
  }
}

const HOLD_START = /^Invoke the multi-agent-building(?:-local)? skill in hold mode/i
/** MAB's armed holding prompts, which it prints in chat as fenced blocks at the end of Phase 2. */
export function holdingPrompts(answer: string, project: string, now: number): HandoffEntry[] {
  const out: HandoffEntry[] = []
  for (const m of answer.replace(/\r\n?/g, '\n').matchAll(/^```[^\n]*\n([\s\S]*?)\n```/gm)) {
    const body = m[1]!.trim()
    if (!HOLD_START.test(body)) continue
    const role = /`hold ([\w-]+)`/.exec(body)?.[1] ?? ''
    const task = /Task:\s*([^\n·]+)/.exec(body)?.[1]?.trim() ?? ''
    out.push({
      id: `hold:${keyOf(body)}`,
      title: clip(`MAB hold ${role}${task ? ` · ${task}` : ''}`, 100),
      kind: 'holding',
      ...(role ? { role } : {}),
      project,
      created: now,
      body,
      key: keyOf(body),
      used: false,
    })
  }
  return out
}

const FENCE = /^```[^\n]*\n([\s\S]*?)\n```/m
/** `## O2 — orchestrator successor` → `O2`; a heading with no ` — ` part is its own label. */
const headLabel = (heading: string) => heading.split(/\s+[—–-]\s+/)[0]!.trim()

/**
 * MAB's saved holding prompts (`.mab/HOLDING-PROMPTS.md`): one entry per `## <role> — ...` section that
 * holds a fenced block (the block is the prompt; sections without one, like "Delivery", are notes).
 * A file without such sections is shelved whole as one holding entry; empty, it gives nothing.
 */
export function holdingFileEntries(path: string, text: string, project: string, now: number): HandoffEntry[] {
  const src = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  const out: HandoffEntry[] = []
  for (const [i, section] of src.split(/^## /m).slice(1).entries()) {
    const heading = section.split('\n', 1)[0]!.trim()
    const body = FENCE.exec(section)?.[1]?.trim()
    if (!body) continue
    const label = headLabel(heading)
    const role = /`hold ([\w-]+)`/.exec(body)?.[1] ?? (label.length <= 24 ? label : '')
    const task = /Task:\s*([^\n·]+)/.exec(body)?.[1]?.trim() ?? ''
    out.push({
      id: `file:${norm(path).toLowerCase()}#${(role || String(i)).toLowerCase()}`,
      title: clip(task ? `MAB hold ${role} · ${task}` : heading, 100),
      kind: 'holding',
      ...(role ? { role } : {}),
      project,
      path: norm(path),
      created: now,
      body,
      key: keyOf(body),
      used: false,
    })
  }
  if (out.length) return out
  const whole = entryFromFile(path, text, project, now)
  return whole ? [{ ...whole, kind: 'holding' }] : []
}

/**
 * Adds an entry, newest first, capped. A rewrite of the same file replaces its entry (unused again)
 * unless its body is unchanged; a body already shelved under another id is left as is.
 */
export function addEntry(shelf: readonly HandoffEntry[], entry: HandoffEntry): HandoffEntry[] {
  if (shelf.some(e => e.id === entry.id && e.body === entry.body)) return [...shelf]
  const rest = shelf.filter(e => e.id !== entry.id)
  if (rest.some(e => e.key === entry.key)) return [...shelf]
  return [entry, ...rest].sort((a, b) => b.created - a.created).slice(0, SHELF_CAP)
}

export const setUsed = (shelf: readonly HandoffEntry[], id: string, at: number): HandoffEntry[] =>
  shelf.map(e => (e.id === id && !e.used ? { ...e, used: true, usedAt: at } : e))

/** Ids of unused entries the pasted prompt starts with (first ~200 normalized chars). */
export function matchUsed(shelf: readonly HandoffEntry[], prompt: string): string[] {
  const p = normalize(prompt)
  return shelf.filter(e => !e.used && e.key.length >= MIN_KEY_CHARS && p.startsWith(e.key)).map(e => e.id)
}

// ---------- shutdown ----------

export type GitFacts = { exitCode: number; stdout: string }
export type Decision = { ok: true } | { ok: false; reason: string }

/** Paths in `git status --porcelain=v2 --branch` entry lines. */
export function porcelainPaths(stdout: string): string[] {
  return stdout
    .split(/\r?\n/)
    .filter(l => l && !l.startsWith('#'))
    .map(l => {
      const f = l.split(' ')
      if (l.startsWith('1 ')) return f.slice(8).join(' ')
      if (l.startsWith('2 ')) return f.slice(9).join(' ').split('\t')[0]!
      if (l.startsWith('u ')) return f.slice(10).join(' ')
      return l.slice(2)
    })
}

/** `# branch.ab +A -B`: commits ahead of upstream, or null when the branch has no upstream. */
export function aheadCount(stdout: string): number | null {
  const m = /^# branch\.ab \+(\d+) -\d+/m.exec(stdout)
  return m ? Number(m[1]) : null
}

const inHandoffDir = (p: string) => /^(?:\.mab\/handoffs|\.handoffs)(?:\/|$)/i.test(norm(p).replace(/^"|"$/g, ''))

/**
 * Shut down only when the handoff file says `safe-to-shutdown: yes`, the working tree is clean
 * (the handoff file itself excepted) and the branch is not ahead of its upstream.
 */
export function shutdownDecision(fileText: string | null, git: GitFacts | null): Decision {
  if (fileText === null) return { ok: false, reason: 'no handoff file was written this turn' }
  const safe = (parseFrontmatter(fileText).meta['safe-to-shutdown'] ?? '').toLowerCase()
  if (safe !== 'yes') return { ok: false, reason: `the handoff says safe-to-shutdown: ${safe || 'missing'}` }
  if (!git || git.exitCode !== 0) return { ok: false, reason: 'git status failed' }
  const dirty = porcelainPaths(git.stdout).filter(p => !inHandoffDir(p))
  if (dirty.length) return { ok: false, reason: `${dirty.length} uncommitted change(s), e.g. ${dirty[0]}` }
  const ahead = aheadCount(git.stdout)
  if (ahead === null) return { ok: false, reason: 'the branch has no upstream, so push state is unknown' }
  if (ahead > 0) return { ok: false, reason: `${ahead} commit(s) not pushed` }
  return { ok: true }
}

// ---------- display ----------

export function age(ms: number) {
  const m = Math.max(0, Math.round(ms / 60_000))
  if (m < 60) return `${m}m`
  const h = Math.round(m / 60)
  return h < 48 ? `${h}h` : `${Math.round(h / 24)}d`
}
