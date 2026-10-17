import type { AgentRow, Stats, TaskRow } from '../types'
import { TIER_LIMITS } from './tier'

export type CostRow = { model: string; share: number; turns: number; out: number }
export type LimitsView = { tier: string; tierReason: string; mode?: string; weekTrend: string }
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
  limits: LimitsView
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

const SPARK = '▁▂▃▄▅▆▇█'

// One block per value, 0 to 100 percent.
export function spark(values: number[]): string {
  return values.map(v => SPARK[Math.min(7, Math.max(0, Math.floor((Math.min(100, Math.max(0, v)) / 100) * 8)))]).join('')
}

// The weekly figure read at the end of each stored session, then now: a line you can see drift.
export function weekTrend(history: readonly { week?: number }[], current?: number): string {
  const points = [...history.map(h => h.week), current].filter((v): v is number => typeof v === 'number').slice(-12)
  if (points.length < 2) return 'week trend: needs 2 readings (one is stored at the end of each session)'
  const delta = points[points.length - 1] - points[0]
  return `week trend ${spark(points)} ${points[0]}% → ${points[points.length - 1]}% over ${points.length} readings (${delta >= 0 ? '+' : ''}${delta})`
}

function limitLine(name: string, pct: number | undefined, extra = ''): string {
  if (pct === undefined) return `  ${name}  not reported by this host`
  const level = pct >= TIER_LIMITS.stopWeek ? '🔴' : pct >= TIER_LIMITS.proWeek ? '🟡' : '🟢'
  return `  ${name}  ${level} ${bar(pct / 100)} ${pct}%${extra}`
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
    rule('Limits (live from the host)'),
    limitLine('5-hour', s.fiveHour),
    limitLine('weekly', s.week, s.weekResets ? ` · resets ${s.weekResets.slice(0, 16).replace('T', ' ')}` : ''),
    `  ${d.limits.weekTrend}`,
    `  tier ${d.limits.tier} (${d.limits.tierReason})${d.limits.mode ? ` · mode ${d.limits.mode}` : ''}`,
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
