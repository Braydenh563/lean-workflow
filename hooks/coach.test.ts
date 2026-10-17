import { test, expect } from 'claude-code/testing'

import { bigImage, bigPaste, coachReport, idleGap, longPr, longSession, makeCoach, weeklyLimit } from './coach'

const HOUR = 3600_000
const NOW = 1_800_000_000_000
const base = { origin: { kind: 'user' }, wait: false } as never

// Everything beneath the plugin: a fixed clock, usage, git, an in-memory store, and a capture of toasts.
function wire(on: Parameters<Parameters<typeof test>[1]>[1], over: { usage?: object; git?: Record<string, string>; now?: () => number } = {}) {
  const toasts: string[] = []
  const store = new Map<string, unknown>()
  on('clock.now', () => ({ value: (over.now ?? (() => NOW))() }) as never)
  on('ui.toast', (_$, e) => (toasts.push((e as unknown as { text: string }).text), { value: undefined }) as never)
  on('ui.status', () => ({ value: undefined }) as never)
  on('turn.complete', () => ({ text: '' }) as never)
  on('prompt.submit', (_$, e) => ({ text: (e as unknown as { text: string }).text }) as never)
  on('store.get', (_$, e) => ({ value: store.get((e as unknown as { key: string }).key) }) as never)
  on('store.set', (_$, e) => (store.set((e as unknown as { key: string }).key, (e as unknown as { value: unknown }).value), { value: undefined }) as never)
  on('session.usage', () => ({ value: { startedAt: NOW - HOUR, context: { window: 1_000_000, tokens: 30_000 }, rateLimits: [], ...over.usage } }) as never)
  on('process.run', (_$, e) => {
    const argv = (e as unknown as { argv: string[] }).argv.slice(1).join(' ')
    const out = over.git?.[argv]
    return { value: { exitCode: out === undefined ? 1 : 0, stdout: out ?? '', stderr: '' } } as never
  })
  return { toasts, store }
}

test('long session: nudges once, with the fresh-session alternative and a saving', async ($, on) => {
  const { toasts } = wire(on, { usage: { startedAt: NOW - 4 * HOUR, context: { window: 1e6, tokens: 120_000 } } })
  await $.prompt.submit({ text: 'next step', ...base })
  await $.prompt.submit({ text: 'and another', ...base })
  expect(toasts).toHaveLength(1)
  expect(toasts[0]).toContain('Long session (4.0 h')
  expect(toasts[0]).toContain('fresh session')
  expect(toasts[0]).toContain('saves about 200k')
})

test('long session: quiet for a short session', async ($, on) => {
  const { toasts } = wire(on)
  await $.prompt.submit({ text: 'hi', ...base })
  expect(toasts).toHaveLength(0)
})

test('long-lived PR: names the branch age and commits from git log', async ($, on) => {
  const stamps = [NOW / 1000 - 5 * 86400, NOW / 1000 - 3 * 86400, NOW / 1000 - 3600].join('\n')
  const { toasts } = wire(on, {
    git: { 'rev-parse --abbrev-ref HEAD': 'feature/x', 'symbolic-ref --short refs/remotes/origin/HEAD': 'origin/main', 'rev-parse --verify --quiet origin/main': 'abc', 'log --format=%ct origin/main..HEAD': stamps },
  })
  await $.prompt.submit({ text: 'go', ...base })
  expect(toasts[0]).toContain('feature/x is 5.0 days old with 3 commits')
  expect(toasts[0]).toContain('second small PR')
})

test('long-lived PR: silent on the default branch and on a young branch', async ($, on) => {
  const { toasts } = wire(on, {
    git: { 'rev-parse --abbrev-ref HEAD': 'main', 'symbolic-ref --short refs/remotes/origin/HEAD': 'origin/main', 'rev-parse --verify --quiet origin/main': 'abc', 'log --format=%ct origin/main..HEAD': `${NOW / 1000 - 60}` },
  })
  await $.prompt.submit({ text: 'go', ...base })
  expect(toasts).toHaveLength(0)
  expect(longPr({ branch: 'f', commits: 2, ageMs: HOUR })).toBeUndefined()
})

test('agent model: opus on a lookup is told haiku, with the saving', async ($, on) => {
  on('tool.call', () => ({ result: 'ok' }) as never)
  on('ui.status', () => ({ value: undefined }) as never)
  const r = await $.tool.call({ tool: 'Agent', description: 'x', prompt: 'find where the retry limit is set', subagent_type: 'general-purpose', model: 'opus' } as never)
  expect(r.deny).toBeUndefined()
  const note = JSON.stringify(r.context)
  expect(note).toContain('ran on opus')
  expect(note).toContain('model haiku')
  expect(note).toContain('80% less')
})

test('agent model: no nudge for haiku, for opus on design, or for a Fable agent the user asked for', async ($, on) => {
  on('tool.call', () => ({ result: 'ok' }) as never)
  on('ui.status', () => ({ value: undefined }) as never)
  on('prompt.submit', (_$, e) => ({ text: (e as unknown as { text: string }).text }) as never)
  const cheap = await $.tool.call({ tool: 'Agent', description: 'x', prompt: 'find y', subagent_type: 'general-purpose', model: 'haiku' } as never)
  expect(cheap.context ?? []).toHaveLength(0)
  const design = await $.tool.call({ tool: 'Agent', description: 'x', prompt: 'design the schema and weigh trade-offs', subagent_type: 'general-purpose', model: 'opus' } as never)
  expect(design.context ?? []).toHaveLength(0)
  await $.prompt.submit({ text: 'use fable for this', ...base })
  const fable = await $.tool.call({ tool: 'Agent', description: 'x', prompt: 'find y', subagent_type: 'general-purpose', model: 'fable' } as never)
  expect(JSON.stringify(fable.context ?? [])).not.toContain('haiku')
})

