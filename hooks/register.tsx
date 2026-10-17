import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { AgentRow, ModelCost, SessionSummary, Stats, TaskRow } from '../types'
import { agentModel, bigImage, bigPaste, branchInfo, coachReport, idleGap, longPr, longSession, makeCoach, weeklyLimit, W } from './coach'
import type { CoachRow } from './coach'
import { dashText, k } from './format'

const DEFAULT_GREP_ONLY = '(^|/)(CODEMAP\\.md|HISTORY\\.md|CHANGELOG\\.md|package-lock\\.json|yarn\\.lock|pnpm-lock\\.yaml|poetry\\.lock|Cargo\\.lock)$|\\.min\\.js$|\\.map$'
// Agents that pin their own model; anything else must name one (the rungs).
const PINNED = new Set(['scout', 'reviewer', 'ux-auditor', 'blind-tester', 'fork'])
const HISTORY_KEY = 'history'
const USED_KEY = 'used'
const SEEN_KEY = 'seen'
const COACH_KEY = 'coach'
// Static, so it caches: a system prompt that changed per turn would rewrite the cache every time.
const AUTOPILOT = [
  'Lean workflow autopilot (from the lean-workflow plugin):',
  '- Run the lean-setup skill once per repo, only when CLAUDE.md neither has a "Lean workflow" section nor names the lean-workflow plugin, and no retro ledger exists. A repo that already carries the workflow is never set up again.',
  '- Route by rungs: haiku (scout) for lookup and mechanical work, sonnet for implementation, opus for design and risky review. Every Agent call names a model. Fable only when the user names it for that task.',
  '- When the user\'s ask is done and pushed, or a plugin note says context is high, update the handover state, run the retro skill, and tell the user to start a fresh session.',
  '- If scripts/orient.sh exists, run it first in a session. If scripts/gate.sh exists, run it before every push. If docs/CODEMAP.md exists, grep it before opening source files.',
  '- Agents keep a remaining-work file and commit at least every 20 minutes. Tests take a fixed "now" instead of reading the clock. A claim about how a UI looks needs a measurement from the running app.',
  '- Batch independent tool calls; grep then read line ranges; one retry per new hypothesis.',
].join('\n')
// Files that ride in every session's context: a size limit keeps them lean.
const DEFAULT_CLAUDE_MD_MAX = 200
const DEFAULT_NOW_MAX = 60
const INBOX_MAX = 20
const REPEAT_LIMIT = 3
// Only tools whose identical repeat means a stuck loop; inbox and status reads repeat by design.
const LOOP_TOOLS = new Set(['Bash', 'Read', 'Grep', 'Glob', 'Edit', 'Write', 'WebFetch', 'WebSearch'])
const BIG_CONTEXT = 150_000
const BIG_OUTPUT = 20_000
const PANE = 'lean-dash'

const agentsA = atom({ plugin: 'lean-workflow', key: 'agents' } as const, [])
const tasksA = atom({ plugin: 'lean-workflow', key: 'tasks' } as const, [])
const costsA = atom({ plugin: 'lean-workflow', key: 'costs' } as const, {})
const statsA = atom({ plugin: 'lean-workflow', key: 'stats' } as const, { turns: 0, calls: 0, denies: 0, ctx: 0, agents: 0 })

type Usage = { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number; model?: string }

function weighted(c: ModelCost): number {
  return c.input * W.input + c.reads * W.reads + c.writes * W.writes + c.output * W.output
}

function label(s: Stats): string {
  const pct = s.ctxPct === undefined ? '' : ` (${s.ctxPct}%)`
  const week = s.week === undefined ? '' : ` · week ${s.week}%`
  const five = s.fiveHour === undefined ? '' : ` · 5h ${s.fiveHour}%`
  return `ctx ${k(s.ctx)}${pct}${week}${five} · turns ${s.turns} · agents ${s.agents}`
}

