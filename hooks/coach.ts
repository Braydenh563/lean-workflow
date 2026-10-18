import { k } from './format'

// Habit coach: pure rules. Each returns the nudge text (the cheaper alternative and an estimated saving) or undefined.
// Savings are estimates in "token-equivalents" (plain input = 1) from the constants below, never measured spend.
export type Habit = 'longSession' | 'longPr' | 'agentModel' | 'bigPaste' | 'bigImage' | 'idleGap' | 'weeklyLimit' | 'reread' | 'fanOut'
export const HABITS: Habit[] = ['longSession', 'longPr', 'agentModel', 'bigPaste', 'bigImage', 'idleGap', 'weeklyLimit', 'reread', 'fanOut']
// save: estimated token-equivalents the cheaper alternative would avoid (what /coach totals as "flagged").
export type Nudge = { habit: Habit; text: string; repeat?: boolean; save?: number }
export type Tally = Partial<Record<Habit, number>>
export type CoachRow = { at: number; hits: Tally; flagged?: Tally }

// Habits named in the coachOff option, ignoring anything that is not a habit.
export function parseOff(raw: unknown): Set<Habit> {
  const names = String(raw ?? '').split(/[\s,]+/)
  return new Set(HABITS.filter(h => names.some(n => n.toLowerCase() === h.toLowerCase())))
}

export const W = { input: 1, reads: 0.1, writes: 2, output: 5 }
// Relative price per token by rung (ratios only; upgrade-scan re-checks them against the pricing page).
export const RATE: Record<'haiku' | 'sonnet' | 'opus', number> = { haiku: 1, sonnet: 3, opus: 5 }
export const LIMITS = {
  sessionMs: 3 * 3600_000,
  sessionTurns: 100,
  sessionCtx: 150_000,
  prDays: 3,
  prCommits: 25,
  pasteChars: 20_000,
  imageBytes: 1024 * 1024,
  imageCount: 2,
  idleMs: 55 * 60 * 1000,
  weeklyPct: 70,
  weeklyAhead: 20,
  rereads: 3,
  fanOut: 4,
}
const FRESH_CTX = 20_000 // what a fresh session starts with once the handover is read
const HORIZON = 20 // turns a carried item is assumed to ride along
const COMMIT_TOKENS = 800 // assumed size of one commit's diff when a PR is re-reviewed
const IMAGE_TOKENS = 1_500 // assumed cost of one image (the API caps near this)
const AGENT_RUN = 50_000 // assumed token-equivalents of one subagent run, for pricing a rung change
const AGENT_START = 15_000 // assumed tokens an agent spends orienting before it does useful work
const REREAD_TOKENS = 2_000 // assumed size of a re-read file when its text is not visible
const WEEK_MS = 7 * 24 * 3600_000

// Cost of keeping `tokens` in context for HORIZON turns: written once, read after.
export function carry(tokens: number): number {
  return tokens * (W.writes + W.reads * HORIZON)
}

export function rung(model?: string): 'haiku' | 'sonnet' | 'opus' | undefined {
  const m = /haiku|sonnet|opus/i.exec(model ?? '')
  return m ? (m[0].toLowerCase() as 'haiku' | 'sonnet' | 'opus') : undefined
}

export function longSession(a: { ageMs: number; turns: number; ctx: number }): Nudge | undefined {
  const { sessionMs, sessionTurns, sessionCtx } = LIMITS
  if (a.ageMs < sessionMs && a.turns < sessionTurns && a.ctx < sessionCtx) return undefined
  const save = Math.max(0, a.ctx - FRESH_CTX) * W.reads * HORIZON
  const why = `${(a.ageMs / 3600_000).toFixed(1)} h, ${a.turns} turns, context ${k(a.ctx)}`
  return {
    habit: 'longSession',
    save,
    text: `Long session (${why}). Cheaper: update the handover Now line, run retro, start a fresh session${save > 0 ? `; saves about ${k(save)} token-equivalents of cache reads over the next ${HORIZON} turns (estimate)` : ''}.`,
  }
}

