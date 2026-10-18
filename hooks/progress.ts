// Progress from the repo's own files: the work order, plan checklists and the inbox.
// Pure text in, text out, so the tests need no repo.

export type Order = { mode: string; status: string; done: number; total: number; next?: string; pr?: string }

const BOX = /^\s*[-*] \[([ xX])\]\s*(.*)$/

export function parseOrder(text: string): Order | undefined {
  const field = (name: string) => text.match(new RegExp(`^${name}:[ \\t]*(.+)$`, 'm'))?.[1].trim()
  const mode = field('mode')
  if (!mode) return undefined
  let done = 0
  let total = 0
  let next: string | undefined
  for (const line of text.split('\n')) {
    const m = line.match(BOX)
    if (!m) continue
    total += 1
    if (m[1] === ' ') next ??= m[2].trim()
    else done += 1
  }
  return { mode, status: field('status') ?? 'unknown', done, total, next, pr: field('pr') }
}

// `git grep -c` output ("path:count"), one run for open boxes and one for ticked.
export function planCounts(open: string, ticked: string): { file: string; done: number; total: number }[] {
  const parse = (s: string) => new Map(s.split('\n').filter(Boolean).map(l => {
    const i = l.lastIndexOf(':')
    return [l.slice(0, i), Number(l.slice(i + 1)) || 0] as const
  }))
  const o = parse(open)
  const t = parse(ticked)
  return [...new Set([...o.keys(), ...t.keys()])]
    .filter(f => !/(^|\/)(HISTORY|CHANGELOG)\.md$|work-order\.md$/.test(f))
    .map(file => ({ file, done: t.get(file) ?? 0, total: (t.get(file) ?? 0) + (o.get(file) ?? 0) }))
    .sort((a, b) => (b.total - b.done) - (a.total - a.done))
}

// Numbered or bulleted items: a whole INBOX.md, or the "## Inbox" section of now.md.
export function inboxCount(text: string, whole: boolean): number {
  const body = whole ? text : (text.split(/^## /m).find(b => /^Inbox/i.test(b)) ?? '')
  return body.split('\n').filter(l => /^(\d+[.)]|[-*])\s+\S/.test(l) && !/^\s*[-*] \[[xX]\]/.test(l)).length
}

export function bar(done: number, total: number, width = 10): string {
  if (!total) return ''
  const n = Math.round((width * done) / total)
  return `[${'#'.repeat(n)}${'.'.repeat(width - n)}] ${done}/${total}`
}

export type ProgressInput = {
  order?: Order
  tasks: { done: number; total: number }
  agents: { running: number; total: number }
  turns: number
  plans: { file: string; done: number; total: number }[]
  inbox?: { file: string; items: number }
  continues?: number
}

export function progressText(p: ProgressInput): string {
  const lines: string[] = []
  const o = p.order
  lines.push(o
    ? `work order: ${o.mode} · ${o.status}${o.pr ? ` · PR ${o.pr}` : ''} · ${bar(o.done, o.total) || 'no checklist'}${p.continues ? ` · continues ${p.continues}` : ''}${o.next ? `\n  next: ${o.next}` : ''}`
    : 'work order: none (say "ship" or "continue", or run /work ship|continue)')
  lines.push(`session: ${p.turns} turns · tasks ${bar(p.tasks.done, p.tasks.total) || 'none'} · agents ${p.agents.running} running of ${p.agents.total}`)
  lines.push(p.inbox ? `inbox: ${p.inbox.items} open (${p.inbox.file})${p.inbox.items >= 20 ? ' · triage now' : ''}` : 'inbox: none found')
  const open = p.plans.filter(x => x.total > x.done)
  if (!p.plans.length) lines.push('plans: no checklists found')
  else {
    const done = p.plans.length - open.length
    lines.push(`plans: ${open.length} open, ${done} finished`)
    for (const x of open.slice(0, 6)) lines.push(`  ${bar(x.done, x.total)} ${x.file}`)
  }
  return lines.join('\n')
}
