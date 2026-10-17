# lean-workflow

A token-efficient, self-improving Claude Code workflow you can install in any repo.

## Install (once per machine)

    /plugin install lean-workflow --marketplace Braydenh563/lean-workflow

Then, in each repo, Claude runs `lean-setup` by itself the first time (the
plugin tells it to when CLAUDE.md has no "Lean workflow" section).

## What runs by itself

- Autopilot rules in the system prompt (static, so they stay cached): run
  `lean-setup` in a new repo, route agents by rungs (Haiku, Sonnet, Opus),
  never start Fable unless you name it, run `scripts/orient.sh` first and
  `scripts/gate.sh` before every push, grep the code map before opening
  files, and at the end of a task, or when context passes 150k, update the
  handover, run `retro` and tell you to start a fresh session.
- Guards: denies whole-file reads of huge files (code maps, histories,
  lockfiles; configurable as `grepOnly`), the same tool call three times in
  a row, an agent with no model, and a Fable agent you did not ask for.
- Warnings: context per turn in the status line, a cold cache after 55 idle
  minutes, images, tool outputs over 20k characters, and `CLAUDE.md` over
  200 lines or `.claude/now.md` over 60 lines or 20 inbox items (read whole
  or written; limits are the `claudeMdMaxLines` and `nowMaxLines` options).
- Memory across sessions: each session's numbers are kept, so `/spend`
  compares against your median and `/prune` names plugins you never use.

## Commands

- `/spend`: this session's cost split, by model, against your median, and the best next step.
- `/dash`: a pane (or, where none is seated, a styled text dashboard with context bar, agents, tasks, cost by model and split, next step).
- `/prune`: plugins never used in the sessions recorded (after five).

## What it adds to a repo (`lean-setup`)

- A short "Lean workflow" section in CLAUDE.md: tier, fast checks, rungs,
  usage levers, Fable opt-in, retry limit, independent review, replace not layer.
- `.claude/retro-ledger.md` and `.claude/now.md` (goal, state, active files,
  changes, failed attempts, next steps, plus two lists):
  - **Decisions**: one line each (choice, reason, date), written once, not remade.
  - **Inbox**: mid-task requests recorded word for word, triaged in one pass
    at the next step boundary (fix now, place in a plan, or drop). Under 20.
- `scripts/codemap.py`: writes `docs/CODEMAP.md` (`name | file:line` for
  Python, JS/TS and Go definitions, plus test files with counts). `--check`
  exits 1 when the map is stale; `gate.sh` runs it. Scouts grep the map
  first, then read line ranges.
- `scripts/orient.sh` (under 40 lines): now.md head, open inbox and decision
  counts, uncommitted paths, remaining-work files, map freshness, last
  ledger line.
- `scripts/gate.sh`, filled from the repo's CI config: the fast checks, or
  `--changed` (plus the tests that name changed files), `--staged` (the same
  checks against the index, so a commit that splits a pair is caught),
  `--full` (the whole suite, once at the end). Run before every push.
- Rules in the CLAUDE.md section: agents keep a remaining-work file
  (`.claude/remaining/<agent>.md`) and commit at least every 20 minutes;
  tests take a fixed "now" instead of the clock; a UI claim needs a
  measurement from the running app.
- Agents `scout`, `reviewer`, `ux-auditor`, `blind-tester`.

An existing 1.0 repo gets the new pieces with "lean upgrade".

## Only you can do

- Disable plugins `/prune` names, in your Claude settings.
- Optional: a weekly scheduled task with the repo attached (the setup
  report gives the prompt).

## Licence

MIT. Born in [Tessellate](https://github.com/Braydenh563/Tessellate), where it is used daily.
