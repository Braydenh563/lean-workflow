import { test, expect } from 'claude-code/testing'

import { bar, inboxCount, parseOrder, planCounts, progressText } from './progress'

const ORDER = 'mode: ship\nstatus: active\npr: 190\n\n- [x] merge main\n- [ ] fix CodeQL alert\n- [ ] merge\n'

test('reads a work order: mode, status, PR, ticks and the next item', async () => {
  expect(parseOrder(ORDER)).toEqual({ mode: 'ship', status: 'active', done: 1, total: 3, next: 'fix CodeQL alert', pr: '190' })
  expect(parseOrder('no order here')).toBeUndefined()
})

test('counts plan checklists, most open first, skipping history files', async () => {
  const rows = planCounts('docs/A_PLAN.md:4\ndocs/B.md:1\nHISTORY.md:9\n', 'docs/A_PLAN.md:2\ndocs/C.md:3\n')
  expect(rows).toEqual([
    { file: 'docs/A_PLAN.md', done: 2, total: 6 },
    { file: 'docs/B.md', done: 0, total: 1 },
    { file: 'docs/C.md', done: 3, total: 3 },
  ])
})

test('counts inbox items in a whole file or a now.md section', async () => {
  expect(inboxCount('# Inbox\n1. **bug** a\n2. **bug** b\n- [x] done one\n', true)).toBe(2)
  expect(inboxCount('## Now\n- goal\n## Inbox\n- one\n- two\n## Next\n- three\n', false)).toBe(2)
})

test('draws a bar and a progress summary', async () => {
  expect(bar(1, 4, 4)).toBe('[#...] 1/4')
  const text = progressText({
    order: parseOrder(ORDER), tasks: { done: 2, total: 3 }, agents: { running: 1, total: 2 }, turns: 7,
    plans: [{ file: 'docs/A_PLAN.md', done: 2, total: 6 }, { file: 'docs/C.md', done: 3, total: 3 }],
    inbox: { file: 'docs/roadmap/INBOX.md', items: 21 }, continues: 3,
  })
  expect(text).toContain('work order: ship · active · PR 190')
  expect(text).toContain('next: fix CodeQL alert')
  expect(text).toContain('21 open')
  expect(text).toContain('triage now')
  expect(text).toContain('plans: 1 open, 1 finished')
})

test('/progress reads the order, plans and inbox from the repo', async ($, on) => {
  const files: Record<string, string> = {
    'cat .claude/work-order.md': ORDER,
    'cat docs/roadmap/INBOX.md': '# Inbox\n1. **bug** a\n',
    'cat .claude/work-order.count': '2\n',
  }
  on('process.run', (_$, e) => {
    const argv = (e as unknown as { argv: string[] }).argv
    const key = argv.join(' ')
    const out = argv[0] === 'git' ? (key.includes('[xX]') ? 'docs/P.md:1\n' : 'docs/P.md:3\n') : files[key]
    return { value: { exitCode: out === undefined ? 1 : 0, stdout: out ?? '', stderr: '' } } as never
  })
  const r = await $.command.run({ command: 'progress', args: '' } as never)
  const text = String((r as { text?: string }).text)
  expect(text).toContain('work order: ship · active · PR 190 · [###.......] 1/3 · continues 2')
  expect(text).toContain('inbox: 1 open (docs/roadmap/INBOX.md)')
  expect(text).toContain('[###.......] 1/4 docs/P.md')
})


test('an empty field does not take the next line as its value', async () => {
  expect(parseOrder('mode: ship\nstatus: active\npr:\nstarted: x\n- [ ] a\n')?.pr).toBeUndefined()
})
