import { test, expect } from 'claude-code/testing'

import { modeFromPrompt, modeFromSkill, triageDeny } from './modes'

test('a prompt asks for a mode by its trigger words, and leaves it with "exit"', () => {
  const m = (t: string) => modeFromPrompt(t).mode
  expect(m('triage the inbox')).toBe('triage')
  expect(m('please review this PR')).toBe('review')
  expect(m('cut a release')).toBe('release')
  expect(m('release v1.6.0 today')).toBe('release')
  expect(m('focus mode')).toBe('focus')
  expect(m('budget mode please')).toBe('budget')
  expect(m('I am running low on usage')).toBe('budget')
  expect(m('Triage')).toBe('triage')
  expect(m('go through my inbox')).toBe('triage')
  expect(m('I will triage that later')).toBeUndefined()
  expect(m('fix the bug in parse.ts')).toBeUndefined()
  expect(m('what is the release process in this repo')).toBeUndefined()
  expect(modeFromPrompt('exit triage mode').exit).toBe(true)
  expect(modeFromPrompt('back to normal').exit).toBe(true)
})

test('a skill name maps to its mode, with or without the plugin prefix', () => {
  expect(modeFromSkill('triage')).toBe('triage')
  expect(modeFromSkill('lean-workflow:budget')).toBe('budget')
  expect(modeFromSkill('lean-workflow:retro')).toBeUndefined()
  expect(modeFromSkill('superpowers:review')).toBeUndefined()
})

test('triage allows the inbox and haiku, and refuses edits elsewhere, builds and bigger agents', () => {
  expect(triageDeny({ tool: 'Write', file_path: '.claude/now.md' })).toBeUndefined()
  expect(triageDeny({ tool: 'Edit', file_path: 'docs/roadmap/INBOX.md' })).toBeUndefined()
  expect(triageDeny({ tool: 'Edit', file_path: 'src/app.ts' })).toContain('inbox-only')
  expect(triageDeny({ tool: 'Bash', command: 'git status' })).toBeUndefined()
  expect(triageDeny({ tool: 'Bash', command: 'git commit -m "inbox"' })).toBeUndefined()
  for (const c of ['npm test', 'cd web && npm run build', 'pytest -q', 'make', 'scripts/gate.sh --full', 'bash scripts/gate.sh', 'cargo build']) {
    expect(triageDeny({ tool: 'Bash', command: c }), c).toContain('no builds')
  }
  expect(triageDeny({ tool: 'Agent', model: 'haiku' })).toBeUndefined()
  expect(triageDeny({ tool: 'Agent' })).toBeUndefined()
  expect(triageDeny({ tool: 'Agent', model: 'sonnet' })).toContain('Haiku agents only')
  expect(triageDeny({ tool: 'Read', file_path: 'src/app.ts' })).toBeUndefined()
})
