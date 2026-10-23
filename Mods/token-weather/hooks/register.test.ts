import { expect, test } from 'claude-code/testing'

import { delta, fmt, record, sky, spark } from './register'

test('sky thresholds', () => {
  expect([0, 24, 25, 49, 50, 74, 75, 89, 90, 100].map(p => sky(p).word)).toEqual([
    'Clear', 'Clear', 'Cloudy', 'Cloudy', 'Showers', 'Showers', 'Storm', 'Storm', 'Compact soon', 'Compact soon',
  ])
})

test('token formatting', () => {
  expect(fmt(134400)).toBe('134.4k')
  expect(fmt(200000)).toBe('200k')
  expect(fmt(1000000)).toBe('1M')
  expect(fmt(512)).toBe('512')
})

test('spark and delta', () => {
  expect(spark([0, 50, 100])).toBe('▁▅█')
  expect(delta([36100, 134400])).toBe('▲ +98.3k last turn')
  expect(delta([134400, 30000])).toBe('▼ -104.4k last turn')
  expect(delta([1])).toBe(null)
})

test('history keeps the last 12 turns', () => {
  let r = null
  for (let i = 1; i <= 15; i++) r = record(r, i, 200000, 1)
  expect(r!.history).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])
})
