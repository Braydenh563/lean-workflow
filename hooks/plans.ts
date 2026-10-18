// Plans: the Claude plan sets the defaults the tier, the agent cap, Opus and the check-in cadence start from.
// Pure rules. The thresholds are this plugin's own defaults: Anthropic publishes no per-plan numbers, only that
// Pro and Max have a five-hour session limit and a weekly limit shared by Claude and Claude Code (see README).
export type Plan = 'free' | 'pro' | 'max5x' | 'max20x' | 'team' | 'enterprise' | 'api'
// When the table was last checked against the pages in the README; upgrade-scan moves it in its PR.
export const PLANS_VERIFIED = '2026-10-18'
const STALE_DAYS = 90

export const PLANS: Plan[] = ['free', 'pro', 'max5x', 'max20x', 'team', 'enterprise', 'api']

export type PlanDefaults = {
  base: 'max' | 'pro' // starting tier
  agents: number // agents at once at tier max (pro is always one)
  opus: boolean // Opus agents allowed at tier max
  checkinMinutes: number // longest gap between check-in loops; 0 = none, wait on events
  proWeek?: number // weekly % where tier pro starts (undefined: the plan has no weekly limit)
  stopWeek?: number
  stopFive?: number
}

export const PLAN_DEFAULTS: Record<Plan, PlanDefaults> = {
  free: { base: 'pro', agents: 1, opus: false, checkinMinutes: 0, proWeek: 50, stopWeek: 80, stopFive: 80 },
  pro: { base: 'pro', agents: 1, opus: false, checkinMinutes: 0, proWeek: 70, stopWeek: 85, stopFive: 90 },
  max5x: { base: 'max', agents: 2, opus: true, checkinMinutes: 50, proWeek: 70, stopWeek: 85, stopFive: 90 },
  max20x: { base: 'max', agents: 3, opus: true, checkinMinutes: 30, proWeek: 75, stopWeek: 90, stopFive: 95 },
  team: { base: 'max', agents: 2, opus: true, checkinMinutes: 50, proWeek: 70, stopWeek: 85, stopFive: 90 },
  enterprise: { base: 'max', agents: 2, opus: true, checkinMinutes: 50, proWeek: 70, stopWeek: 85, stopFive: 90 },
  api: { base: 'max', agents: 3, opus: true, checkinMinutes: 0 },
}

// "Max 5x", "max-20x", "Pro" -> a plan; anything else is undefined.
export function planFrom(text: string | undefined): Plan | undefined {
  const t = (text ?? '').toLowerCase().replace(/[\s_-]+/g, '')
  const hit = t === 'max' ? 'max5x' : t
  return PLANS.find(p => p === hit)
}

// What the model is told about its plan, once, in the autopilot.
export function planNote(plan: Plan | undefined, now?: number): string | undefined {
  if (!plan) return undefined
  const d = PLAN_DEFAULTS[plan]
  const limits = d.stopWeek === undefined ? 'no five-hour or weekly window (billed per token)' : `budget mode from ${d.proWeek}% weekly, finish up at ${d.stopWeek}% weekly or ${d.stopFive}% of the 5-hour window`
  const agents = d.base === 'pro' ? 'one agent at a time, no Opus agents unless named' : `up to ${d.agents} agents at once, ${d.opus ? 'one Opus' : 'no Opus'}`
  const checkin = d.checkinMinutes ? `check-in loops no more than every ${d.checkinMinutes} minutes` : 'no check-in loops; wait on PR events or do the next item'
  const age = now === undefined ? 0 : Math.floor((now - Date.parse(PLANS_VERIFIED)) / 86_400_000)
  const stale = age > STALE_DAYS ? ` The plan table was last checked ${PLANS_VERIFIED} (${age} days ago): plan limits change, so trust the live bars over these lines and tell the user the table needs a check (upgrade-scan).` : ''
  return `Plan ${plan}: ${agents}; ${checkin}; ${limits}.${stale}`
}
