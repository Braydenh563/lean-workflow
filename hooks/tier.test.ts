import { test, expect } from 'claude-code/testing'

import { PLAN_DEFAULTS, PLANS_VERIFIED, detectPlan, planFrom, planNote } from './plans'
import { finishLine, tierFor, tierNote } from './tier'

test('tier follows the weekly and 5-hour limits, and only ever rises from the configured tier', () => {
  expect(tierFor({}).tier).toBe('max')
  expect(tierFor({ week: 69 }).tier).toBe('max')
  expect(tierFor({ week: 70 })).toEqual({ tier: 'pro', reason: 'weekly limit 70% (pro from 70%)' })
  expect(tierFor({ week: 84 }).tier).toBe('pro')
  expect(tierFor({ week: 85 }).tier).toBe('stop')
  expect(tierFor({ week: 10, fiveHour: 90 }).tier).toBe('stop')
  expect(tierFor({ week: 10, fiveHour: 89 }).tier).toBe('max')
  expect(tierFor({ base: 'pro', week: 10 }).tier).toBe('pro')
  expect(tierFor({ base: 'PRO', week: 90 }).tier).toBe('stop')
  expect(tierFor({ base: 'bogus' }).tier).toBe('max')
})

test('tierNote speaks only on a change', () => {
  expect(tierNote('max', tierFor({ week: 20 }))).toBeUndefined()
  expect(tierNote('max', tierFor({ week: 71 }))).toContain('Opus is denied')
  expect(tierNote('pro', tierFor({ week: 86 }))).toContain('marked stopped')
  expect(tierNote('stop', tierFor({ week: 72 }))).toContain('back to pro')
  expect(tierNote('pro', tierFor({ week: 5 }))).toContain('back to max')
})

test('the user\'s finish-up line replaces the default stop line, and pro never starts after it', () => {
  expect(tierFor({ week: 60, finishWeek: 60 })).toEqual({ tier: 'stop', reason: 'weekly limit 60% (stop from 60%)' })
  expect(tierFor({ week: 59, finishWeek: 60 }).tier).toBe('max')
  expect(tierFor({ week: 71, finishWeek: 95 }).tier).toBe('pro')
  expect(tierFor({ week: 90, finishWeek: 95 }).tier).toBe('pro')
  expect(tierFor({ week: 10, fiveHour: 50, finishFive: 50 }).tier).toBe('stop')
})

test('finishLine reads the line the user sets in words, in either order', () => {
  expect(finishLine('once I get to 60% weekly usage I want you to finish up')).toEqual({ kind: 'week', pct: 60 })
  expect(finishLine('finish up at 75% of my weekly limit')).toEqual({ kind: 'week', pct: 75 })
  expect(finishLine('wrap up when the 5-hour window hits 80%')).toEqual({ kind: 'five', pct: 80 })
  expect(finishLine('stop at 50% usage')).toEqual({ kind: 'week', pct: 50 })
  expect(finishLine('finish at 100% coverage')).toBeUndefined()
  expect(finishLine('the weekly limit is on my mind')).toBeUndefined()
  expect(finishLine('finish up at 250% weekly')).toBeUndefined()
})

test('the plan sets the starting tier and the lines; the user\'s own settings override it', () => {
  expect(tierFor({ plan: 'pro' })).toEqual({ tier: 'pro', reason: 'plan pro' })
  expect(tierFor({ plan: 'free', week: 79 }).tier).toBe('pro')
  expect(tierFor({ plan: 'free', week: 80 }).tier).toBe('stop')
  expect(tierFor({ plan: 'max5x', week: 69 }).tier).toBe('max')
  expect(tierFor({ plan: 'max5x', week: 85 }).tier).toBe('stop')
  expect(tierFor({ plan: 'max20x', week: 74 }).tier).toBe('max')
  expect(tierFor({ plan: 'max20x', week: 75 }).tier).toBe('pro')
  expect(tierFor({ plan: 'max20x', week: 89 }).tier).toBe('pro')
  expect(tierFor({ plan: 'max20x', week: 90 }).tier).toBe('stop')
  expect(tierFor({ plan: 'max20x', fiveHour: 94 }).tier).toBe('max')
  expect(tierFor({ plan: 'max20x', fiveHour: 95 }).tier).toBe('stop')
  expect(tierFor({ plan: 'pro', base: 'max', week: 10 }).tier).toBe('max')
  expect(tierFor({ plan: 'max20x', finishWeek: 60, week: 60 }).tier).toBe('stop')
  expect(tierFor({ plan: 'bogus', week: 70 }).tier).toBe('pro')
})

