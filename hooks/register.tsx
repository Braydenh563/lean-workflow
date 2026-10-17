import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { AgentRow, ModelCost, SessionSummary, Stats, TaskRow } from '../types'

const DEFAULT_GREP_ONLY = '(^|/)(CODEMAP\\.md|HISTORY\\.md|CHANGELOG\\.md|package-lock\\.json|yarn\\.lock|pnpm-lock\\.yaml|poetry\\.lock|Cargo\\.lock)$|\\.min\\.js$|\\.map$'
// Agents that pin their own model; anything else must name one (the rungs).
const PINNED = new Set(['scout', 'reviewer', 'ux-auditor', 'blind-tester', 'fork'])
const HISTORY_KEY = 'history'
const USED_KEY = 'used'
const SEEN_KEY = 'seen'
// Static, so it caches: a system prompt that changed per turn would rewrite the cache every time.
const AUTOPILOT = [
  'Lean workflow autopilot (from the lean-workflow plugin):',
  '- If CLAUDE.md has no "Lean workflow" section, run the lean-setup skill before other work.',
  '- Route by rungs: haiku (scout) for lookup and mechanical work, sonnet for implementation, opus for design and risky review. Every Agent call names a model. Fable only when the user names it for that task.',
  '- When the user\'s ask is done and pushed, or a plugin note says context is high, update the handover state, run the retro skill, and tell the user to start a fresh session.',
  '- Batch independent tool calls; grep then read line ranges; one retry per new hypothesis.',
].join('\n')
const REPEAT_LIMIT = 3
const BIG_CONTEXT = 150_000
const BIG_OUTPUT = 20_000
const COLD_MS = 55 * 60 * 1000 // the 1h prompt cache is about to expire
// Price relative to plain input; ratios only, not plan usage.
const W = { input: 1, reads: 0.1, writes: 2, output: 5 }
const PANE = 'lean-dash'

const agentsA = atom({ plugin: 'lean-workflow', key: 'agents' } as const, [])
const tasksA = atom({ plugin: 'lean-workflow', key: 'tasks' } as const, [])
const costsA = atom({ plugin: 'lean-workflow', key: 'costs' } as const, {})
const statsA = atom({ plugin: 'lean-workflow', key: 'stats' } as const, { turns: 0, calls: 0, denies: 0, ctx: 0, agents: 0 })

type Usage = { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number; model?: string }

function weighted(c: ModelCost): number {
  return c.input * W.input + c.reads * W.reads + c.writes * W.writes + c.output * W.output
}

function k(n: number): string {
  return n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : `${Math.round(n / 1000)}k`
}

function label(s: Stats): string {
  return `ctx ${k(s.ctx)} · turns ${s.turns} · calls ${s.calls} · agents ${s.agents}`
}

// The single most useful next step, from this session's numbers.
function advice(s: Stats, costs: Record<string, ModelCost>): string {
  const all = Object.values(costs)
  const writes = all.reduce((a, c) => a + c.writes * W.writes, 0)
  const total = all.reduce((a, c) => a + weighted(c), 0) || 1
  const opus = Object.entries(costs).filter(([m]) => /opus/.test(m)).reduce((a, [, c]) => a + weighted(c), 0)
  if (s.ctx > BIG_CONTEXT) return `Context ${k(s.ctx)} per turn: update the HANDOVER "Now" line and start a fresh session at the next milestone.`
  if (writes > 0.4 * total && s.turns > 3) return 'Cache writes are over 40% of cost: avoid gaps over an hour, model switches and idle check-ins.'
  if (opus > 0.6 * total && s.agents > 0) return 'Opus is over 60% of cost: route labour to haiku and implementation to sonnet.'
  if (s.turns > 0 && s.calls / s.turns > 25) return 'Many tool calls per turn: name files and line ranges in briefs, batch independent calls.'
  return 'No waste signal yet. Run the retro skill at session end.'
}

type Store = { store: { get: (k: string) => Promise<unknown>; set: (k: string, v: unknown) => Promise<void> } }

// Usage across sessions, so /prune can name plugins that never earn their context.
async function markUsed($: Store, name: string): Promise<void> {
  const used = ((await $.store.get(USED_KEY)) ?? {}) as Record<string, number>
  used[name] = (used[name] ?? 0) + 1
  await $.store.set(USED_KEY, used)
}

