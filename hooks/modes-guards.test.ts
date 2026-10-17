import { test, expect } from 'claude-code/testing'

const NOW = 1_800_000_000_000
const base = { origin: { kind: 'user' }, wait: false } as never
type On = Parameters<Parameters<typeof test>[1]>[1]

// Everything beneath the plugin: a clock, the host's usage figures, an in-memory store and repo files, and a capture of toasts and writes.
function wire(on: On, o: { week?: number; fiveHour?: number; files?: Record<string, string>; panes?: boolean } = {}) {
  const toasts: string[] = []
  const writes: Record<string, string> = {}
  const store = new Map<string, unknown>()
  const files = { ...o.files }
  const limits: { week?: number; fiveHour?: number } = { week: o.week, fiveHour: o.fiveHour }
  on('clock.now', () => ({ value: NOW }) as never)
  on('session.start', (_$, e) => ({ cwd: (e as unknown as { cwd: string }).cwd }) as never)
  on('ui.toast', (_$, e) => (toasts.push((e as unknown as { text: string }).text), { value: undefined }) as never)
  on('ui.status', () => ({ value: undefined }) as never)
  on('ui.open', () => ({ value: o.panes ? { isPlaced: true } : { isPlaced: false, reason: 'no panes here' } }) as never)
  on('command.register', () => ({ value: { command: 'x' } }) as never)
  on('tool.register', () => ({ value: { tool: 'x' } }) as never)
  on('tool.call', () => ({ result: 'ok', text: 'ok' }) as never)
  on('turn.complete', () => ({ text: '' }) as never)
  on('prompt.submit', (_$, e) => ({ text: (e as unknown as { text: string }).text }) as never)
  on('skill.prompt', () => ({ text: '' }) as never)
  on('store.get', (_$, e) => ({ value: store.get((e as unknown as { key: string }).key) }) as never)
  on('store.set', (_$, e) => (store.set((e as unknown as { key: string }).key, (e as unknown as { value: unknown }).value), { value: undefined }) as never)
  on('fs.write', (_$, e) => {
    const a = e as unknown as { path: string; text: string }
    // the engine resolves a relative path against the session's cwd
    const rel = a.path.replace(/^.*?(\.claude\/)/, '$1')
    writes[rel] = a.text
    files[rel] = a.text
    return { value: undefined } as never
  })
  on('session.usage', () => ({
    value: {
      startedAt: NOW - 3600_000,
      context: { window: 1_000_000, tokens: 30_000 },
      rateLimits: [
        ...(limits.week === undefined ? [] : [{ kind: 'seven_day', percentUsed: limits.week, resetsAt: '2026-10-20T03:00:00Z' }]),
        ...(limits.fiveHour === undefined ? [] : [{ kind: 'five_hour', percentUsed: limits.fiveHour }]),
      ],
    },
  }) as never)
  on('process.run', (_$, e) => {
    const argv = (e as unknown as { argv: string[] }).argv
    if (argv[0] === 'test') return { value: { exitCode: argv[1] === '-f' && files[argv[2]] !== undefined ? 0 : 1, stdout: '', stderr: '' } } as never
    const out = argv[0] === 'cat' ? files[argv[1]] : undefined
    return { value: { exitCode: out === undefined ? 1 : 0, stdout: out ?? '', stderr: '' } } as never
  })
  return { toasts, writes, store, files, limits }
}

const turn = ($: { turn: { complete: (x: never) => Promise<unknown> } }) =>
  $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer', usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'claude-sonnet-5-5' } } as never)

const ACTIVE = 'mode: continue\nstatus: active\nmax-continues: 40\n\n- [x] a\n- [ ] b\n'

