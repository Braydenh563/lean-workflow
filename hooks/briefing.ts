// Morning briefing: what an away or work-order run left, from the work order and the handover summary.
// Pure text in, text out; the hook reads the files.
import { bar, parseOrder } from './progress'

export const HANDOVER_FILES = ['HANDOVER.md', 'docs/HANDOVER.md', '.claude/handover.md', 'docs/roadmap/HANDOVER.md', '.claude/now.md']
const MAX_LINES = 8

// The summary block of a handover: the lines under a "Morning"/"Summary" heading, else the first lines under the title.
export function handoverSummary(text: string): string[] {
  const lines = text.replace(/\r/g, '').split('\n')
  const heading = lines.findIndex(l => /^#{1,4}\s*(morning|summary)/i.test(l))
  let body: string[]
  if (heading >= 0) {
    const rest = lines.slice(heading + 1)
    const end = rest.findIndex(l => /^#{1,4}\s/.test(l))
    body = end < 0 ? rest : rest.slice(0, end)
  } else {
    body = lines.filter((l, i) => !(i === 0 && /^#\s/.test(l)) && !/^#{1,4}\s/.test(l))
  }
  return body.map(l => l.trimEnd()).filter(l => l.trim()).slice(0, MAX_LINES)
}

// Items the run gave up on: "- [!] item".
export function blockedItems(order: string): string[] {
  return order.split('\n').filter(l => /^\s*[-*] \[!\]/.test(l)).map(l => l.replace(/^\s*[-*] \[!\]\s*/, '').trim())
}

// Stable per run and outcome, so the briefing shows once and again only when the order moved on.
export function signature(order: string): string {
  const o = parseOrder(order)
  const started = order.match(/^started:\s*(.+)$/m)?.[1].trim() ?? ''
  return o ? `${o.mode}|${started}|${o.status}|${o.done}/${o.total}` : ''
}

export function briefingText(order: string, handover: string | undefined): string | undefined {
  const o = parseOrder(order)
  if (!o) return undefined
  const lead = /^active/.test(o.status) ? `${o.status} (the run stopped without finishing, or is still going)` : o.status
  const blocked = blockedItems(order)
  const out = [`☀ MORNING BRIEFING · ${o.mode} run · ${lead}`]
  out.push(`  done ${bar(o.done, o.total + blocked.length) || 'no checklist'}${o.pr ? ` · PR ${o.pr}` : ''}`)
  if (blocked.length) {
    out.push(`  blocked ${blocked.length}:`)
    for (const b of blocked.slice(0, 5)) out.push(`    ! ${b}`)
  }
  if (o.next) out.push(`  next: ${o.next}`)
  const summary = handover ? handoverSummary(handover) : []
  if (summary.length) {
    out.push('  handover:')
    for (const l of summary) out.push(`    ${l.trim()}`)
  }
  return out.join('\n')
}