test('a plan without windows (api) is never raised by the limits, but a user line still stops it', () => {
  expect(tierFor({ plan: 'api', week: 99, fiveHour: 99 }).tier).toBe('max')
  expect(tierFor({ plan: 'api', week: 60, finishWeek: 60 }).tier).toBe('stop')
})

test('planFrom reads the plan by name, with spaces, dashes and the bare "max"', () => {
  expect(planFrom('Max 20x')).toBe('max20x')
  expect(planFrom('max-5x')).toBe('max5x')
  expect(planFrom('MAX')).toBe('max5x')
  expect(planFrom('Enterprise')).toBe('enterprise')
  expect(planFrom('plus')).toBeUndefined()
  expect(planFrom(undefined)).toBeUndefined()
})

test('the plan table is consistent and the note names its figures', () => {
  for (const d of Object.values(PLAN_DEFAULTS)) {
    if (d.stopWeek !== undefined) expect(d.proWeek!).toBeLessThan(d.stopWeek)
    if (d.base === 'pro') expect(d.agents).toBe(1)
  }
  expect(planNote(undefined)).toBeUndefined()
  expect(planNote('pro')).toContain('one agent at a time')
  expect(planNote('max20x')).toContain('up to 3 agents')
  expect(planNote('max20x')).toContain('finish up at 90% weekly or 95%')
  expect(planNote('api')).toContain('billed per token')
  expect(planNote('pro', Date.parse(PLANS_VERIFIED) + 10 * 86_400_000)).not.toContain('last checked')
  expect(planNote('pro', Date.parse(PLANS_VERIFIED) + 120 * 86_400_000)).toContain('120 days ago')
})

test('"15th" is not a 5-hour window', () => {
  expect(finishLine('stop at 90% of my weekly usage on the 15th')).toEqual({ kind: 'week', pct: 90 })
  expect(finishLine('stop at 90% of my 5 hour window')).toEqual({ kind: 'five', pct: 90 })
})

test('a user finish line below the budget line is the budget line too', () => {
  expect(tierFor({ week: 65, finishWeek: 60 }).reason).toContain('stop from 60%')
})

test('detectPlan reads the plan from auth status JSON and leaves the unknown to the option', () => {
  const d = (o: object) => detectPlan(JSON.stringify(o))
  expect(d({ subscriptionType: 'pro' })).toBe('pro')
  expect(d({ subscriptionType: 'max', rateLimitTier: 'default_claude_max_20x' })).toBe('max20x')
  expect(d({ subscriptionType: 'max' })).toBe('max5x')
  expect(d({ subscriptionType: 'team' })).toBe('team')
  expect(d({ subscriptionType: 'enterprise' })).toBe('enterprise')
  expect(d({ authMethod: 'api_key', apiProvider: 'firstParty' })).toBe('api')
  expect(d({ apiProvider: 'bedrock' })).toBe('api')
  expect(d({ loggedIn: true, authMethod: 'oauth_token', apiProvider: 'firstParty' })).toBeUndefined()
  expect(detectPlan('not json')).toBeUndefined()
  expect(detectPlan('null')).toBeUndefined()
})

test('detectPlan reads claude_pro style values', () => {
  expect(detectPlan(JSON.stringify({ subscriptionType: 'claude_pro' }))).toBe('pro')
})
