import { test, expect } from 'claude-code/testing'

import { blockedItems, briefingText, handoverSummary, signature } from './briefing'

const ORDER = 'mode: continue\nstatus: stopped (usage)\npr: 12\nstarted: 2026-10-17 22:10\n\n- [x] a\n- [x] b\n- [!] c needs a secret\n- [ ] d\n'
const HANDOVER = '# Handover\n\n## Morning summary\ndone: a, b (PR 12)\nblocked: c needs a secret\nusage: week 62%\nnext: d\n\n## Now\nlong notes\nmore\n'

test('the handover summary is the block under its Morning or Summary heading', () => {
  expect(handoverSummary(HANDOVER)).toEqual(['done: a, b (PR 12)', 'blocked: c needs a secret', 'usage: week 62%', 'next: d'])
  expect(handoverSummary('# Title\nline one\n\nline two\n## H\nignored heading content')).toEqual(['line one', 'line two', 'ignored heading content'])
  expect(handoverSummary(Array.from({ length: 30 }, (_, i) => `l${i}`).join('\n'))).toHaveLength(8)
})

test('blocked items are the [!] lines', () => {
  expect(blockedItems(ORDER)).toEqual(['c needs a secret'])
})

test('the briefing leads with the outcome and carries blocked items, next and the handover', () => {
  const text = briefingText(ORDER, HANDOVER)!
  for (const part of ['MORNING BRIEFING · continue run · stopped (usage)', '[#####.....] 2/4 · PR 12', 'blocked 1:', '! c needs a secret', 'next: d', 'usage: week 62%'])
    expect(text).toContain(part)
  expect(briefingText('not an order', HANDOVER)).toBeUndefined()
  expect(briefingText(ORDER, undefined)).not.toContain('handover:')
})

test('an order still marked active says the run did not finish', () => {
  expect(briefingText('mode: ship\nstatus: active\n- [ ] x\n', undefined)).toContain('stopped without finishing')
})

test('the signature changes when the run moves on', () => {
  expect(signature(ORDER)).toBe('continue|2026-10-17 22:10|stopped (usage)|2/3')
  expect(signature(ORDER.replace('- [ ] d', '- [x] d'))).not.toBe(signature(ORDER))
  expect(signature('nothing')).toBe('')
})
