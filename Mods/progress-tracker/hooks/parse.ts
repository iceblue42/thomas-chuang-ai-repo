// Pure parsers for a repo's plan doc and the multi-agent-building `.mab/` log.
import type { ChunkRow, LaneRow, PlanItem, PlanSection } from '../types'

export type MabEvent = { t?: string; session?: string; type?: string; [k: string]: unknown }

// MAB phases and the sub-steps each walks through (SKILL.md Phase 0-6).
export const PIPELINE = [
  { name: 'Triage', steps: ['triage', 'open log'] },
  { name: 'Recon', steps: ['recon'] },
  { name: 'Plan', steps: ['planning', 'plan review', 'apportion'] },
  { name: 'Tests', steps: ['test writing', 'test review', 'confirm RED'] },
  { name: 'Implement', steps: ['implementing', 'gates'] },
  { name: 'Review', steps: ['code review', 'triage', 'fixes'] },
  { name: 'Ship', steps: ['verify', 'release gate', 'commit'] },
] as const

// event type -> { phase: substep index }; the last matching event of the phase wins
const SUBSTEP: Record<string, Record<number, number>> = {
  dispatch: { 2: 0, 3: 0, 4: 0, 5: 2 },
  review_round: { 2: 1, 3: 1, 5: 0, 6: 1 },
  codex_call: { 2: 1, 3: 1, 5: 0, 6: 1 },
  triage: { 2: 1, 3: 1, 5: 1 },
  gates: { 3: 2, 4: 1 },
  chunk_done: { 4: 1 },
  verify: { 6: 0 },
  release_gate: { 6: 1 },
  commit: { 6: 2 },
}

const lines = (text: string) => text.split(/\r?\n/)
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** `Name: value` from STATE.md / lane files, where several fields can share a line (split on 2+ spaces). */
export const field = (text: string, name: string) =>
  new RegExp(`(?:^[-*\\s]*|\\s{2,})${esc(name)}:\\s*(.+?)(?=\\s{2,}[A-Z][\\w ]{0,20}:|$)`, 'm').exec(text)?.[1]?.trim() ?? ''

/** Top-level `- [ ]` / `- [x]` items grouped under their nearest heading. */
export const parsePlanDoc = (md: string): PlanSection[] => {
  const sections: PlanSection[] = []
  let heading = ''
  let fenced = false
  for (const line of lines(md)) {
    if (/^\s*```/.test(line)) fenced = !fenced
    if (fenced) continue
    const h = /^#{1,6}\s+(.*)/.exec(line)
    if (h) { heading = (h[1] ?? '').trim(); continue }
    const c = /^[-*] \[([ xX])\]\s+(.*)/.exec(line)
    if (!c) continue
    const raw = c[2] ?? ''
    const bold = /^\*\*(.+?)\*\*/.exec(raw)
    const text = (bold?.[1] ?? raw).replace(/\*\*|`/g, '').trim().replace(/[.:]$/, '')
    const id = itemId(text)
    let sec = sections[sections.length - 1]
    if (!sec || sec.heading !== heading) sections.push((sec = { heading, items: [] }))
    sec.items.push({ id, text, done: c[1] !== ' ' })
  }
  return sections
}

/** Leading item id: P0.8, P1.10, R.0, R.12, 3.2a. */
export const itemId = (text: string) => /^([A-Z]{0,3}\.?\d+(?:\.\d+)*[a-z]?)\b/.exec(text)?.[1] ?? ''

export const countItems = (sections: PlanSection[]) => sections.reduce((n, s) => n + s.items.length, 0)

const named = (text: string, id: string) => new RegExp(`(^|[^\\w.])${esc(id)}(?!\\w|\\.\\d)`).test(text)

/**
 * Plan item ids a run covers: the ids its title names; failing that, for a "Phase N…" run,
 * the ids of plan section "Phase N" that its PLAN.md names.
 */
export const coveredItems = (sections: PlanSection[], title: string, planText: string) => {
  const items = sections.flatMap(s => s.items).filter(i => i.id)
  const inTitle = items.filter(i => named(title, i.id)).map(i => i.id)
  if (inTitle.length) return inTitle
  const phase = /Phase\s+(\d+)/i.exec(title)?.[1]
  if (phase === undefined) return []
  return sections
    .filter(s => new RegExp(`^Phase\\s+${phase}\\b`, 'i').test(s.heading))
    .flatMap(s => s.items)
    .filter(i => i.id && named(planText, i.id))
    .map(i => i.id)
}

