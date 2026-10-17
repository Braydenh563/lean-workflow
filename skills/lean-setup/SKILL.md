---
name: lean-setup
description: Set up the lean, self-improving workflow in the current repo, once (it stops if the repo already has it): a short CLAUDE.md section with model rungs, tiers, usage levers and the Fable opt-in rule, an empty retro ledger, a now.md with inbox and decisions, and scripts/codemap.py, orient.sh and gate.sh. Use when the user says "lean setup", "set up the workflow here", or opens a repo without a "Lean workflow" section in CLAUDE.md.
---

# Lean setup (under 12 tool calls)

1. Read CLAUDE.md (create it if missing). Stop and say so, changing
   nothing, if any of these holds: CLAUDE.md has a "Lean workflow"
   heading, names the `lean-workflow` plugin, or already states model
   rungs and the Fable opt-in rule; or `.claude/retro-ledger.md` or
   `.claude/skills/retro/ledger.md` exists. The repo already has the
   workflow, perhaps under another heading; offer to compare the two
   instead of adding a second copy. If the user said "lean upgrade", or the
   section exists but `scripts/gate.sh` or `scripts/codemap.py` is missing,
   run only steps 2, 4b, 5 and 6 below, skip files that exist, and add the
   missing rules from step 3 to the existing section without a second copy.
2. Find the repo's own fast checks (lint, typecheck, unit tests) from its
   config files and CI workflow; name them in step 3. Do not invent any.
3. Append this section to CLAUDE.md, filling the two bracketed values:

```markdown
## Lean workflow

Tier: `max` (set `pro` on the Pro plan). Fast checks: [the repo's commands].

- Cost is turns times context. Batch independent tool calls; grep, then
  read line ranges (`wc -c` before a read; never `cat` several files in one
  command: a 20k-character output rides in every later turn); start a fresh session at each milestone with the state
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
- Tests first; never weaken a test to pass. Run `scripts/gate.sh` before
  every push (`--staged` before a commit, `--changed` for the routine run,
  `--full` once at the end); paste its three lines in the report.
- Start each session with `scripts/orient.sh`. Find code by grepping
  `docs/CODEMAP.md` (regenerate with `python scripts/codemap.py`), then read
  line ranges. Scouts do the same.
- `.claude/now.md` keeps an Inbox and a Decisions list. A mid-task request is
  recorded word for word in the Inbox, then triaged at the next step
  boundary in one pass: fixed now, placed in a plan, or dropped. Under 20
  items. A decision is written once, with its reason, and not remade.
- Agents keep a remaining-work file in `.claude/remaining/<agent>.md` (done,
  next, blocked) and commit at least every 20 minutes, so a usage limit
  never loses work.
- Tests take a fixed "now" (an injected clock or frozen time), never the
  real clock. A date or minute read at test time is a bug waiting for its day.
- A claim about how a UI looks or behaves needs a measurement from the
  running app (computed style, bounding box, a pixel); say what you could
  not verify.
- Replace, do not layer: change the existing implementation and remove the
  old path unless persisted data or a public interface needs it.
- At session end run `retro`.
```

4. If missing, create `.claude/retro-ledger.md` with the header line from the retro
   skill and one baseline row.
4b. Install the scripts, skipping any that exist, from this skill's
   `templates/` folder (the plugin's `skills/lean-setup/templates/`):
   - `codemap.py` to `scripts/codemap.py`. Run it once; it writes
     `docs/CODEMAP.md` (definitions as `name | file:line` for Python,
     JS/TS and Go, plus test files). Edit `SKIP_DIRS` if the repo vendors
     code elsewhere. `--check` exits 1 when the map is stale.
   - `orient.sh` to `scripts/orient.sh` (under 40 lines: now.md head, open
     inbox and decision counts, uncommitted paths, remaining-work files,
     code map freshness, last ledger line). Edit only the paths it reads.
   - `gate.sh` to `scripts/gate.sh`, then fill its three marked blocks from
     the repo's CI config (the same commands CI runs: lint, typecheck,
     format in `fast_checks`; the full suite in `all_tests`; the same runner
     taking file arguments in `some_tests`). Do not invent a command CI does
     not run. Run `scripts/gate.sh` and `scripts/gate.sh --changed` once;
     fix the script, not the repo, if they fail for a reason of their own.
     Its last step runs `codemap.py --check`, which is the freshness check.
   `chmod +x scripts/*.sh`. If the repo has a pre-commit config or a CI job
   list, offer (do not add) `scripts/gate.sh --staged` as a hook.
5. If the repo has no handover or status file, create `.claude/now.md`, at
   most 60 lines, with these headings: Goal, Current state (branch, what
   works, blockers), Active files, Changes made, Failed attempts (what not
   to repeat), Next steps (with the check that proves each), Decisions
   (one line each: the choice, the reason, the date), Inbox (numbered,
   the user's mid-task requests word for word, each with a one-line
   triage once handled; under 20). Sessions read it first and update it at
   each milestone, instead of re-exploring. The plugin warns when it or
   CLAUDE.md passes its size limit.
5b. Add to `.gitignore` (skipping lines already there):
   `.claude/work-order.count`, `.claude/work-order.last` and `.claude/inputs/`
   (run state and the text copies of document inputs).
6. If `.claude/agents/` lacks them and the plugin's agents are not
   installed, copy `scout`, `reviewer`, `ux-auditor` and `blind-tester`
   from this plugin's `agents/` folder.
7. Commit as "Add lean workflow" and report three lines: what was added,
   the checks `gate.sh` runs, and this optional step for the user: create a
   weekly scheduled task in claude.ai, with this repo attached, prompted
   "Run the retro skill across .claude/retro-ledger.md and the week's
   commits; change at most one rule on repeated evidence; open a PR".