test('/dash falls back to text with live limit bars and a week trend from stored history', async ($, on) => {
  const { store } = wire(on, { week: 72, fiveHour: 31 })
  store.set('history', [{ at: 1, turns: 5, ctx: 50_000, calls: 9, agents: 0, denies: 0, writeShare: 10, week: 20 }, { at: 2, turns: 5, ctx: 60_000, calls: 9, agents: 0, denies: 0, writeShare: 10, week: 45 }])
  await turn($ as never)
  const r = await $.command.run({ command: 'dash', args: '' } as never)
  const text = String((r as { text?: string }).text)
  expect(text).not.toContain('Usage dashboard opened')
  for (const part of ['LEAN WORKFLOW', 'LIMITS (LIVE FROM THE HOST)', '5-hour  🟢', '31%', 'weekly  🟡', '72%', 'resets 2026-10-20 03:00', 'week trend ▂▄▆ 20% → 72% over 3 readings (+52)', 'tier pro', 'mode budget', 'WORK ORDER'.toLowerCase()])
    expect(text, part).toContain(part)
})

test('/dash opens the pane where the surface seats one', async ($, on) => {
  wire(on, { panes: true })
  const r = await $.command.run({ command: 'dash', args: '' } as never)
  expect((r as { text?: string }).text).toBe('Usage dashboard opened.')
})

test('/dash says when the host reports no limits', async ($, on) => {
  wire(on)
  await turn($ as never)
  const text = String(((await $.command.run({ command: 'dash', args: '' } as never)) as { text?: string }).text)
  expect(text).toContain('weekly  not reported by this host')
  expect(text).toContain('week trend: needs 2 readings')
})

test('the view tool returns the same dashboard where slash commands are not routed', async ($, on) => {
  wire(on, { week: 10 })
  await turn($ as never)
  const r = await $.tool.call({ tool: 'mcp__lean-workflow__view', view: 'dash' } as never)
  expect(String((r as { result?: unknown }).result)).toContain('LIMITS (LIVE FROM THE HOST)')
  const spend = await $.tool.call({ tool: 'mcp__lean-workflow__view', view: 'spend' } as never)
  expect(String((spend as { result?: unknown }).result)).toContain('cost share')
})

test('the weekly 70% sets tier pro and budget mode, denies Opus agents, and recovery lifts both', async ($, on) => {
  const w = wire(on, { week: 71 })
  await turn($ as never)
  expect(w.toasts.join('\n')).toContain('Tier pro')
  const denied = await $.tool.call({ tool: 'Agent', description: 'x', prompt: 'design it', subagent_type: 'general-purpose', model: 'opus' } as never)
  expect(denied.deny).toContain('no Opus agents')
  const ok = await $.tool.call({ tool: 'Agent', description: 'x', prompt: 'build it', subagent_type: 'general-purpose', model: 'sonnet' } as never)
  expect(ok.deny).toBeUndefined()
  expect(JSON.stringify(ok.context ?? [])).toContain('Tier pro')
  await $.prompt.submit({ text: 'use opus for this design', ...base })
  const asked = await $.tool.call({ tool: 'Agent', description: 'x', prompt: 'design it', subagent_type: 'general-purpose', model: 'opus' } as never)
  expect(asked.deny).toBeUndefined()
  const dash = String(((await $.command.run({ command: 'dash', args: '' } as never)) as { text?: string }).text)
  expect(dash).toContain('mode budget')
})

test('tier stop marks an active work order stopped', async ($, on) => {
  const w = wire(on, { week: 86, files: { '.claude/work-order.md': ACTIVE } })
  await turn($ as never)
  expect(w.writes['.claude/work-order.md']).toContain('status: stopped (usage)')
  expect(w.writes['.claude/work-order.md']).toContain('- [ ] b')
})

test('tier stop leaves an order that is not active alone', async ($, on) => {
  const w = wire(on, { week: 90, files: { '.claude/work-order.md': ACTIVE.replace('active', 'done') } })
  await turn($ as never)
  expect(Object.keys(w.writes)).toHaveLength(0)
})

