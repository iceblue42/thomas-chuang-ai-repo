// Pure: a MAB run's lanes and orchestrator, their last activity, stalls, and the status line.

export type MabEvent = Record<string, unknown>
export type LaneFile = { name: string; text: string; mtime: number }
export type Stamp = { name: string; mtime: number }
/** One run as read from disk (discover.ts). */
export type RunFiles = {
  id: string
  dir: string
  state: string
  stateMtime: number
  events: string
  lanes: LaneFile[]
  /** JOURNAL.md text and mtime. */
  journal?: string
  journalMtime?: number
  /** Files in the run's `gates/` and the lanes dir's non-.md files (gate logs, id lists). */
  gates?: Stamp[]
  /** Newest worktree file time per lane id, filled in only for lanes that otherwise look stalled. */
  extra?: Record<string, number>
}

export type Kind = 'done' | 'holding' | 'blocked' | 'active'
export type View = { id: string; kind: Kind; status: string; lastActivity: number; idleMin: number; stalled: boolean }

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const FUTURE_SLACK_MS = 5 * 60_000
/** A time in the future (a typo, a skewed clock) says nothing about activity. */
const sane = (t: number, now: number) => (t > 0 && t <= now + FUTURE_SLACK_MS ? t : 0)

/** `Name: value` from STATE.md / lane files, where several fields can share a line (split on 2+ spaces). */
export const field = (text: string, name: string, flags = '') =>
  new RegExp(`(?:^[-*\\s]*|\\s{2,})${esc(name)}:\\s*(.+?)(?=\\s{2,}[A-Z][\\w ]{0,20}:|$)`, `m${flags}`).exec(text)?.[1]?.trim() ?? ''

export const parseEvents = (jsonl: string): MabEvent[] =>
  jsonl.split(/\r?\n/).flatMap(l => {
    if (!l.trim()) return []
    try {
      const v: unknown = JSON.parse(l)
      return v && typeof v === 'object' ? [v as MabEvent] : []
    } catch {
      return []
    }
  })

/** MAB writes `t` (local, no zone) or `ts` (UTC, `Z`); Date reads both. */
export const eventTime = (e: MabEvent) => {
  const raw = e.t ?? e.ts
  const ms = typeof raw === 'string' ? Date.parse(raw) : NaN
  return Number.isNaN(ms) ? 0 : ms
}

/** The session that wrote the event (`session`, or `by` in the older shape). */
export const eventAuthor = (e: MabEvent) => String(e.session ?? e.by ?? '')
const eventType = (e: MabEvent) => e.type ?? e.event

export const isComplete = (state: string, events: MabEvent[]) =>
  events.some(e => eventType(e) === 'run_complete') ||
  /^\s*(?:run\s+)?(complete|done|shipped)\b/i.test(field(state, 'Phase')) ||
  /^\s*(complete|done|shipped)\b/i.test(field(state, 'Status', 'i'))

/** DONE, MERGED and RELEASED (any case, leading word) mean the lane is finished. */
export const isTerminal = (status: string) => /^\W*(DONE|MERGED|RELEASED)\b/i.test(status)

export const laneKind = (status: string): Kind =>
  isTerminal(status) ? 'done'
  : /^(HOLDING|PLANNED)\b/i.test(status) ? 'holding'
  : /^BLOCKED\b/i.test(status) ? 'blocked'
  : 'active'

/** Lane id: its `Session:` field (W-A), else the file name. */
export const laneId = (f: LaneFile) => field(f.text, 'Session').split(/\s/)[0] || f.name.replace(/\.md$/i, '')

/** The names a lane goes by: `W-A`, `A` (file A.md or session W-A). */
export const laneAliases = (f: LaneFile) => {
  const id = laneId(f)
  const letter = /^W-(\w+)$/.exec(id)?.[1] ?? /^(?:W-)?([A-Z][A-Z0-9]{0,2})\.md$/.exec(f.name)?.[1] ?? ''
  return [...new Set([id, ...(letter ? [letter, `W-${letter}`] : [])])]
}

/** A line or file name naming the lane: `W-A`, `lane A`, `lane-A`, `lanes/A.md`. */
export const mentionRe = (aliases: readonly string[]) => {
  const words = aliases.filter(a => a.startsWith('W-') || a.length > 3)
  const letters = aliases.filter(a => !words.includes(a))
  const alts = [...words.map(esc), ...letters.map(l => `[Ll]anes?[-_ /]?${esc(l)}`)]
  return new RegExp(`(?:^|[^A-Za-z0-9])(?:${alts.join('|')})(?![A-Za-z0-9])`)
}