// The single most useful next step, from this session's numbers.
function advice(s: Stats, costs: Record<string, ModelCost>): string {
  const all = Object.values(costs)
  const writes = all.reduce((a, c) => a + c.writes * W.writes, 0)
  const total = all.reduce((a, c) => a + weighted(c), 0) || 1
  const opus = Object.entries(costs).filter(([m]) => /opus/.test(m)).reduce((a, [, c]) => a + weighted(c), 0)
  if (s.week !== undefined && s.week >= 70) return `Weekly limit at ${s.week}%${s.weekResets ? ` (resets ${s.weekResets})` : ''}: work as tier pro until it resets: one agent, Sonnet, no Opus, short sessions.`
  if (s.fiveHour !== undefined && s.fiveHour >= 80) return `5-hour window at ${s.fiveHour}%: commit and push now, finish the step, then start fresh after the reset.`
  if (s.ctx > BIG_CONTEXT) return `Context ${k(s.ctx)} per turn: update the HANDOVER "Now" line and start a fresh session at the next milestone.`
  if (writes > 0.4 * total && s.turns > 3) return 'Cache writes are over 40% of cost: avoid gaps over an hour, model switches and idle check-ins.'
  if (opus > 0.6 * total && s.agents > 0) return 'Opus is over 60% of cost: route labour to haiku and implementation to sonnet.'
  if (s.turns > 0 && s.calls / s.turns > 25) return 'Many tool calls per turn: name files and line ranges in briefs, batch independent calls.'
  return 'No waste signal yet. Run the retro skill at session end.'
}

