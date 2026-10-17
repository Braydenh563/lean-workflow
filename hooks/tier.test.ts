import { test, expect } from 'claude-code/testing'

import { finishLine, tierFor, tierNote } from './tier'

test('tier follows the weekly and 5-hour limits, and only ever rises from the configured tier', () => {
  expect(tierFor({}).tier).toBe('max')
  expect(tierFor({ week: 69 }).tier).toBe('max')
  expect(tierFor({ week: 70 })).toEqual({ tier: 'pro', reason: 'weekly limit 70% (pro from 70%)' })
  expect(tierFor({ week: 84 }).tier).toBe('pro')
  expect(tierFor({ week: 85 }).tier).toBe('stop')
  expect(tierFor({ week: 10, fiveHour: 90 }).tier).toBe('stop')
  expect(tierFor({ week: 10, fiveHour: 89 }).tier).toBe('max')
  expect(tierFor({ base: 'pro', week: 10 }).tier).toBe('pro')
  expect(tierFor({ base: 'PRO', week: 90 }).tier).toBe('stop')
  expect(tierFor({ base: 'bogus' }).tier).toBe('max')
})

test('tierNote speaks only on a change', () => {
  expect(tierNote('max', tierFor({ week: 20 }))).toBeUndefined()
  expect(tierNote('max', tierFor({ week: 71 }))).toContain('Opus is denied')
  expect(tierNote('pro', tierFor({ week: 86 }))).toContain('marked stopped')
  expect(tierNote('stop', tierFor({ week: 72 }))).toContain('back to pro')
  expect(tierNote('pro', tierFor({ week: 5 }))).toContain('back to max')
})

test('the user\'s finish-up line replaces the default stop line, and pro never starts after it', () => {
  expect(tierFor({ week: 60, finishWeek: 60 })).toEqual({ tier: 'stop', reason: 'weekly limit 60% (stop from 60%)' })
  expect(tierFor({ week: 59, finishWeek: 60 }).tier).toBe('max')
  expect(tierFor({ week: 71, finishWeek: 95 }).tier).toBe('pro')
  expect(tierFor({ week: 90, finishWeek: 95 }).tier).toBe('pro')
  expect(tierFor({ week: 10, fiveHour: 50, finishFive: 50 }).tier).toBe('stop')
})

test('finishLine reads the line the user sets in words, in either order', () => {
  expect(finishLine('once I get to 60% weekly usage I want you to finish up')).toEqual({ kind: 'week', pct: 60 })
  expect(finishLine('finish up at 75% of my weekly limit')).toEqual({ kind: 'week', pct: 75 })
  expect(finishLine('wrap up when the 5-hour window hits 80%')).toEqual({ kind: 'five', pct: 80 })
  expect(finishLine('stop at 50% usage')).toEqual({ kind: 'week', pct: 50 })
  expect(finishLine('finish at 100% coverage')).toBeUndefined()
  expect(finishLine('the weekly limit is on my mind')).toBeUndefined()
  expect(finishLine('finish up at 250% weekly')).toBeUndefined()
})
