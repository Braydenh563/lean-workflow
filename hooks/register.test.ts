import { test, expect } from 'claude-code/testing'

test('denies a whole-file read of the code map', async ($, on) => {
  on('tool.call', () => ({ result: 'ok' }) as never)
  const whole = await $.tool.call({ tool: 'Read', file_path: 'docs/CODEMAP.md' })
  expect(whole.deny).toContain('Grep it')
})

test('denies the third identical call in a row', async ($, on) => {
  on('tool.call', () => ({ result: 'ok' }) as never)
  on('ui.status', () => ({ value: undefined }) as never)
  const call = () => $.tool.call({ tool: 'Bash', command: 'false' })
  await call()
  await call()
  const third = await call()
  expect(third.deny).toContain('same call')
})

test('denies an agent with no model unless its type pins one', async ($, on) => {
  on('tool.call', () => ({ result: 'ok' }) as never)
  on('ui.status', () => ({ value: undefined }) as never)
  const bare = await $.tool.call({ tool: 'Agent', description: 'x', prompt: 'find y', subagent_type: 'general-purpose' } as never)
  expect(bare.deny).toContain('name a model')
  const pinned = await $.tool.call({ tool: 'Agent', description: 'x', prompt: 'find y', subagent_type: 'scout' } as never)
  expect(pinned.deny).toBeUndefined()
})

test('denies a Fable agent the user did not ask for', async ($, on) => {
  on('tool.call', () => ({ result: 'ok' }) as never)
  on('ui.status', () => ({ value: undefined }) as never)
  const r = await $.tool.call({ tool: 'Agent', description: 'x', prompt: 'p', model: 'fable' } as never)
  expect(r.deny).toContain('opt-in')
})

test('denies a whole-file read of a lockfile by default', async ($, on) => {
  on('tool.call', () => ({ result: 'ok' }) as never)
  const r = await $.tool.call({ tool: 'Read', file_path: 'web/package-lock.json' })
  expect(r.deny).toContain('Grep it')
})

test('adds the autopilot section to the system prompt', async ($, on) => {
  on('prompt.compose', () => ({ sections: [] }) as never)
  const r = await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: null, traits: [] } as never)
  expect(JSON.stringify(r)).toContain('Lean workflow autopilot')
})

test('warns when CLAUDE.md is read whole past its line limit', async ($, on) => {
  on('tool.call', () => ({ result: 'ok', text: 'x\n'.repeat(250) }) as never)
  on('ui.status', () => ({ value: undefined }) as never)
  const r = await $.tool.call({ tool: 'Read', file_path: 'CLAUDE.md' })
  expect(JSON.stringify(r.context)).toContain('CLAUDE.md is 251 lines')
})

test('does not warn on a short CLAUDE.md or a ranged read', async ($, on) => {
  on('tool.call', () => ({ result: 'ok', text: 'x\n'.repeat(250) }) as never)
  on('ui.status', () => ({ value: undefined }) as never)
  const ranged = await $.tool.call({ tool: 'Read', file_path: 'docs/CLAUDE.md', limit: 50 })
  expect(JSON.stringify(ranged.context ?? [])).not.toContain('limit 200')
})

test('warns when a now.md write passes the line limit or the inbox holds 20 items', async ($, on) => {
  on('tool.call', () => ({ result: 'ok' }) as never)
  on('ui.status', () => ({ value: undefined }) as never)
  const long = await $.tool.call({ tool: 'Write', file_path: '.claude/now.md', content: 'x\n'.repeat(70) } as never)
  expect(JSON.stringify(long.context)).toContain('now.md is 71 lines')
  const inbox = '## Inbox\n' + Array.from({ length: 21 }, (_, i) => `${i + 1}. item`).join('\n') + '\n'
  const crowded = await $.tool.call({ tool: 'Write', file_path: '.claude/now.md', content: inbox } as never)
  expect(JSON.stringify(crowded.context)).toContain('inbox holds 21 items')
})

test('the autopilot names the orient, gate and code map habits', async ($, on) => {
  on('prompt.compose', () => ({ sections: [] }) as never)
  const r = await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: null, traits: [] } as never)
  const text = JSON.stringify(r)
  expect(text).toContain('scripts/orient.sh')
  expect(text).toContain('fixed \\"now\\"')
})
