# lean-workflow

A token-efficient, self-improving Claude Code workflow you can install in any repo.

## Install (once per machine)

    /plugin install lean-workflow --marketplace Braydenh563/Tessellate

Then, in each repo, Claude runs `lean-setup` by itself the first time (the
plugin tells it to when CLAUDE.md has no "Lean workflow" section).

## What runs by itself

- Autopilot rules in the system prompt (static, so they stay cached): run
  `lean-setup` in a new repo, route agents by rungs (Haiku, Sonnet, Opus),
  never start Fable unless you name it, and at the end of a task, or when
  context passes 150k, update the handover, run `retro` and tell you to
  start a fresh session.
- Guards: denies whole-file reads of huge files (code maps, histories,
  lockfiles; configurable as `grepOnly`), the same tool call three times in
  a row, an agent with no model, and a Fable agent you did not ask for.
- Warnings: context per turn in the status line, a cold cache after 55 idle
  minutes, images, and tool outputs over 20k characters.
- Memory across sessions: each session's numbers are kept, so `/spend`
  compares against your median and `/prune` names plugins you never use.

## Commands

- `/spend`: this session's cost split, by model, against your median, and the best next step.
- `/dash`: a pane with running agents (model, time, calls, tokens), tasks, cost by model.
- `/prune`: plugins never used in the sessions recorded (after five).

## What it adds to a repo (`lean-setup`)

- A short "Lean workflow" section in CLAUDE.md: tier, fast checks, rungs,
  usage levers, Fable opt-in, retry limit, independent review, replace not layer.
- `.claude/retro-ledger.md` and `.claude/now.md` (goal, state, active files,
  changes, failed attempts, next steps).
- Agents `scout`, `reviewer`, `ux-auditor`, `blind-tester`.

## Only you can do

- Disable plugins `/prune` names, in your Claude settings.
- Optional: a weekly scheduled task with the repo attached (the setup
  report gives the prompt).