/** Ticks from other checkouts' copies of the plan doc (worktree branches tick independently). */
export const mergeTicks = (base: PlanSection[], copies: PlanSection[][]) => {
  const key = (i: PlanItem) => i.id || i.text
  const done = new Set(copies.flat().flatMap(s => s.items).filter(i => i.done).map(key))
  return base.map(s => ({ ...s, items: s.items.map(i => ({ ...i, done: i.done || done.has(key(i)) })) }))
}

export type ItemState = 'done' | 'current' | 'built' | 'paused' | 'todo'
const NONE = new Set<string>()
export const itemState = (i: PlanItem, current: Set<string>, built: Set<string>, paused: Set<string> = NONE): ItemState =>
  i.done ? 'done' : current.has(i.id) ? 'current' : paused.has(i.id) ? 'paused' : built.has(i.id) ? 'built' : 'todo'

/** The section to expand: the one holding an in-progress item, else the first with untouched work. */
export const focusIndex = (sections: PlanSection[], current: Set<string>, built: Set<string>, paused: Set<string> = NONE) => {
  const f = sections.findIndex(s => s.items.some(i => itemState(i, current, built, paused) === 'current'))
  if (f >= 0) return f
  const open = (s: PlanSection) => s.items.some(i => itemState(i, current, built, paused) === 'todo')
  // a doc with "Phase N" / "Phase R" sections advances phase by phase; side sections (e.g. "7A. Memory policy") stay listed but don't take focus
  const phased = sections.findIndex(s => /^Phase\s+\S/i.test(s.heading) && open(s))
  return phased >= 0 ? phased : sections.findIndex(open)
}

const STATUS: [RegExp, ItemState][] = [
  [/^done\b/i, 'done'],
  [/^committed\b/i, 'built'],
  [/^in[ -]progress\b/i, 'current'],
  [/^paused\b/i, 'paused'],
  [/^not[ -]started\b/i, 'todo'],
]

/**
 * Status tables the orchestrator keeps in the plan doc (`| Task | Status | Detail |`): one state per
 * item id, read from the first cell's leading id. Rows naming no plan item (e.g. "Gate R") are skipped.
 */
export const statusRows = (md: string) => {
  const out: Record<string, { state: ItemState; detail: string }> = {}
  let head: string[] | null = null
  let fenced = false
  for (const l of lines(md)) {
    if (/^\s*```/.test(l)) fenced = !fenced
    if (fenced || !l.trimStart().startsWith('|')) { head = null; continue }
    if (/^\s*\|[\s:|-]+\|?\s*$/.test(l)) continue
    const cells = l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim().replace(/`|\*\*/g, ''))
    if (!head) { head = cells.map(c => c.toLowerCase()); continue }
    const si = head.indexOf('status')
    if (si < 0) continue
    const id = itemId(cells[0] ?? '')
    const state = STATUS.find(([re]) => re.test(cells[si] ?? ''))?.[1]
    if (id && state) out[id] = { state, detail: cells[head.indexOf('detail')] ?? '' }
  }
  return out
}