async function trend($: { store: { get: (k: string) => Promise<unknown> } }, s: Stats): Promise<string> {
  const history = ((await $.store.get(HISTORY_KEY)) ?? []) as SessionSummary[]
  if (history.length < 3) return `trend: ${history.length} earlier sessions recorded; a median needs 3.`
  const med = [...history.map(h => h.ctx)].sort((a, b) => a - b)[Math.floor(history.length / 2)]
  return `trend: context ${k(s.ctx)} vs your median ${k(med)} over ${history.length} sessions`
}

export const register: Register = (on, options) => {
  const grepOnly = new RegExp(String((options as { grepOnly?: string }).grepOnly || DEFAULT_GREP_ONLY))
  let ctxNoted = false
  // A turn's usage sums every model request in it; each main-thread tool call adds one.
  let turnCalls = 0
  const bigOutputs = new Set<string>()
  let fableAsked = false
  let lastKey = ''
  let repeats = 0
  let lastTurnAt = 0
  let bigWarned = false

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'spend', description: "This session's cost split and the best next step to cut it" })
    await $.command.register({ name: 'prune', description: 'Plugins and skills you never use, from the sessions recorded so far' })
    await $.command.register({ name: 'dash', description: 'Open the usage dashboard: agents, tasks, cost by model, efficiency' })
    return next(e)
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'dash' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Usage' })
    return { text: 'Usage dashboard opened.' }
  })

  on('command.run', { command: 'spend' }, async $ => {
    const s = await read($, statsA)
    const costs = await read($, costsA)
    const total = Object.values(costs).reduce((a, c) => a + weighted(c), 0) || 1
    const sum = (f: (c: ModelCost) => number) => Object.values(costs).reduce((a, c) => a + f(c), 0)
    const pct = (n: number) => `${Math.round((100 * n) / total)}%`
    const byModel = Object.entries(costs).map(([m, c]) => `${m} ${pct(weighted(c))}`).join(', ')
    return {
      text: [
        `turns ${s.turns}, context ${k(s.ctx)}, tool calls ${s.calls}, agents ${s.agents}, blocked ${s.denies}`,
        `cost share: cache reads ${pct(sum(c => c.reads * W.reads))}, cache writes ${pct(sum(c => c.writes * W.writes))}, output ${pct(sum(c => c.output * W.output))}`,
        `by model: ${byModel || 'none yet'}`,
        await trend($, s),
        advice(s, costs),
      ].join('\n'),
    }
  })

  // Fable is opt-in: any later prompt that does not name it clears the grant.
  on('prompt.submit', async ($, e, next) => {
    fableAsked = /fable/i.test(e.text)
    turnCalls = 0
    const now = await $.clock.now()
    const s = await read($, statsA)
    if (lastTurnAt && now - lastTurnAt > COLD_MS) {
      $.ui.toast(`Idle ${Math.round((now - lastTurnAt) / 60000)} min: the cache has likely expired, so this turn re-caches ${k(s.ctx)} tokens. A fresh session may be cheaper.`)
    }
    if (e.attachments?.some(a => a.type === 'image')) {
      $.ui.toast('Images stay in context for every later turn. Crop to the problem, or state the numbers instead.')
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    if (r.deny === undefined) {
      const row: AgentRow = {
        id: r.agentId ?? e.tool_use_id, type: e.subagentType, desc: e.description, model: r.model,
        startedAt: await $.clock.now(), calls: 0, lastTool: '', tokens: 0,
      }
      await update($, agentsA, list => [...list, row].slice(-30))
      await update($, statsA, s => ({ ...s, agents: s.agents + 1 }))
    }
    return r
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const u = e.usage as Usage | undefined
    if (u) {
      const model = u.model ?? 'unknown'
      await update($, costsA, costs => {
        const c = costs[model] ?? { turns: 0, input: 0, reads: 0, writes: 0, output: 0 }
        return { ...costs, [model]: { turns: c.turns + 1, input: c.input + u.input_tokens, reads: c.reads + u.cache_read_input_tokens, writes: c.writes + u.cache_creation_input_tokens, output: c.output + u.output_tokens } }
      })
    }
    if (e.agentId) {
      const now = await $.clock.now()
      const tokens = u ? u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens + u.output_tokens : 0
      await update($, agentsA, list => list.map(a => (a.id === e.agentId ? { ...a, endedAt: now, tokens: a.tokens + tokens } : a)))
    } else if (u) {
      lastTurnAt = await $.clock.now()
      const ctx = Math.round((u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens) / (turnCalls + 1))
      const s = await update($, statsA, x => ({ ...x, turns: x.turns + 1, ctx }))
      if (ctx > BIG_CONTEXT && !bigWarned) {
        bigWarned = true
        $.ui.toast(advice(s, await read($, costsA)))
      }
      $.ui.status(label(s))
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'Read' }, async ($, e, next) => {
    const args = e as unknown as { file_path: string; limit?: number }
    if (grepOnly.test(args.file_path) && args.limit === undefined) {
      await update($, statsA, s => ({ ...s, denies: s.denies + 1 }))
      return { deny: `${$.plugin.name}: ${args.file_path} is huge. Grep it, then read a line range (offset and limit).` }
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    const args = e as unknown as { model?: string; subagent_type?: string }
    const type = args.subagent_type ?? 'general-purpose'
    const fable = args.model && /fable/i.test(args.model) && !fableAsked
    const bare = !args.model && !PINNED.has(type) && !type.includes(':')
    if (fable || bare) {
      await update($, statsA, s => ({ ...s, denies: s.denies + 1 }))
      return {
        deny: fable
          ? `${$.plugin.name}: Fable is opt-in. Ask the user to name it for this task, or use sonnet, haiku or opus.`
          : `${$.plugin.name}: name a model. haiku for lookup and labour, sonnet to implement, opus for judgement. Unset inherits the orchestrator's model.`,
      }
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // Task tools feed the dashboard's task list.
  on('tool.call', { tool: 'TaskCreate' }, async ($, e, next) => {
    const r = await next(e)
    const args = e as unknown as { subject?: string }
    const res = r.result as { task?: { id?: string } } | undefined
    const tasks = await read($, tasksA)
    const row: TaskRow = { id: res?.task?.id ?? String(tasks.length + 1), subject: args.subject ?? '?', status: 'pending' }
    await update($, tasksA, list => [...list, row].slice(-50))
    return r
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'TaskUpdate' }, async ($, e, next) => {
    const r = await next(e)
    const args = e as unknown as { taskId?: string; status?: string; subject?: string }
    if (args.taskId) {
      await update($, tasksA, list => list.map(t => (t.id === args.taskId ? { ...t, status: args.status ?? t.status, subject: args.subject ?? t.subject } : t)))
    }
    return r
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const { tool_use_id: _id, agentId, ...args } = e as unknown as Record<string, unknown>
    if (typeof agentId === 'string') {
      await update($, agentsA, list => list.map(a => (a.id === agentId ? { ...a, calls: a.calls + 1, lastTool: e.tool } : a)))
      return next(e)
    }
    turnCalls += 1
    const key = JSON.stringify(args)
    repeats = key === lastKey ? repeats + 1 : 1
    lastKey = key
    const s = await update($, statsA, x => ({ ...x, calls: x.calls + 1, denies: x.denies + (repeats >= REPEAT_LIMIT ? 1 : 0) }))
    $.ui.status(label(s))
    if (repeats >= REPEAT_LIMIT) {
      return { deny: `${$.plugin.name}: same call ${repeats} times in a row. Change the hypothesis or report the blocker.` }
    }
    const ran = await next(e)
    if (e.tool.startsWith('mcp__')) await markUsed($, e.tool.split('__')[1] ?? e.tool)
    const notes: string[] = []
    const size = typeof ran.text === 'string' ? ran.text.length : 0
    if (size > BIG_OUTPUT && !bigOutputs.has(e.tool)) {
      bigOutputs.add(e.tool)
      notes.push(`${$.plugin.name}: that ${e.tool} result was ${Math.round(size / 1000)}k characters and now rides in context every turn. Narrow the next one (head, grep, a line range).`)
    }
    if (s.ctx > BIG_CONTEXT && !ctxNoted) {
      ctxNoted = true
      notes.push(`${$.plugin.name}: context is ${k(s.ctx)} per turn. Finish the current step, update the handover state, run the retro skill, and tell the user to start a fresh session.`)
    }
    // Appended to the conversation, not the system prompt, so the cache stays warm.
    return notes.length && ran.deny === undefined ? { ...ran, context: [...(ran.context ?? []), ...notes] } : ran
  }).catch(($, e, next) => next(e))


  on('prompt.compose', async ($, e, next) => {
    const r = await next(e)
    return { ...r, sections: [...r.sections, { id: 'lean-workflow-autopilot', text: AUTOPILOT, scope: 'shared' as const }] }
  }).catch(($, e, next) => next(e))


  on('plugin.register', async ($, e, next) => {
    const seen = ((await $.store.get(SEEN_KEY)) ?? []) as string[]
    if (!seen.includes(e.name)) await $.store.set(SEEN_KEY, [...seen, e.name])
    return next(e)
  }).catch(($, e, next) => next(e))

  on('skill.prompt', async ($, e, next) => {
    await markUsed($, e.skill.includes(':') ? e.skill.split(':')[0] : e.skill)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('session.end', async ($, e, next) => {
    const s = await read($, statsA)
    const costs = await read($, costsA)
    if (s.turns > 0) {
      const all = Object.values(costs)
      const total = all.reduce((a, c) => a + weighted(c), 0) || 1
      const writeShare = Math.round((100 * all.reduce((a, c) => a + c.writes * W.writes, 0)) / total)
      const history = ((await $.store.get(HISTORY_KEY)) ?? []) as SessionSummary[]
      const row: SessionSummary = { at: await $.clock.now(), turns: s.turns, ctx: s.ctx, calls: s.calls, agents: s.agents, denies: s.denies, writeShare }
      await $.store.set(HISTORY_KEY, [...history, row].slice(-30))
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'prune' }, async $ => {
    const used = ((await $.store.get(USED_KEY)) ?? {}) as Record<string, number>
    const seen = ((await $.store.get(SEEN_KEY)) ?? []) as string[]
    const history = ((await $.store.get(HISTORY_KEY)) ?? []) as SessionSummary[]
    const unused = seen.filter(n => !used[n] && n !== 'lean-workflow')
    const top = Object.entries(used).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([n, c]) => `${n} ${c}`).join(', ')
    return {
      text: [
        `sessions recorded: ${history.length}`,
        `used most: ${top || 'nothing recorded yet'}`,
        history.length < 5
          ? 'Need 5 sessions before naming plugins to disable.'
          : `never used in ${history.length} sessions: ${unused.join(', ') || 'none'}. Disable these in your Claude plugin settings; each one adds its skill list to every turn.`,
        'Skills used through an agent or a connector also count as used.',
      ].join('\n'),
    }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const agents = await read($, agentsA)
    const tasks = await read($, tasksA)
    const costs = await read($, costsA)
    const s = await read($, statsA)
    const now = await $.clock.now()
    const total = Object.values(costs).reduce((a, c) => a + weighted(c), 0) || 1
    const done = tasks.filter(t => t.status === 'completed').length

    return (
      <Box flexDirection="column">
        <Text bold>Session</Text>
        <Text>{label(s)} · blocked {s.denies}</Text>
        <Text bold>Agents</Text>
        {agents.length === 0 && <Text dimColor>None yet.</Text>}
        {agents.slice(-8).map(a => (
          <Text dimColor={a.endedAt !== undefined}>
            {a.endedAt === undefined ? 'runs' : 'done'} {a.type} ({a.model}) {Math.round(((a.endedAt ?? now) - a.startedAt) / 1000)}s · {a.calls} calls{a.lastTool ? ` · ${a.lastTool}` : ''}{a.tokens ? ` · ${k(a.tokens)}` : ''} · {a.desc}
          </Text>
        ))}
        <Text bold>Tasks {tasks.length ? `${done}/${tasks.length}` : ''}</Text>
        {tasks.length === 0 && <Text dimColor>None.</Text>}
        {tasks.slice(-8).map(t => (
          <Text dimColor={t.status === 'completed'}>{t.status === 'completed' ? 'done' : t.status === 'in_progress' ? 'now ' : 'todo'} {t.subject}</Text>
        ))}
        <Text bold>Cost by model (weighted)</Text>
        {Object.entries(costs).map(([m, c]) => (
          <Text>{m}: {Math.round((100 * weighted(c)) / total)}% · {c.turns} turns · out {k(c.output)}</Text>
        ))}
        <Text bold>Next step</Text>
        <Text>{advice(s, costs)}</Text>
      </Box>
    )
  })
}
