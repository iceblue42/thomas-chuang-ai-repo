// Pure: who is a real user prompt, whether the owner is away, the auto-continue cap, and push dedupe.
import type { PromptOrigin } from 'claude-code'

export const MARKERS = ['[handoff]', '[pager]', '[house-rules]', '[no-handbacks]', '[visual-gate]'] as const
export const MAX_STEPS = 8
export const PUSH_GAP_MS = 10 * 60_000

// The person's own gestures: the terminal, the phone/web bridge, the desktop app's SDK host, a Slack ping.
const PERSON = new Set(['composer', 'bridge', 'sdk', 'slack-ping'])

export const isRealUser = (origin: PromptOrigin | undefined, text: string) =>
  (origin === undefined || PERSON.has(origin.kind)) && !MARKERS.some(m => text.trimStart().startsWith(m))

/** `/away` sets this until `/back` or the next real prompt. */
export type Manual = { since: number }
export type Away = { away: boolean; reason: 'manual' | 'idle' | null; period: number }

/**
 * Away when `/away` is on, or no real prompt in any session for `afterMs`.
 * `period` names the away period (its start), so caps reset when the owner returns.
 */
export const awayState = (now: number, lastUser: number | undefined, manual: Manual | undefined, afterMs: number): Away => {
  if (manual) return { away: true, reason: 'manual', period: manual.since }
  if (lastUser !== undefined && now - lastUser >= afterMs) return { away: true, reason: 'idle', period: lastUser }
  return { away: false, reason: null, period: 0 }
}

/** Auto-continues used in one away period. */
export type Cap = { period: number; count: number; paused: boolean }

export const capFor = (prev: Cap | undefined, period: number): Cap =>
  prev && prev.period === period ? prev : { period, count: 0, paused: false }

/** Take one auto-step: ok while under `max`; the call that reaches the cap pauses (and says so once). */
export const takeStep = (cap: Cap, max = MAX_STEPS): { ok: boolean; cap: Cap; justPaused: boolean } => {
  if (cap.paused || cap.count >= max) return { ok: false, cap: { ...cap, paused: true }, justPaused: !cap.paused }
  return { ok: true, cap: { ...cap, count: cap.count + 1 }, justPaused: false }
}

/** One push per item (key carries the episode), at most one per session per `gapMs`. */
export const shouldPush = (key: string, now: number, pushed: Record<string, number>, lastPushAt: number, gapMs = PUSH_GAP_MS) =>
  pushed[key] === undefined && now - lastPushAt >= gapMs

/** Drops records older than `keepMs`, so the cross-session map stays small. */
export const prune = (map: Record<string, number>, now: number, keepMs = 2 * 864e5) =>
  Object.fromEntries(Object.entries(map).filter(([, t]) => now - t < keepMs))
