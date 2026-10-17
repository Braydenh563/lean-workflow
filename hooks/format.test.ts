import { test, expect } from 'claude-code/testing'

import { bar, dashText, spark, weekTrend } from './format'

test('bar is fixed width, clamped, and shows a block for any non-zero value', () => {
  expect(bar(0.5, 10)).toBe('█████░░░░░')
  expect(bar(2, 4)).toBe('████')
  expect(bar(-1, 4)).toBe('░░░░')
  expect(bar(0.001, 10)).toBe('█░░░░░░░░░')
  expect(bar(Number.NaN, 4)).toBe('░░░░')
})

test('dashText covers every section and flags a context over budget', () => {
  const out = dashText({
    stats: { turns: 10, calls: 45, denies: 0, ctx: 186_000, agents: 1, week: 72, fiveHour: 31, weekResets: '2026-10-20T03:00:00Z' },
    agents: [{ id: 'a', type: 'scout', desc: 'x', model: 'haiku', startedAt: 0, endedAt: 5000, calls: 3, lastTool: 'Grep', tokens: 12_000 }],
    tasks: [{ id: '1', subject: 'ship it', status: 'completed' }, { id: '2', subject: 'next', status: 'pending' }],
    costs: [{ model: 'claude-sonnet-5-5', share: 1, turns: 10, out: 35_000 }],
    split: { reads: 0.44, writes: 0.35, output: 0.21 },
    now: 9000,
    advice: 'start fresh',
    trend: 'trend: n/a',
    bigContext: 150_000,
    limits: { tier: 'pro', tierReason: 'weekly limit 72% (pro from 70%)', mode: 'budget', weekTrend: 'week trend ▂▅ 20% → 72% over 2 readings (+52)' },
  })
  for (const part of ['LEAN WORKFLOW', 'CONTEXT PER TURN', '🔴', '186k of 150k', 'AGENTS 1', '○ scout · haiku · 5s', 'TASKS 1/2', '✔ ship it', 'sonnet-5-5', 'reads', '➜ start fresh', 'LIMITS', '5-hour  🟢', 'weekly  🟡', '72%', 'resets 2026-10-20 03:00', 'tier pro (weekly limit 72%', 'mode budget', 'week trend ▂▅']) {
    expect(out).toContain(part)
  }
})

test('spark maps 0 to 100 percent onto eight blocks and clamps', () => {
  expect(spark([0, 50, 100])).toBe('▁▅█')
  expect(spark([-5, 250])).toBe('▁█')
})

test('weekTrend needs two readings and reports the drift', () => {
  expect(weekTrend([{ week: 10 }], undefined)).toContain('needs 2 readings')
  expect(weekTrend([{ week: 10 }, {}, { week: 40 }], 70)).toBe('week trend ▁▄▆ 10% → 70% over 3 readings (+60)')
  expect(weekTrend([{ week: 80 }], 20)).toContain('(-60)')
  const many = Array.from({ length: 20 }, (_, i) => ({ week: i }))
  expect(weekTrend(many, 50)).toContain('over 12 readings')
})