/** The status of the last `lane_status` event about (or from) the lane, in file order. */
export const latestLaneStatus = (events: readonly MabEvent[], aliases: readonly string[]) => {
  let status: string | undefined
  for (const e of events) {
    if (eventType(e) !== 'lane_status') continue
    if (aliases.includes(String(e.lane ?? e.session ?? ''))) status = String(e.status ?? '')
  }
  return status
}

/** Lanes STATE.md calls finished: `Lanes: A DONE | B DONE`, `A/B/C DONE + MERGED`, `ALL MERGED and RELEASED`. */
export const stateDoneLanes = (state: string) => {
  const ids = new Set<string>()
  let all = false
  for (const name of ['Lanes', 'Sessions']) {
    const v = field(state, name)
    if (/^\s*all\b[^;|]*\b(DONE|MERGED|RELEASED)\b/i.test(v)) all = true
    for (const seg of v.split(/[;|]|\s[—–-]\s/)) {
      const m = /^\s*((?:W-)?[A-Z]\w*(?:\s*\/\s*(?:W-)?[A-Z]\w*)*)\s+(.*)$/.exec(seg)
      if (m && isTerminal(m[2] ?? '')) for (const id of (m[1] ?? '').split('/')) ids.add(id.trim())
    }
  }
  return { all, ids }
}

const lastBy = (events: readonly MabEvent[], who: readonly string[], now: number) =>
  events.reduce((m, e) => (who.includes(eventAuthor(e)) ? Math.max(m, sane(eventTime(e), now)) : m), 0)

/** The latest `HH:MM` on or before `ref`, local time. */
const latestAt = (ref: number, h: number, min: number) => {
  const d = new Date(ref)
  d.setHours(h, min, 0, 0)
  return d.getTime() > ref ? d.getTime() - 864e5 : d.getTime()
}
const STAMP = /^\s*(?:[-*]\s+)?(?:\*\*)?(?:(\d{4}-\d{2}-\d{2})[ T])?(\d{1,2}):(\d{2})\b/

/**
 * When JOURNAL.md last mentioned the lane. Lines are `- HH:MM text`, oldest first; walking back from the
 * file's mtime dates each one (crossing midnight as needed). A dated line in the future is skipped.
 */
export const journalActivity = (text: string, mtime: number, mention: RegExp, now: number) => {
  if (!text || !mtime) return 0
  const lines = text.split(/\r?\n/).slice(-600)
  let ref = Math.min(mtime, now) + 60_000
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i] ?? ''
    const m = STAMP.exec(line)
    if (!m) continue
    const h = Number(m[2])
    const min = Number(m[3])
    if (h > 23 || min > 59) continue
    const t = m[1] ? new Date(`${m[1]}T${String(h).padStart(2, '0')}:${m[3]}:00`).getTime() : latestAt(ref, h, min)
    if (!Number.isFinite(t) || t > ref) continue
    ref = t
    if (mention.test(line)) return t
  }
  return 0
}

/** Newest gate log / id list whose name names the lane (`gates/lane-A-console.txt`, `lanes/lane-A.ids`). */
export const gateActivity = (gates: readonly Stamp[], mention: RegExp, now: number) =>
  gates.reduce((m, g) => (mention.test(g.name) ? Math.max(m, sane(g.mtime, now)) : m), 0)