// The note to show when CLAUDE.md or now.md is read whole (or written) past its limit, or the inbox passes 20 items.
function sizeNote(plugin: string, path: string, text: string, claudeMax: number, nowMax: number): string | undefined {
  const lines = text.split('\n').length
  if (/(^|\/)CLAUDE\.md$/.test(path) && lines > claudeMax) {
    return `${plugin}: CLAUDE.md is ${lines} lines (limit ${claudeMax}) and rides in every turn. Move detail into a doc it links to; keep rules, not history.`
  }
  if (/(^|\/)\.claude\/now\.md$/.test(path)) {
    if (lines > nowMax) return `${plugin}: now.md is ${lines} lines (limit ${nowMax}). Fold finished work into the retro ledger or commit messages and keep only what the next session needs.`
    const inbox = text.split(/^## /m).find(b => /^Inbox/i.test(b))
    const items = inbox ? inbox.split('\n').filter(l => /^\s*(\d+[.)]|-)\s+\S/.test(l)).length : 0
    if (items >= INBOX_MAX) return `${plugin}: the now.md inbox holds ${items} items (limit under ${INBOX_MAX}). Triage it now: fix, place in a plan, or drop each one.`
  }
  return undefined
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
  const opts = options as { grepOnly?: string; claudeMdMaxLines?: number | string; nowMaxLines?: number | string }
  const grepOnly = new RegExp(String(opts.grepOnly || DEFAULT_GREP_ONLY))
  const claudeMax = Number(opts.claudeMdMaxLines) || DEFAULT_CLAUDE_MD_MAX
  const nowMax = Number(opts.nowMaxLines) || DEFAULT_NOW_MAX
  const sizeWarned = new Set<string>()
  let ctxNoted = false
  // A turn's usage sums every model request in it; each main-thread tool call adds one.
  let turnCalls = 0
  const bigOutputs = new Set<string>()
  let fableAsked = false
  let lastKey = ''
  let repeats = 0
  let lastTurnAt = 0
  const coach = makeCoach()
  let prChecked = false
  let prNudge: ReturnType<typeof longPr>

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'spend', description: "This session's cost split and the best next step to cut it" })
    await $.command.register({ name: 'prune', description: 'Plugins and skills you never use, from the sessions recorded so far' })
    await $.command.register({ name: 'coach', description: 'Habit counts and the trend from your stored sessions' })
    await $.command.register({ name: 'dash', description: 'Open the usage dashboard: agents, tasks, cost by model, efficiency' })
    return next(e)
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'dash' }, async $ => {
    const opened = await $.ui.open({ id: PANE, title: 'Usage' })
    if (opened?.isPlaced) return { text: 'Usage dashboard opened.' }
    // Surfaces that seat no panes (the desktop app here) get the same dashboard as text.
    const costs = await read($, costsA)
    const s = await read($, statsA)
    const total = Object.values(costs).reduce((a, c) => a + weighted(c), 0) || 1
    const sum = (f: (c: ModelCost) => number) => Object.values(costs).reduce((a, c) => a + f(c), 0) / total
    return {
      text: dashText({
        stats: s,
        agents: await read($, agentsA),
        tasks: await read($, tasksA),
        costs: Object.entries(costs).map(([model, c]) => ({ model, share: weighted(c) / total, turns: c.turns, out: c.output })),
        split: { reads: sum(c => c.reads * W.reads), writes: sum(c => c.writes * W.writes), output: sum(c => c.output * W.output) },
        now: await $.clock.now(),
        advice: advice(s, costs),
        trend: await trend($, s),
        bigContext: BIG_CONTEXT,
      }),
    }
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
    const images = e.attachments?.filter(a => a.type === 'image') ?? []
    let bytes = 0
    for (const a of images) {
      const m = a.id ? await $.prompt.media({ id: a.id }).catch(() => undefined) : undefined
      if (typeof m?.size === 'number') bytes = Math.max(bytes, m.size)
    }
    const usage = await $.session.usage().catch(() => undefined)
    if (!prChecked) {
      prChecked = true
      const b = await branchInfo(argv => $.process.run(argv), now).catch(() => undefined)
      if (b) prNudge = longPr(b)
    }
    const shown = coach.offer([
      idleGap({ idleMs: lastTurnAt ? now - lastTurnAt : 0, ctx: s.ctx }),
      bigPaste(e.text.length),
      bigImage({ count: images.length, bytes }),
      usage && longSession({ ageMs: now - usage.startedAt, turns: s.turns, ctx: usage.context.tokens ?? s.ctx }),
      usage && weeklyLimit(usage.rateLimits, now),
      prNudge,
    ])
    if (shown.length) $.ui.toast(shown.map(t => `${$.plugin.name}: ${t}`).join('\n'))
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
      // The host's live figures beat any estimate: a turn's usage sums its requests.
      let ctx = Math.round((u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens) / (turnCalls + 1))
      let live: Partial<Stats> = {}
      try {
        const usage = await $.session.usage()
        if (usage.context.tokens !== undefined) ctx = usage.context.tokens
        const week = usage.rateLimits.find(r => /seven|week/i.test(r.kind))
        const five = usage.rateLimits.find(r => /five|5h/i.test(r.kind))
        live = {
          ctxPct: usage.context.percent === undefined ? undefined : Math.round(usage.context.percent),
          week: week === undefined ? undefined : Math.round(week.percentUsed),
          fiveHour: five === undefined ? undefined : Math.round(five.percentUsed),
          weekResets: week?.resetsAt,
        }
      } catch {
        // A host without session.usage keeps the estimate.
      }
      const s = await update($, statsA, x => ({ ...x, ...live, turns: x.turns + 1, ctx }))
      const [shown] = coach.offer([
        ctx > BIG_CONTEXT ? longSession({ ageMs: 0, turns: s.turns, ctx }) : undefined,
        s.week === undefined ? undefined : weeklyLimit([{ kind: 'seven_day', percentUsed: s.week, resetsAt: s.weekResets }], await $.clock.now()),
      ], 1)
      if (shown) {
        $.ui.toast(`${$.plugin.name}: ${shown}`)
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
    const ran = await next(e)
    const hint = coach.offer([agentModel({ model: args.model, type: args.subagent_type, prompt: String((e as unknown as { prompt?: string }).prompt ?? '') })], 1)
    // Appended to the conversation so the orchestrator sees it before its next Agent call.
    return hint.length && ran.deny === undefined ? { ...ran, context: [...(ran.context ?? []), ...hint.map(t => `${$.plugin.name}: ${t}`)] } : ran
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
    const key = LOOP_TOOLS.has(e.tool) ? JSON.stringify(args) : ''
    repeats = key && key === lastKey ? repeats + 1 : 1
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
    // A whole-file read or a write is the only moment the full text is visible here.
    const target = e as unknown as { file_path?: string; limit?: number; content?: string }
    const seen = e.tool === 'Read' && target.limit === undefined ? ran.text : e.tool === 'Write' ? target.content : undefined
    if (target.file_path && typeof seen === 'string' && ran.deny === undefined) {
      const note = sizeNote($.plugin.name, target.file_path, seen, claudeMax, nowMax)
      if (note && !sizeWarned.has(note.split(' ')[1] + e.tool)) {
        sizeWarned.add(note.split(' ')[1] + e.tool)
        notes.push(note)
      }
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
      const coached = ((await $.store.get(COACH_KEY)) ?? []) as CoachRow[]
      await $.store.set(COACH_KEY, [...coached, { at: row.at, hits: coach.hits() }].slice(-30))
    }
    coach.reset()
    prChecked = false
    prNudge = undefined
    lastTurnAt = 0
    return next(e)
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'coach' }, async $ => {
    const history = ((await $.store.get(COACH_KEY)) ?? []) as CoachRow[]
    return { text: coachReport(history, coach.hits()) }
  })

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
