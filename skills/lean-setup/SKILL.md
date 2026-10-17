---
name: lean-setup
description: Set up the lean, self-improving workflow in the current repo: a short CLAUDE.md section with model rungs, tiers, usage levers and the Fable opt-in rule, plus an empty retro ledger. Use when the user says "lean setup", "set up the workflow here", or opens a repo without a "Lean workflow" section in CLAUDE.md.
---

# Lean setup (under 8 tool calls)

1. Read CLAUDE.md (create it if missing). If it already has a
   "## Lean workflow" section, stop and say so.
2. Find the repo's own fast checks (lint, typecheck, unit tests) from its
   config files and CI workflow; name them in step 3. Do not invent any.
3. Append this section to CLAUDE.md, filling the two bracketed values:

```markdown
## Lean workflow

Tier: `max` (set `pro` on the Pro plan). Fast checks: [the repo's commands].

- Cost is turns times context. Batch independent tool calls; grep, then
  read line ranges; start a fresh session at each milestone with the state
  in this file or a handover note; crop or avoid screenshots; no idle gaps
  over an hour in a long session.
- Rungs: Haiku (`scout`) for lookup and mechanical work with a runnable
  check; Sonnet high for implementation; Opus medium for design, ambiguous
  bugs and risky review, high only after a lower rung failed with evidence.
  Every agent call names its model.
- Fable is opt-in only: nothing starts it unless the user names it for a
  task, and only for that task.
- `max`: up to three agents at once, one Opus. `pro`: one agent, no Opus.
- One retry per new hypothesis; the same call three times is a stop.
- Risky or UI changes get an independent check: `reviewer`, `ux-auditor`,
  `blind-tester`. The builder does not grade its own work.
- Tests first; run the fast checks before every commit; never weaken a
  test to pass.
- Replace, do not layer: change the existing implementation and remove the
  old path unless persisted data or a public interface needs it.
- At session end run `retro`.
```

4. Create `.claude/retro-ledger.md` with the header line from the retro
   skill and one baseline row.
5. If the repo has no handover or status file, create `.claude/now.md`, at
   most 30 lines, with six headings: Goal, Current state (branch, what
   works, blockers), Active files, Changes made, Failed attempts (what not
   to repeat), Next steps (with the check that proves each). Sessions read
   it first and update it at each milestone, instead of re-exploring.
6. If `.claude/agents/` lacks them and the plugin's agents are not
   installed, copy `scout`, `reviewer`, `ux-auditor` and `blind-tester`
   from this plugin's `agents/` folder.
7. Commit as "Add lean workflow" and report three lines: what was added,
   the fast checks named, and this optional step for the user: create a
   weekly scheduled task in claude.ai, with this repo attached, prompted
   "Run the retro skill across .claude/retro-ledger.md and the week's
   commits; change at most one rule on repeated evidence; open a PR".