/** Rows of the first markdown table (after `heading`, when given) as lower-cased-header records. */
export const table = (md: string, heading?: string): Record<string, string>[] => {
  const all = lines(md)
  const start = heading ? all.findIndex(l => new RegExp(`^#+\\s+${esc(heading)}\\b`, 'i').test(l)) : -1
  if (heading && start < 0) return []
  const rows: string[][] = []
  for (const l of all.slice(start + 1)) {
    if (heading && rows.length === 0 && /^#/.test(l)) break
    if (!l.trimStart().startsWith('|')) { if (rows.length) break; continue }
    if (/^\s*\|[\s:|-]+\|?\s*$/.test(l)) continue
    rows.push(l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim().replace(/`/g, '')))
  }
  const [head, ...body] = rows
  return head ? body.map(r => Object.fromEntries(head.map((h, i) => [h.toLowerCase(), r[i] ?? '']))) : []
}

export const parseEvents = (jsonl: string): MabEvent[] =>
  lines(jsonl).flatMap(l => {
    if (!l.trim()) return []
    try { return [JSON.parse(l) as MabEvent] } catch { return [] }
  })

export const parseLane = (md: string): LaneRow => ({
  id: /^#\s*Lane\s+(\S+)/m.exec(md)?.[1] ?? '?',
  session: field(md, 'Session'),
  status: field(md, 'Status'),
  chunks: field(md, 'Chunks'),
  progress: field(md, 'Progress'),
  review: field(md, 'Review'),
  last: field(md, 'Last update'),
})

export const phaseOf = (state: string, events: MabEvent[]) => {
  const text = field(state, 'Phase')
  const complete = events.some(e => e.type === 'run_complete') || /^\s*(complete|done|shipped)\b/i.test(text)
  const n = complete ? 7 : Number(/^(\d)/.exec(text)?.[1] ?? -1)
  // from this phase's start; when it was never logged, from the latest phase boundary of any phase
  let since = -1
  let boundary = -1
  events.forEach((e, i) => {
    if (e.type === 'phase_start' && Number(e.phase) === n) since = i
    if (e.type === 'phase_start' || e.type === 'phase_end') boundary = i
  })
  if (since < 0) since = boundary
  let substep = 0
  if (n >= 0 && n < 7) for (const e of events.slice(since + 1)) substep = SUBSTEP[e.type ?? '']?.[n] ?? substep
  return { phase: n, phaseText: text.replace(/^\d+\s*[—–-]\s*/, ''), substep }
}

const split = (s: string) => s.split(/[\s,]+/).filter(Boolean)

export const chunkRows = (plan: string, events: MabEvent[], lanes: LaneRow[], complete: boolean): ChunkRow[] => {
  const done = new Set(events.filter(e => e.type === 'chunk_done').map(e => String(e.chunk)))
  const active = new Set(events.filter(e => e.type === 'dispatch' && e.chunk !== undefined).map(e => String(e.chunk)))
  for (const l of lanes) {
    const set = /^DONE|^RELEASED/i.test(l.status) ? done : /^ACTIVE/i.test(l.status) ? active : null
    split(l.chunks).forEach(c => set?.add(c))
  }
  const rows = table(plan, 'Chunks').map(r => ({
    id: r.id ?? r.chunk ?? Object.values(r)[0] ?? '',
    steps: r.steps ?? '',
    lane: r.lane ?? '',
  }))
  // a dispatched chunk counts done once a later chunk in the same lane is done (the tests chunk never logs chunk_done)
  const laneOf = (r: { lane: string }) => r.lane.split(/\s/)[0] ?? ''
  const laterDone = (i: number) => rows.slice(i + 1).some(r => done.has(r.id) && laneOf(r) === laneOf(rows[i]!))
  return rows.map((r, i): ChunkRow => ({
    ...r,
    status: complete || done.has(r.id) || (active.has(r.id) && laterDone(i)) ? 'done' : active.has(r.id) ? 'active' : 'todo',
  }))
}

export const openFindings = (md: string) =>
  table(md).filter(r => /^open\b/i.test(r.status ?? '')).map(r => (r.sev ?? r.severity ?? '?').toUpperCase())

const SKIP = new Set(['t', 'ts', 'session', 'type', 'brief', 'expect_min'])
const hhmm = (t: string) => {
  const d = new Date(t)
  return Number.isNaN(d.getTime()) ? t.slice(11, 16) : d.toTimeString().slice(0, 5)
}
export const describeEvent = (e: MabEvent) => {
  const bits = Object.entries(e).filter(([k, v]) => !SKIP.has(k) && v !== null && typeof v !== 'object').map(([, v]) => String(v))
  return `${hhmm(String(e.t ?? e.ts ?? ''))} ${e.session ?? '?'} ${String(e.type ?? '').replace(/_/g, ' ')} ${bits.join(' ')}`.trim()
}

/** `.md` paths a run's PLAN/STATE mention, minus the `.mab/` log's own files. */
export const mdRefs = (text: string) =>
  [...new Set(text.match(/[\w][\w./-]*\.md\b/g) ?? [])].filter(
    p => !/^(\.mab\/)?(briefs|reviews|lanes|runs)\//.test(p) && !/^(STATE|PLAN|DESIGN|DECISIONS|JOURNAL|LEDGER|FINDINGS|HANDOFF[\w-]*|NOTE[\w-]*)\.md$/.test(p.replace(/^.*\//, '')),
  )
