// Modes: the skills that change how a session works (focus, triage, review, budget, release).
// Pure rules: which mode a prompt or skill asks for, and what triage forbids.
export type Mode = 'focus' | 'triage' | 'review' | 'budget' | 'release'
export const MODES: Mode[] = ['focus', 'triage', 'review', 'budget', 'release']

const SKILL = /^(?:lean-workflow:)?(focus|triage|review|budget|release)$/

export function modeFromSkill(skill: string): Mode | undefined {
  return SKILL.exec(skill)?.[1] as Mode | undefined
}

const TRIGGERS: [Mode, RegExp][] = [
  ['triage', /^\s*(?:please\s+|let's\s+|can you\s+)?triage\b|\btriage (mode|the|these|my|this|all|every|it|them)\b|\bgo through (the|my) inbox\b/i],
  ['budget', /\bbudget mode\b|\bsave (my )?(tokens|usage|limit)\b|\brunning (low|out) (on|of) (usage|tokens|limit)/i],
  ['release', /\b(?:(?:cut|prepare)\s+(?:(?:a|the|this)\s+)?|(?:make|do|ship)\s+(?:a|the|this)\s+)release\b(?!\s+(?:notes?|scripts?|candidates?|process|pipeline|workflow|branch|build|checklist|tag|artifacts?))|\brelease mode\b|\brelease v?\d+\.\d+/i],
  ['review', /\breview mode\b|\b(review|code review) (this|the|my) (pr|pull requests?|merge request|diff|branch|changes?|commit(?! messages?)|code)\b/i],
  ['focus', /\bfocus mode\b|\bfocus (only )?on (this|that|one thing)\b|\bstay focused\b/i],
]
// A mention of a mode that is not a request for it: "not triage mode", "triage mode off", "what does focus mode do".
const MENTION = /\b(?:not|never|without)\b[^.?!]{0,20}\bmode\b|n't\b[^.?!]{0,20}\bmode\b|\bmode (?:off|skill|file|is broken)\b|\b(?:what|how|why)\b[^.?!]{0,25}\bmode\b/i
// "exit triage", "leave focus mode", "stop the budget", ended by the clause; never after "don't"/"not". "review" and "release" need the word "mode": "stop the release" is an order.
const EXIT = new RegExp(
  `(?<!n't\\s)(?<!not\\s)(?<!never\\s)\\b(?:exit|leave|end|stop|clear)\\s+(?:the\\s+|this\\s+)?(?:(?:focus|triage|budget)(?:\\s+mode)?|(?:review|release)\\s+mode|mode)\\b(?=\\s*(?:please|now)?\\s*[.!?,]?\\s*$)|\\bback to normal\\b|\\bdone triag`,
  'i',
)

// A prompt that asks for a mode, or leaves one.
export function modeFromPrompt(text: string): { mode?: Mode; exit?: boolean } {
  if (EXIT.test(text)) return { exit: true }
  if (MENTION.test(text)) return {}
  const hit = TRIGGERS.find(([, re]) => re.test(text))
  return hit ? { mode: hit[0] } : {}
}

// Triage writes only to the inbox, so an edit anywhere else is refused.
const INBOX_FILES = /(^|\/)(INBOX\.md|\.claude\/now\.md)$/
// Commands that build, test, install or publish. Matched at the start of a command or after && ; | (best effort, not a sandbox).
const BUILD = new RegExp(
  '(^|[;&|(]\\s*|\\$\\(\\s*|\\bxargs\\s+)' +
    '(?:(?:sudo|time|nohup|env|command|exec)\\s+|\\w+=\\S*\\s+)*' +
    '(?:[\\w.~$/-]*\\/)?' +
    '(?:npm (?:run|test|ci|install|i|publish)|npx|pnpm|yarn|bun (?:run|test|install|build)|make|cargo (?:build|test|run|install)|go (?:build|test|run|install)|pytest|python[0-9.]* -m (?:pytest|pip|build)|pip[0-9.]* install|uv (?:run|pip|sync)|poetry install|bundle install|rake|composer install|deno test|node --test|tsc|gradle|gradlew|mvn|docker (?:build|run|compose (?:up|build|run))|dotnet (?:build|test|run)|(?:bash |sh )?(?:\\.\\/)?scripts\\/gate\\.sh)' +
    '(?=\\s|$|[;&|)])(?![^;&|\\n]*\\s--(?:version|help)(?:\\s|$))',
)

// Quoted text is not a command position: "fix make; go build" in a commit message builds nothing.
const unquoted = (c: string) => c.replace(/"[^"]*"|'[^']*'/g, '""')

// Why a call is refused in triage mode, or undefined when it is allowed.
export function triageDeny(call: { tool: string; file_path?: string; command?: string; model?: string }): string | undefined {
  if (['Edit', 'Write', 'NotebookEdit', 'MultiEdit'].includes(call.tool) && !INBOX_FILES.test(call.file_path ?? '')) {
    return `triage mode is inbox-only: ${call.file_path ?? 'that file'} is not an inbox file. Write the item to the inbox (.claude/now.md or INBOX.md) and leave the fix for after triage.`
  }
  if (call.tool === 'Bash' && BUILD.test(unquoted(call.command ?? ''))) {
    return 'triage mode runs no builds, tests or installs. Record the item in the inbox; say "exit triage" to build.'
  }
  if (call.tool === 'Agent' && call.model && !/haiku/i.test(call.model)) {
    return 'triage mode uses Haiku agents only (to describe screenshots or locate files). Name model haiku, or say "exit triage".'
  }
  return undefined
}
