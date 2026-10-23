export type Reading = { history: number[]; window: number; percent: number }

declare module 'claude-code' {
  interface PluginState {
    'token-weather': { reading: Reading }
  }
}
