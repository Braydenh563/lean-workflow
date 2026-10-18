import { PLAN_DEFAULTS, planFrom } from './plans'

// Tier from the weekly limit: pure rules, so the thresholds are tested without a session.
// `max` is the repo's configured tier; `pro` (one agent, no Opus) and `stop` (finish the step, push) follow the live limits.
export type Tier = 'max' | 'pro' | 'stop'
export const TIER_LIMITS = { proWeek: 70, stopWeek: 85, stopFive: 90 }
const RANK: Record<Tier, number> = { max: 0, pro: 1, stop: 2 }

export type TierInput = { base?: string; plan?: string; week?: number; fiveHour?: number; finishWeek?: number; finishFive?: number }
export type TierResult = { tier: Tier; reason: string }

// The tier in force: the configured one, raised (never lowered) by the live limits. Unknown limits change nothing.
export function tierFor(a: TierInput): TierResult {
  // The plan's defaults sit under the user's own settings: the tier option, then the finish-up lines.
  const plan = planFrom(a.plan)
  const d = plan ? PLAN_DEFAULTS[plan] : undefined
  const base: Tier = /^pro$/i.test(a.base ?? '') || (!/^max$/i.test(a.base ?? '') && d?.base === 'pro') ? 'pro' : 'max'
  let tier = base
  let reason = base === 'pro' ? (/^pro$/i.test(a.base ?? '') ? 'configured tier pro' : `plan ${plan}`) : 'under every limit'
  const raise = (to: Tier, why: string) => {
    if (RANK[to] > RANK[tier]) {
      tier = to
      reason = why
    }
  }
  // The user's own finish-up lines replace the defaults; pro starts no later than the finish line.
  // A plan without windows (api) has none to cross; the user's own line still applies.
  const windows = !plan || d?.stopWeek !== undefined
  const stopWeek = a.finishWeek ?? (windows ? d?.stopWeek ?? TIER_LIMITS.stopWeek : Infinity)
  const stopFive = a.finishFive ?? (windows ? d?.stopFive ?? TIER_LIMITS.stopFive : Infinity)
  const proWeek = Math.min(windows ? d?.proWeek ?? TIER_LIMITS.proWeek : Infinity, stopWeek)
  if (a.week !== undefined && a.week >= proWeek) raise('pro', `weekly limit ${a.week}% (pro from ${proWeek}%)`)
  if (a.week !== undefined && a.week >= stopWeek) raise('stop', `weekly limit ${a.week}% (stop from ${stopWeek}%)`)
  if (a.fiveHour !== undefined && a.fiveHour >= stopFive) raise('stop', `5-hour window ${a.fiveHour}% (stop from ${stopFive}%)`)
  return { tier, reason }
}

// What the model is told when the tier changes; undefined when nothing changed.
export function tierNote(from: Tier, to: TierResult): string | undefined {
  if (from === to.tier) return undefined
  if (to.tier === 'stop') return `Tier stop (${to.reason}): finish the current step, commit and push, then stop. An active work order is marked stopped.`
  if (to.tier === 'pro') return `Tier ${from === 'stop' ? 'back to ' : ''}pro (${to.reason}): one agent at a time, Sonnet and Haiku only (Opus is denied unless you name it), targeted tests, short sessions. Budget mode is on.`
  return `Tier back to max (${to.reason}).`
}

// "finish up at 60% weekly" or "once I get to 60% weekly usage, finish up": the line the user sets in words.
const FIVE = /\b(5[ -]?h(ours?)?|five[ -]?hours?)\b/i
const USAGE = /\b(usage|limit|quota|weekly|week)\b|\b5[ -]?h(ours?)?\b|\bfive[ -]?hours?\b/i
const FINISH = '(?:finish(?:\\s+up)?|wrap(?:\\s+it)?(?:\\s+up)?|stop|stand\\s+down|pack\\s+up)'
const A = new RegExp(`\\b${FINISH}\\b[^.\\n%]{0,50}?\\b(?:at|when|once|by|before|after)\\b[^.\\n%]{0,30}?(\\d{1,3})\\s*%`, 'i')
const B = new RegExp(`\\b(?:at|when|once|by|after)\\b[^.\\n%]{0,40}?(\\d{1,3})\\s*%[^.\\n]{0,60}?\\b${FINISH}\\b`, 'i')

export function finishLine(text: string): { kind: 'week' | 'five'; pct: number } | undefined {
  if (!USAGE.test(text)) return undefined
  const m = A.exec(text) ?? B.exec(text)
  const pct = m ? Number(m[1]) : NaN
  if (!(pct >= 1 && pct <= 100)) return undefined
  return { kind: FIVE.test(text) ? 'five' : 'week', pct }
}