test('unattended: force-push and CI or settings edits are refused, normal work is not', async ($, on) => {
  wire(on, { files: { '.claude/work-order.md': ACTIVE } })
  const call = (x: object) => $.tool.call({ ...x } as never)
  expect((await call({ tool: 'Bash', command: 'git push --force-with-lease origin x' })).deny).toContain('never force-push')
  expect((await call({ tool: 'Edit', file_path: '.github/workflows/ci.yml' })).deny).toContain('CI definitions')
  expect((await call({ tool: 'Write', file_path: '.claude/settings.json', content: '{}' })).deny).toContain('Claude settings')
  expect((await call({ tool: 'Bash', command: 'sed -i s/a/b/ .gitlab-ci.yml' })).deny).toBeDefined()
  expect((await call({ tool: 'Bash', command: 'git push -u origin feature' })).deny).toBeUndefined()
  expect((await call({ tool: 'Edit', file_path: 'src/a.ts' })).deny).toBeUndefined()
  expect((await call({ tool: 'Edit', file_path: '.claude/work-order.md' })).deny).toBeUndefined()
})

test('unattended guards also bind a subagent', async ($, on) => {
  wire(on, { files: { '.claude/work-order.md': ACTIVE } })
  const r = await $.tool.call({ tool: 'Bash', command: 'git push -f', agentId: 'a1' } as never)
  expect(r.deny).toContain('never force-push')
})

test('attended (no active order): the same calls run', async ($, on) => {
  wire(on, { files: { '.claude/work-order.md': ACTIVE.replace('active', 'done') } })
  expect((await $.tool.call({ tool: 'Bash', command: 'git push --force' } as never)).deny).toBeUndefined()
  expect((await $.tool.call({ tool: 'Edit', file_path: '.github/workflows/ci.yml' } as never)).deny).toBeUndefined()
})

test('unattended: a document is read once, then only its text copy', async ($, on) => {
  wire(on, { files: { '.claude/work-order.md': ACTIVE } })
  const first = await $.tool.call({ tool: 'Read', file_path: 'spec/brief.pdf' } as never)
  expect(first.deny).toBeUndefined()
  expect(JSON.stringify(first.context)).toContain('.claude/inputs/brief.pdf.txt')
  const second = await $.tool.call({ tool: 'Read', file_path: 'spec/brief.pdf' } as never)
  expect(second.deny).toContain('already read once')
  expect(second.deny).toContain('.claude/inputs/brief.pdf.txt')
  expect((await $.tool.call({ tool: 'Read', file_path: '.claude/inputs/brief.pdf.txt' } as never)).deny).toBeUndefined()
})

test('unattended: an existing text copy is used instead of the first read', async ($, on) => {
  wire(on, { files: { '.claude/work-order.md': ACTIVE, '.claude/inputs/plan.xlsx.txt': 'rows' } })
  expect((await $.tool.call({ tool: 'Read', file_path: 'plan.xlsx' } as never)).deny).toContain('text copy')
})

test('attended: documents read normally', async ($, on) => {
  wire(on)
  expect((await $.tool.call({ tool: 'Read', file_path: 'a.pdf' } as never)).deny).toBeUndefined()
  expect((await $.tool.call({ tool: 'Read', file_path: 'a.pdf' } as never)).deny).toBeUndefined()
})

test('triage mode (by prompt) is inbox-only with no builds; "exit triage" lifts it', async ($, on) => {
  wire(on)
  await $.prompt.submit({ text: 'triage the inbox and these screenshots', ...base })
  const call = (x: object) => $.tool.call({ ...x } as never)
  expect((await call({ tool: 'Edit', file_path: 'src/app.ts' })).deny).toContain('inbox-only')
  expect((await call({ tool: 'Write', file_path: '.claude/now.md', content: '## Inbox' })).deny).toBeUndefined()
  expect((await call({ tool: 'Bash', command: 'npm test' })).deny).toContain('no builds')
  expect((await call({ tool: 'Agent', description: 'describe', prompt: 'describe shot.png', subagent_type: 'general-purpose', model: 'sonnet' })).deny).toBeDefined()
  expect((await call({ tool: 'Agent', description: 'describe', prompt: 'describe shot.png', subagent_type: 'general-purpose', model: 'haiku' })).deny).toBeUndefined()
  await $.prompt.submit({ text: 'exit triage mode', ...base })
  expect((await call({ tool: 'Edit', file_path: 'src/app.ts' })).deny).toBeUndefined()
})

