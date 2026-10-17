import type { AgentRow, Stats, TaskRow } from '../types'

export type CostRow = { model: string; share: number; turns: number; out: number }
export type DashInput = {
  stats: Stats
  agents: AgentRow[]
  tasks: TaskRow[]
  costs: CostRow[]
  split: { reads: number; writes: number; output: number }
  now: number
  advice: string
  trend: string
  bigContext: number
}

const WIDTH = 20

export function k(n: number): string {
  return n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : `${Math.round(n / 1000)}k`
}

// A fixed-width block bar; frac is clamped to 0..1 and a non-zero value shows at least one block.
export function bar(frac: number, width = WIDTH): string {
  const f = Math.min(1, Math.max(0, Number.isFinite(frac) ? frac : 0))
  const on = f > 0 ? Math.max(1, Math.round(f * width)) : 0
  return '█'.repeat(on) + '░'.repeat(width - on)
}

function pct(share: number): string {
  return `${Math.round(share * 100)}%`
}

// Plain unicode, no markdown and no column alignment, so it reads the same in a terminal and in a proportional-font chat.
export function dashText(d: DashInput): string {
  const { stats: s } = d
  const level = s.ctx > d.bigContext ? '🔴' : s.ctx > d.bigContext * 0.66 ? '🟡' : '🟢'
  const rule = (title: string) => `▌${title.toUpperCase()}`
  const agents = d.agents.slice(-6).map(a => {
    const secs = Math.round(((a.endedAt ?? d.now) - a.startedAt) / 1000)
    return `  ${a.endedAt === undefined ? '◉' : '○'} ${a.type} · ${a.model} · ${secs}s · ${a.calls} calls${a.tokens ? ` · ${k(a.tokens)}` : ''}`
  })
  const done = d.tasks.filter(t => t.status === 'completed').length
  const tasks = d.tasks.slice(-6).map(t => `  ${t.status === 'completed' ? '✔' : t.status === 'in_progress' ? '◐' : '○'} ${t.subject}`)
  const costs = d.costs.map(c => `  ${bar(c.share, 12)} ${pct(c.share)}  ${c.model.replace(/^claude-/, '')} · ${c.turns} turns · out ${k(c.out)}`)
  const split = (['reads', 'writes', 'output'] as const).map(key => `${key} ${bar(d.split[key], 6)} ${pct(d.split[key])}`)
  return [
    '✦ LEAN WORKFLOW · session',
    '',
    rule('Context per turn'),
    `  ${level} ${bar(s.ctx / (d.bigContext * 4 / 3))} ${k(s.ctx)} of ${k(d.bigContext)} budget`,
    `  ${d.trend}`,
    '',
    rule('Activity'),
    `  ${s.turns} turns · ${s.calls} tool calls · ${s.agents} agents · ${s.denies} blocked`,
    '',
    rule(`Agents ${d.agents.length}`),
    ...(agents.length ? agents : ['  none yet']),
    '',
    rule(`Tasks ${d.tasks.length ? `${done}/${d.tasks.length}` : ''}`.trim()),
    ...(tasks.length ? tasks : ['  none']),
    '',
    rule('Cost by model'),
    ...(costs.length ? costs : ['  none yet']),
    `  split: ${split.join(' · ')}`,
    '',
    `➜ ${d.advice}`,
  ].join('\n')
}
