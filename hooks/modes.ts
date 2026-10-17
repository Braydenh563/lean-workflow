// Modes: the skills that change how a session works (focus, triage, review, budget, release).
// Pure rules: which mode a prompt or skill asks for, and what triage forbids.
export type Mode = 'focus' | 'triage' | 'review' | 'budget' | 'release'
export const MODES: Mode[] = ['focus', 'triage', 'review', 'budget', 'release']

const SKILL = /^(?:lean-workflow:)?(focus|triage|review|budget|release)$/

export function modeFromSkill(skill: string): Mode | undefined {
  return SKILL.exec(skill)?.[1] as Mode | undefined
}

const TRIGGERS: [Mode, RegExp][] = [
  ['triage', /^\s*triage\b|\btriage (mode|the|these|my|this|all|every|it|them)\b|\bgo through (the|my) inbox\b/i],
  ['budget', /\bbudget mode\b|\bsave (my )?(tokens|usage|limit)\b|\brunning (low|out) (on|of) (usage|tokens|limit)/i],
  ['release', /\brelease mode\b|\b(cut|prepare|make|do|ship) (a|the|this) release\b|\brelease v?\d+\.\d+/i],
  ['review', /\breview mode\b|\b(review|code review) (this|the|my) (pr|diff|branch|changes?|commit|code)\b/i],
  ['focus', /\bfocus mode\b|\bfocus (only )?on (this|that|one thing)\b|\bstay focused\b/i],
]
const EXIT = /\b(exit|leave|end|stop|clear) (the |this )?(\w+ )?mode\b|\bback to normal\b|\bdone triag/i

// A prompt that asks for a mode, or leaves one.
export function modeFromPrompt(text: string): { mode?: Mode; exit?: boolean } {
  if (EXIT.test(text)) return { exit: true }
  const hit = TRIGGERS.find(([, re]) => re.test(text))
  return hit ? { mode: hit[0] } : {}
}

// Triage writes only to the inbox, so an edit anywhere else is refused.
const INBOX_FILES = /(^|\/)(INBOX\.md|\.claude\/now\.md)$/
// Commands that build, test, install or publish. Matched at the start of a command or after && ; | (best effort, not a sandbox).
const BUILD = /(^|[;&|]\s*|\bxargs\s+)(npm (run|test|ci|install|i|publish)|npx|pnpm|yarn|bun (run|test|install|build)|make|cargo (build|test|run|install)|go (build|test|run|install)|pytest|python3? -m (pytest|pip|build)|pip3? install|tsc|gradle|\.\/gradlew|mvn|docker (build|run|compose)|dotnet (build|test|run)|(bash |\.\/)?scripts\/gate\.sh)/

// Why a call is refused in triage mode, or undefined when it is allowed.
export function triageDeny(call: { tool: string; file_path?: string; command?: string; model?: string }): string | undefined {
  if (['Edit', 'Write', 'NotebookEdit', 'MultiEdit'].includes(call.tool) && !INBOX_FILES.test(call.file_path ?? '')) {
    return `triage mode is inbox-only: ${call.file_path ?? 'that file'} is not an inbox file. Write the item to the inbox (.claude/now.md or INBOX.md) and leave the fix for after triage.`
  }
  if (call.tool === 'Bash' && BUILD.test(call.command ?? '')) {
    return 'triage mode runs no builds, tests or installs. Record the item in the inbox; say "exit triage" to build.'
  }
  if (call.tool === 'Agent' && call.model && !/haiku/i.test(call.model)) {
    return 'triage mode uses Haiku agents only (to describe screenshots or locate files). Name model haiku, or say "exit triage".'
  }
  return undefined
}
