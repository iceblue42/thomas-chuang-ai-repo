import type { Register } from 'claude-code'

import type { Reading } from '../types'

const BARS = '▁▂▃▄▅▆▇█'
export const TURNS = 12

const SKIES = [
  { below: 25, icon: '☀', word: 'Clear', color: 'yellow' },
  { below: 50, icon: '☁', word: 'Cloudy', color: 'cyan' },
  { below: 75, icon: '☂', word: 'Showers', color: 'blue' },
  { below: 90, icon: '☇', word: 'Storm', color: 'magenta' },
  { below: Infinity, icon: '↯', word: 'Compact soon', color: 'red' },
] as const

export const sky = (percent: number) => SKIES.find(s => percent < s.below)!

export const fmt = (n: number) => {
  const [div, unit] = Math.abs(n) >= 1e6 ? [1e6, 'M'] : Math.abs(n) >= 1e3 ? [1e3, 'k'] : [1, '']
  return `${Number((n / div).toFixed(1))}${unit}`
}

// ponytail: bars scale to the busiest of the shown turns, so growth reads even early in a session
export const spark = (history: number[]) => {
  const max = Math.max(...history, 1)
  return history.map(t => BARS[Math.min(BARS.length - 1, Math.floor((t / max) * BARS.length))]).join('')
}

export const delta = (history: number[]) => {
  if (history.length < 2) return null
  const d = history[history.length - 1] - history[history.length - 2]
  return `${d < 0 ? '▼' : '▲'} ${d < 0 ? '-' : '+'}${fmt(Math.abs(d))} last turn`
}

export const record = (prev: Reading | null, tokens: number, window: number, percent: number): Reading => ({
  history: [...(prev?.history ?? []), tokens].slice(-TURNS),
  window,
  percent,
})

const reading = { plugin: 'token-weather', key: 'reading' } as const

export const register: Register = on => {
  // Fires after each main-thread turn with the status line's context figures.
  on('session.measure', async ($, e, next) => {
    const { tokens, window: size, percent } = e.context
    if (e.changed.includes('context') && tokens !== undefined) {
      const { value } = await $.state.get(reading)
      await $.state.set(reading, record(value ?? null, tokens, size, percent ?? Math.round((tokens / size) * 100)))
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const { value: r } = await $.state.get(reading)
    if (e.props.hasSurvey || !r) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const s = sky(r.percent)
    const d = delta(r.history)

    return (
      <Box>
        <Text color={s.color} bold>{s.icon} {s.word}</Text>
        <Text> {r.percent}% · {fmt(r.history[r.history.length - 1])} / {fmt(r.window)} </Text>
        <Text color={s.color}>{spark(r.history)}</Text>
        {d && <Text dimColor> {d}</Text>}
      </Box>
    )
  })
}