const PATH = /(?:^|[\s(`'"])([A-Za-z]:[\\/][^\s`'"()|,;<>*]*|\/(?:[\w.-]+\/)+[\w.-]+)/
const pathIn = (s: string) => PATH.exec(s)?.[1]?.replace(/[.:\\/]+$/, '') || undefined

/**
 * The lane's worktree: its lane file's `Worktree:` field, else its brief's worktree line,
 * else PLAN.md's session table row (`| W-A | worker | ... | E:/Claude/EVI-p6-A | ...`) or `Lane A (...; worktree X)`.
 */
export const worktreeOf = (f: LaneFile, plan = '', brief = '') => {
  const al = laneAliases(f)
  const own = pathIn(field(f.text, 'Worktree', 'i'))
  if (own) return own
  const mention = mentionRe(al)
  for (const line of brief.split(/\r?\n/)) if (/worktree/i.test(line) && pathIn(line)) return pathIn(line)
  for (const line of plan.split(/\r?\n/)) {
    const cell = /^\s*\|\s*`?([^|`]+?)`?\s*\|/.exec(line)?.[1]
    if ((cell && al.includes(cell)) || (/worktree/i.test(line) && mention.test(line))) {
      const p = pathIn(line)
      if (p) return p
    }
  }
  return undefined
}

const view = (id: string, kind: Kind, status: string, lastActivity: number, now: number, stallMs: number): View => {
  const idle = Math.max(0, now - lastActivity)
  // holding lanes wait for ACTIVATE by design; done lanes are finished
  const stalled = (kind === 'active' || kind === 'blocked') && lastActivity > 0 && idle >= stallMs
  return { id, kind, status, lastActivity, idleMin: Math.floor(idle / 60_000), stalled }
}

/**
 * Each lane. Finished when its Status line, its latest `lane_status` event or STATE.md says DONE / MERGED / RELEASED.
 * Activity = newest of: lane file mtime, events its session wrote, JOURNAL.md lines naming it, its gate logs,
 * and (`extra`) its worktree's newest file. Never the lane file's "Last update" text.
 */
export const laneViews = (run: RunFiles, now: number, stallMs: number): View[] => {
  const events = parseEvents(run.events)
  const stateDone = stateDoneLanes(run.state)
  return run.lanes
    .map(f => {
      const id = laneId(f)
      const al = laneAliases(f)
      const mention = mentionRe(al)
      const own = field(f.text, 'Status')
      const evStatus = latestLaneStatus(events, al)
      const fromState = stateDone.all || al.some(a => stateDone.ids.has(a))
      const done = isTerminal(own) || (evStatus !== undefined && isTerminal(evStatus)) || fromState
      const status = !done || isTerminal(own) ? own : evStatus !== undefined && isTerminal(evStatus) ? evStatus : 'DONE (STATE.md)'
      const activity = Math.max(
        sane(f.mtime, now),
        lastBy(events, al, now),
        journalActivity(run.journal ?? '', run.journalMtime ?? 0, mention, now),
        gateActivity(run.gates ?? [], mention, now),
        sane(run.extra?.[id] ?? 0, now),
      )
      return view(id, done ? 'done' : laneKind(own), status, activity, now, stallMs)
    })
    .sort((a, b) => a.id.localeCompare(b.id))
}

/** The orchestrator named by STATE.md `This session:`; activity = STATE.md mtime or its own events. */
export const orchestratorView = (run: RunFiles, now: number, stallMs: number): View | null => {
  const id = /^(O\d+)\b/.exec(field(run.state, 'This session'))?.[1]
  if (!id) return null
  const events = parseEvents(run.events)
  const kind: Kind = isComplete(run.state, events) ? 'done' : 'active'
  return view(id, kind, field(run.state, 'Phase'), Math.max(sane(run.stateMtime, now), lastBy(events, [id], now)), now, stallMs)
}

/** `20261006-1708-autonomy-p1a` -> `autonomy-p1a`. */
export const runLabel = (id: string) => id.replace(/^\d{8}(-\d{4})?-/, '').slice(0, 24) || id

const MARK: Record<Kind, string> = { done: '✓', holding: '⏸', blocked: '✗', active: '▶' }
export const describe = (v: View) =>
  v.kind === 'done' || v.kind === 'holding' ? `${v.id} ${MARK[v.kind]}` : `${v.id} ${v.stalled ? '⚠' : MARK[v.kind]} ${v.idleMin}m`

/** `MAB autonomy-p1a · O2 ▶ 3m · W-A ✓ · W-B ⚠ 22m · away`; undefined when there is nothing to show. */
export const statusLine = (label: string | null, views: View[], extras: string[]) => {
  const parts = [...(label ? [`MAB ${label}`, ...views.map(describe)] : []), ...extras]
  return parts.length ? parts.join(' · ') : undefined
}

/** One alert (or nudge) per stall episode: a new one only once the lane has shown activity since the last. */
export type Episodes = Record<string, { activity: number; at: number }>
export const isNewEpisode = (eps: Episodes, key: string, activity: number) => (eps[key]?.activity ?? -1) < activity
export const markEpisode = (eps: Episodes, key: string, activity: number, at: number): Episodes => ({ ...eps, [key]: { activity, at } })
export const pruneEpisodes = (eps: Episodes, now: number, keepMs = 2 * 864e5): Episodes =>
  Object.fromEntries(Object.entries(eps).filter(([, v]) => v && typeof v === 'object' && now - v.at < keepMs))