test('invoking a mode skill sets the mode', async ($, on) => {
  wire(on)
  await $.skill.prompt({ skill: 'lean-workflow:triage', text: '', frontmatter: {} } as never)
  expect((await $.tool.call({ tool: 'Edit', file_path: 'src/app.ts' } as never)).deny).toContain('inbox-only')
})

test('morning briefing: shown at session start once per run, and again by /brief', async ($, on) => {
  const order = 'mode: continue\nstatus: stopped (usage)\nstarted: 2026-10-17 22:10\n\n- [x] a\n- [!] b needs a key\n- [ ] c\n'
  const w = wire(on, { files: { '.claude/work-order.md': order, 'HANDOVER.md': '# H\n## Morning summary\ndone: a\nblocked: b\n' } })
  await $.session.start({ cwd: '/repo', surface: null, isInteractive: true } as never)
  expect(w.toasts).toHaveLength(1)
  expect(w.toasts[0]).toContain('MORNING BRIEFING · continue run · stopped (usage)')
  expect(w.toasts[0]).toContain('! b needs a key')
  expect(w.toasts[0]).toContain('done: a')
  await $.session.start({ cwd: '/repo', surface: null, isInteractive: true } as never)
  expect(w.toasts).toHaveLength(1)
  const again = await $.command.run({ command: 'brief', args: '' } as never)
  expect(String((again as { text?: string }).text)).toContain('MORNING BRIEFING')
})

test('no briefing without a work order', async ($, on) => {
  const w = wire(on)
  await $.session.start({ cwd: '/repo', surface: null, isInteractive: true } as never)
  expect(w.toasts).toHaveLength(0)
  expect(String(((await $.command.run({ command: 'brief', args: '' } as never)) as { text?: string }).text)).toContain('No work order')
})

test('the autopilot names the modes, the guards, the item ledger and the view tool', async ($, on) => {
  on('prompt.compose', () => ({ sections: [] }) as never)
  const text = JSON.stringify(await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: null, traits: [] } as never))
  for (const part of ['triage', 'budget mode', 'cut a release', 'morning briefing', 'never force-push', 'item_ledger.py', 'lean-workflow view tool']) expect(text).toContain(part)
})

test('a finish-up line in a prompt reaches the model, warns when near, and stops the order at the line', async ($, on) => {
  const w = wire(on, { week: 52, files: { '.claude/work-order.md': ACTIVE } })
  await turn($ as never)
  await $.prompt.submit({ text: 'once I get to 60% weekly usage I want you to finish up', ...base })
  expect(w.toasts.join('\n')).toContain('finish-up line set: when weekly usage reaches 60% (now 52%)')
  const first = await $.tool.call({ tool: 'Bash', command: 'ls one' } as never)
  expect(JSON.stringify(first.context)).toContain('Finish-up line set by the user')
  const dash = String(((await $.command.run({ command: 'dash', args: '' } as never)) as { text?: string }).text)
  expect(dash).toContain('tier max')
  // the host now reports 57%: three points from the line
  w.limits.week = 57
  await turn($ as never)
  const near = await $.tool.call({ tool: 'Bash', command: 'ls two' } as never)
  expect(JSON.stringify(near.context)).toContain('3 points from the finish-up line (60%)')
  w.limits.week = 61
  await turn($ as never)
  expect(w.writes['.claude/work-order.md']).toContain('status: stopped (usage)')
  const stop = await $.tool.call({ tool: 'Bash', command: 'ls three' } as never)
  expect(JSON.stringify(stop.context)).toContain('Tier stop')
})

test('the finishAtWeek option sets the stop line without a prompt', { options: { finishAtWeek: 40 } }, async ($, on) => {
  const w = wire(on, { week: 41, files: { '.claude/work-order.md': ACTIVE } })
  await turn($ as never)
  expect(w.writes['.claude/work-order.md']).toContain('status: stopped (usage)')
})