export function longPr(a: { branch: string; commits: number; ageMs: number }): Nudge | undefined {
  const days = a.ageMs / 86_400_000
  if (days < LIMITS.prDays && a.commits < LIMITS.prCommits) return undefined
  const save = a.commits * COMMIT_TOKENS * 0.5
  return {
    habit: 'longPr',
    save,
    text: `Branch ${a.branch} is ${days.toFixed(1)} days old with ${a.commits} commits. Cheaper: merge what is done and open the rest as a second small PR; each review round re-reads the diff, and halving it saves about ${k(save)} tokens per round (estimate).`,
  }
}

const JUDGEMENT = /\b(design|architect\w*|review|security|refactor\w*|debug\w*|root cause|trade-?offs?|implement\w*|migrat\w*)\b/i
const LOOKUP = /\b(find|locate|list|grep|search|where|count|which files|read|summari[sz]e|rename|format|extract)\b/i
const LOOKUP_TYPES = new Set(['scout', 'explore'])

// The cheapest rung that fits, by how simple the brief looks; undefined when the model is already right.
export function agentModel(a: { model?: string; type?: string; prompt: string }): Nudge | undefined {
  const have = rung(a.model)
  if (!have || have === 'haiku') return undefined
  const type = (a.type ?? '').split(':').pop()!.toLowerCase()
  const simple = LOOKUP_TYPES.has(type) || (a.prompt.length <= 600 && LOOKUP.test(a.prompt) && !JUDGEMENT.test(a.prompt))
  const want = simple ? 'haiku' : have === 'opus' && !JUDGEMENT.test(a.prompt) ? 'sonnet' : have
  if (want === have) return undefined
  const cut = Math.round(100 * (1 - RATE[want] / RATE[have]))
  return {
    habit: 'agentModel',
    repeat: true,
    save: (AGENT_RUN * cut) / 100,
    text: `Agent "${a.type ?? 'general-purpose'}" ran on ${have} for a ${simple ? 'lookup-sized' : 'no-judgement'} task. Cheaper: model ${want} for the next one like it; about ${cut}% less per token on that call (relative list price, estimate).`,
  }
}

export function bigPaste(chars: number): Nudge | undefined {
  if (chars < LIMITS.pasteChars) return undefined
  const tokens = Math.round(chars / 4)
  return {
    habit: 'bigPaste',
    repeat: true,
    save: carry(tokens) * 0.9,
    text: `Pasted ${k(chars)} characters (about ${k(tokens)} tokens) that now ride along every turn. Cheaper: save it to a file and have Claude grep it and read a line range; about ${k(carry(tokens) * 0.9)} token-equivalents over ${HORIZON} turns (estimate).`,
  }
}

export function bigImage(a: { count: number; bytes?: number }): Nudge | undefined {
  if (a.count === 0) return undefined
  if (a.count < LIMITS.imageCount && (a.bytes ?? 0) < LIMITS.imageBytes) return undefined
  const size = a.bytes ? `, ${(a.bytes / 1048576).toFixed(1)} MB` : ''
  return {
    habit: 'bigImage',
    repeat: true,
    save: carry(a.count * (IMAGE_TOKENS - 100)),
    text: `${a.count} image${a.count > 1 ? 's' : ''}${size} stay in context on every later turn. Cheaper: crop to the problem, or state the numbers; about ${k(carry(a.count * (IMAGE_TOKENS - 100)))} token-equivalents over ${HORIZON} turns (estimate).`,
  }
}

