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
