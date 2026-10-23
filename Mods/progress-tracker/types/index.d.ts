export type PlanItem = { id: string; text: string; done: boolean }
export type PlanSection = { heading: string; items: PlanItem[] }
export type ChunkRow = { id: string; steps: string; lane: string; status: 'done' | 'active' | 'todo' }
export type LaneRow = { id: string; session: string; status: string; chunks: string; progress: string; review: string; last: string }

export type Run = {
  id: string
  title: string
  session: string
  tier: string
  phase: number // 0-6 MAB phase, 7 = run complete, -1 unknown
  phaseText: string
  substep: number
  round: string
  chunk: string
  agents: string
  next: string
  questions: string
  held: string
  lanesLine: string
  lanes: LaneRow[]
  chunks: ChunkRow[]
  openFindings: string[] // severities of open findings
  recent: string[]
}

export type Snapshot = {
  root: string
  // current: items an in-progress run covers; built: items a completed run covers that are not ticked yet; paused: status-table rows marked Paused
  plan: { path: string; sections: PlanSection[]; current: string[]; built: string[]; paused?: string[]; details: Record<string, string> } | null
  run: Run | null
  others: string[] // other runs touched in the last 24h, across every worktree of the repo
  at: string
  error?: string
}

declare module 'claude-code' {
  interface PluginState {
    'progress-tracker': { snap: Snapshot }
  }
}