export function idleGap(a: { idleMs: number; ctx: number }): Nudge | undefined {
  if (a.idleMs < LIMITS.idleMs) return undefined
  const save = Math.max(0, a.ctx - FRESH_CTX) * W.writes
  return {
    habit: 'idleGap',
    repeat: true,
    save,
    text: `Idle ${Math.round(a.idleMs / 60000)} min: the prompt cache has likely expired, so this turn re-caches ${k(a.ctx)} tokens. Cheaper: start a fresh session from the handover; saves about ${k(save)} token-equivalents of cache writes (estimate).`,
  }
}

// The same file read whole again: each read lands in context again and rides along.
export function reread(a: { path: string; count: number; chars?: number }): Nudge | undefined {
  if (a.count < LIMITS.rereads) return undefined
  const tokens = a.chars ? Math.round(a.chars / 4) : REREAD_TOKENS
  const save = carry(tokens) * (a.count - 1)
  return {
    habit: 'reread',
    repeat: true,
    save,
    text: `${a.path} has been read whole ${a.count} times. Cheaper: write the few facts you need into now.md, or grep it and read a line range; about ${k(save)} token-equivalents over ${HORIZON} turns (estimate).`,
  }
}

// Many agents in one prompt: each pays to orient before it does anything.
// `cap` is the plan's agents-at-once; without a plan the limit is the default.
export function fanOut(spawned: number, cap?: number): Nudge | undefined {
  if (spawned < (cap === undefined ? LIMITS.fanOut : Math.min(LIMITS.fanOut, cap + 1))) return undefined
  const save = (spawned - 2) * AGENT_START * W.writes
  return {
    habit: 'fanOut',
    save,
    text: `${spawned} agents started in one prompt, each reading the repo from scratch. Cheaper: one haiku scout to locate the files, then at most ${Math.min(2, cap ?? 2)} builder${Math.min(2, cap ?? 2) === 1 ? '' : 's'} with the paths in their briefs; about ${k(save)} token-equivalents of start-up (estimate).`,
  }
}

export type Limit = { kind: string; percentUsed: number; resetsAt?: string }
// Weekly window: over the threshold, or well ahead of an even burn through the week.
export function weeklyLimit(limits: readonly Limit[], now: number): Nudge | undefined {
  const w = limits.find(l => l.kind === 'seven_day')
  if (!w) return undefined
  const resets = w.resetsAt ? Date.parse(w.resetsAt) : NaN
  const elapsed = Number.isFinite(resets) ? Math.min(100, Math.max(0, 100 * (1 - (resets - now) / WEEK_MS))) : undefined
  const ahead = elapsed === undefined ? 0 : w.percentUsed - elapsed
  if (w.percentUsed < LIMITS.weeklyPct && !(w.percentUsed >= 50 && ahead >= LIMITS.weeklyAhead)) return undefined
  const cut = (a: 'haiku' | 'sonnet' | 'opus', b: 'haiku' | 'sonnet' | 'opus') => Math.round(100 * (1 - RATE[b] / RATE[a]))
  const pace = elapsed === undefined ? '' : ` (${Math.round(elapsed)}% of the week gone)`
  const reset = Number.isFinite(resets) ? ` Big runs can wait for the reset at ${new Date(resets).toISOString().slice(0, 16)}Z.` : ''
  return {
    habit: 'weeklyLimit',
    text: `Weekly limit ${w.percentUsed}% used${pace}. Cheaper: opus to sonnet cuts a call about ${cut('opus', 'sonnet')}%, to haiku ${cut('opus', 'haiku')}% (relative list price, estimate); keep opus for design and review.${reset}`,
  }
}