test('agent model: opus on plain implementation is told sonnet', async ($, on) => {
  on('tool.call', () => ({ result: 'ok' }) as never)
  on('ui.status', () => ({ value: undefined }) as never)
  const r = await $.tool.call({ tool: 'Agent', description: 'x', prompt: 'add the missing null check in parse()', subagent_type: 'general-purpose', model: 'opus' } as never)
  expect(JSON.stringify(r.context)).toContain('model sonnet')
  expect(JSON.stringify(r.context)).toContain('40% less')
})

test('big paste: nudges to save it to a file, once', async ($, on) => {
  const { toasts } = wire(on)
  await $.prompt.submit({ text: 'log:\n' + 'x'.repeat(30_000), ...base })
  await $.prompt.submit({ text: 'again\n' + 'y'.repeat(30_000), ...base })
  expect(toasts).toHaveLength(1)
  expect(toasts[0]).toContain('Pasted 30k characters')
  expect(toasts[0]).toContain('grep it and read a line range')
})

test('images: two images trigger the crop-or-state-the-numbers nudge', async ($, on) => {
  const { toasts } = wire(on)
  const attachments = [{ type: 'image', mediaType: 'image/png' }, { type: 'image', mediaType: 'image/png' }]
  await $.prompt.submit({ text: 'see these', attachments, ...base } as never)
  expect(toasts[0]).toContain('2 images')
  expect(toasts[0]).toContain('crop to the problem')
})

test('images: one small image is left alone', async ($, on) => {
  const { toasts } = wire(on)
  await $.prompt.submit({ text: 'see', attachments: [{ type: 'image' }], ...base } as never)
  expect(toasts).toHaveLength(0)
})

test('idle gap: a prompt after 70 idle minutes warns once with the re-cache size', async ($, on) => {
  let t = NOW
  const { toasts } = wire(on, { now: () => t, usage: { startedAt: NOW, context: { window: 1e6, tokens: 90_000 } } })
  await $.turn.complete({ reason: 'answer', text: 'ok', usage: { input_tokens: 1000, output_tokens: 10, cache_read_input_tokens: 89_000, cache_creation_input_tokens: 0 } } as never)
  t = NOW + 70 * 60_000
  await $.prompt.submit({ text: 'back', ...base })
  expect(toasts).toHaveLength(1)
  expect(toasts[0]).toContain('Idle 70 min')
  expect(toasts[0]).toContain('start a fresh session')
  t += 70 * 60_000
  await $.prompt.submit({ text: 'again', ...base })
  expect(toasts).toHaveLength(1)
})

test('weekly limit: over the threshold names the cheaper rungs and the reset', async ($, on) => {
  const rateLimits = [{ kind: 'seven_day', percentUsed: 82, resetsAt: new Date(NOW + 2 * 86400_000).toISOString() }]
  const { toasts } = wire(on, { usage: { rateLimits } })
  await $.prompt.submit({ text: 'go', ...base })
  expect(toasts[0]).toContain('Weekly limit 82% used')
  expect(toasts[0]).toContain('opus to sonnet cuts a call about 40%')
  expect(toasts[0]).toContain('reset')
})

test('weekly limit: ahead of an even pace fires before the threshold, on pace stays quiet', () => {
  const resetsAt = new Date(NOW + 5 * 86400_000).toISOString() // 2 of 7 days gone, about 29%
  expect(weeklyLimit([{ kind: 'seven_day', percentUsed: 55, resetsAt }], NOW)?.text).toContain('55% used')
  expect(weeklyLimit([{ kind: 'seven_day', percentUsed: 30, resetsAt }], NOW)).toBeUndefined()
  expect(weeklyLimit([{ kind: 'five_hour', percentUsed: 99 }], NOW)).toBeUndefined()
})

test('at most two nudges per prompt; the rest wait for the next one', () => {
  const coach = makeCoach()
  const all = [bigPaste(40_000), bigImage({ count: 3 }), idleGap({ idleMs: 2 * HOUR, ctx: 80_000 })]
  expect(coach.offer(all)).toHaveLength(2)
  expect(coach.offer(all)).toHaveLength(1)
  expect(coach.offer(all)).toHaveLength(0)
  expect(coach.hits().bigPaste).toBe(3)
})

test('/coach reports counts and the trend from stored sessions', async ($, on) => {
  const { store } = wire(on)
  const row = (n: number) => ({ at: NOW, hits: { bigPaste: n, idleGap: 1 } })
  store.set('coach', [row(4), row(3), row(1), row(0)])
  const r = await $.command.run({ command: 'coach', args: '' } as never)
  expect(r.text).toContain('4 earlier sessions recorded')
  expect(r.text).toContain('big pastes: 0 now · 8 in history · trend better (3.5 → 0.5 per session)')
  expect(r.text).toContain('idle gaps over an hour: 0 now · 4 in history · trend flat')
})

test('coachReport asks for 4 sessions before showing a trend', () => {
  const text = coachReport([{ at: 1, hits: { longSession: 1 } }], { longSession: 1 })
  expect(text).toContain('a trend needs 4')
  expect(text).not.toContain('trend better')
  expect(longSession({ ageMs: HOUR, turns: 3, ctx: 10_000 })).toBeUndefined()
})
