import { test, expect } from 'claude-code/testing'

import { bar, dashText } from './format'

test('bar is fixed width, clamped, and shows a block for any non-zero value', () => {
  expect(bar(0.5, 10)).toBe('█████░░░░░')
  expect(bar(2, 4)).toBe('████')
  expect(bar(-1, 4)).toBe('░░░░')
  expect(bar(0.001, 10)).toBe('█░░░░░░░░░')
  expect(bar(Number.NaN, 4)).toBe('░░░░')
})

test('dashText covers every section and flags a context over budget', () => {
  const out = dashText({
    stats: { turns: 10, calls: 45, denies: 0, ctx: 186_000, agents: 1 },
    agents: [{ id: 'a', type: 'scout', desc: 'x', model: 'haiku', startedAt: 0, endedAt: 5000, calls: 3, lastTool: 'Grep', tokens: 12_000 }],
    tasks: [{ id: '1', subject: 'ship it', status: 'completed' }, { id: '2', subject: 'next', status: 'pending' }],
    costs: [{ model: 'claude-sonnet-5-5', share: 1, turns: 10, out: 35_000 }],
    split: { reads: 0.44, writes: 0.35, output: 0.21 },
    now: 9000,
    advice: 'start fresh',
    trend: 'trend: n/a',
    bigContext: 150_000,
  })
  for (const part of ['LEAN WORKFLOW', 'CONTEXT PER TURN', '🔴', '186k of 150k', 'AGENTS 1', '○ scout · haiku · 5s', 'TASKS 1/2', '✔ ship it', 'sonnet-5-5', 'reads', '➜ start fresh']) {
    expect(out).toContain(part)
  }
})