// Once-per-session delivery. A state-like habit counts one hit a session; a repeat habit counts every occurrence.
// Habits in `off` are never counted or shown.
export function makeCoach(off: ReadonlySet<Habit> = new Set()) {
  let hits: Tally = {}
  let flagged: Tally = {}
  let shown = new Set<Habit>()
  return {
    offer(nudges: (Nudge | undefined)[], max = 2): string[] {
      const out: string[] = []
      for (const n of nudges) {
        if (!n || off.has(n.habit)) continue
        if (n.repeat || !hits[n.habit]) {
          hits[n.habit] = (hits[n.habit] ?? 0) + 1
          flagged[n.habit] = (flagged[n.habit] ?? 0) + Math.round(n.save ?? 0)
        }
        if (shown.has(n.habit) || out.length >= max) continue
        shown.add(n.habit)
        out.push(n.text)
      }
      return out
    },
    hits: () => ({ ...hits }),
    flagged: () => ({ ...flagged }),
    reset() {
      hits = {}
      flagged = {}
      shown = new Set()
    },
  }
}

const NAMES: Record<Habit, string> = {
  longSession: 'long sessions',
  longPr: 'long-lived PRs',
  agentModel: 'agent model above the task',
  bigPaste: 'big pastes',
  bigImage: 'image-heavy prompts',
  idleGap: 'idle gaps over an hour',
  weeklyLimit: 'weekly limit pressure',
  reread: 'whole-file re-reads',
  fanOut: 'agent fan-out',
}

// Counts per habit across stored sessions, and older half vs newer half as the trend (4 sessions needed).
// "flagged" is the estimated token-equivalents the nudges pointed at, not spend that was saved.
export function coachReport(history: readonly CoachRow[], now: Tally, nowFlagged: Tally = {}, off: ReadonlySet<Habit> = new Set()): string {
  const n = history.length
  const sum = (rows: readonly CoachRow[], h: Habit) => rows.reduce((a, r) => a + (r.hits[h] ?? 0), 0)
  const old = history.slice(0, Math.floor(n / 2))
  const recent = history.slice(Math.floor(n / 2))
  const lines = [`coach: ${n} earlier session${n === 1 ? '' : 's'} recorded${n < 4 ? '; a trend needs 4' : ''}`]
  for (const h of HABITS) {
    if (off.has(h)) continue
    const total = sum(history, h)
    const flagged = history.reduce((a, r) => a + (r.flagged?.[h] ?? 0), 0) + (nowFlagged[h] ?? 0)
    let tr = ''
    if (n >= 4) {
      const a = sum(old, h) / old.length
      const b = sum(recent, h) / recent.length
      tr = b < a ? ' · trend better' : b > a ? ' · trend worse' : ' · trend flat'
      tr += ` (${a.toFixed(1)} → ${b.toFixed(1)} per session)`
    }
    lines.push(`${NAMES[h]}: ${now[h] ?? 0} now · ${total} in history${flagged ? ` · flagged ≈${k(flagged)}` : ''}${tr}`)
  }
  if (off.size) lines.push(`off: ${[...off].join(', ')}`)
  return lines.join('\n')
}

type Run = (argv: string[]) => Promise<{ exitCode: number; stdout: string }>

// The checked-out branch's commits not on the default branch: name, count and age of the oldest. Undefined on the default branch or outside git.
export async function branchInfo(run: Run, now: number): Promise<{ branch: string; commits: number; ageMs: number } | undefined> {
  const out = async (argv: string[]) => {
    const r = await run(['git', ...argv]).catch(() => undefined)
    return r && r.exitCode === 0 ? r.stdout.trim() : ''
  }
  const branch = await out(['rev-parse', '--abbrev-ref', 'HEAD'])
  if (!branch || branch === 'HEAD') return undefined
  const head = await out(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])
  let base = ''
  for (const c of [head, 'origin/main', 'origin/master', 'main', 'master']) {
    if (c && (await out(['rev-parse', '--verify', '--quiet', c]))) {
      base = c
      break
    }
  }
  if (!base || base === branch || base === `origin/${branch}`) return undefined
  const stamps = (await out(['log', '--format=%ct', `${base}..HEAD`])).split('\n').filter(Boolean).map(Number)
  if (!stamps.length) return undefined
  return { branch, commits: stamps.length, ageMs: now - Math.min(...stamps) * 1000 }
}
