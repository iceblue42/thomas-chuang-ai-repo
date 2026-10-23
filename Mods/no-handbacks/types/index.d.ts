export type NoHandbacksGuard = {
  enabled: boolean // /no-handbacks on|off, per session
  nudged: boolean // a nudge was sent since the last real user prompt
  pending: boolean // our nudge prompt was submitted; its turn has not started yet
  nudgeTurn: string // turnId of the turn our nudge started
  prompted: boolean // the person's first prompt has been seen
  holding: boolean // a MAB held session waiting for ACTIVATE; no nudges until activated
}

declare module 'claude-code' {
  interface PluginState {
    'no-handbacks': { guard: NoHandbacksGuard }
  }
}
