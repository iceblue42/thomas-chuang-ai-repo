export type HandoffKind = 'next-session' | 'holding'

export type HandoffEntry = {
  id: string // `file:<path>` or `hold:<key>`
  title: string
  kind: HandoffKind
  role?: string
  project: string
  path?: string
  created: number // ms since epoch
  body: string // what gets pasted
  key: string // first ~200 normalized chars of body
  used: boolean
  usedAt?: number
}

export type HandoffView = { repo: string; entries: HandoffEntry[] }

/** A `/handoff --shutdown` waiting for its file and the end of its turn. */
export type HandoffPending = { armed: boolean; file: string | null; dir: string }

/** `intent`: this turn's prompt asked for a next-session prompt, so MAB brief files written in it are shelved too. */
declare module 'claude-code' {
  interface PluginState {
    handoff: { view: HandoffView; pending: HandoffPending | null; intent: boolean }
  }
}
