---
name: work
description: Preset work orders that run unattended until done. Use for /work ship [PR], /work continue, /work stop, or when the user says "ship it", "drive the PR green and merge", "continue development", "keep going while I'm away". Writes .claude/work-order.md, which the plugin's Stop hook reads to keep the run going.
---

# Work orders

Two presets. The user will not answer questions during the run: decide by the
repo's rules (CLAUDE.md, its plans' "Decisions made"), record the choice in
the order file, and carry on. Never use Fable unless the user named it.

## Start (one turn, under 5 tool calls)

1. Commit and push anything open. `rm -f .claude/work-order.count`.
2. Write `.claude/work-order.md` (gitignored or committed, the repo's call):

   ```
   mode: ship            # or continue
   status: active        # active | done | stopped (<why>) | blocked (<why>)
   pr: 190               # ship only
   max-continues: 40     # the Stop hook's cap on automatic continues
   started: 2026-10-17 22:10

   - [ ] first item
   - [ ] second item
   ```
3. Tell the user in at most 3 lines: mode, the first items, how to stop
   (`/work stop`, or set `status: stopped` in the file). Then start.

The plugin's Stop hook refuses to end the turn while `status: active` and
hands back the next unticked item. Tick each item (`- [x]`) as it lands and
add new ones as you find them; `/progress` shows the bars.

## ship: drive one PR to merged

Checklist, in order, each item re-checked on the current head:

- [ ] Merge the base branch in; resolve conflicts (regenerate lockfiles with
  the repo's tooling; never rewrite someone else's history).
- [ ] CI green: reproduce each failure locally, fix the root cause, run the
  gate, push. "Flake" is not a root cause; one re-run at most.
- [ ] CodeQL and other code-scanning alerts on the PR: fix, push, resolve the
  thread.
- [ ] Review threads: fix small asks, answer the rest, resolve what you
  fixed.
- [ ] Bug and clash pass: a `reviewer` agent on the whole PR diff (bugs,
  regressions, security, data safety); a `ux-auditor` too if UI changed.
  Fix what it confirms.
- [ ] Merge, once CI is green on the head, no conflict, no open blocking
  thread and the repo's approval check (if any) passes. Use the repo's merge
  style. If a human approval is required and missing, set
  `status: blocked (waiting on approval)` and stop: that is not yours to
  supply.

Then `status: done`, delete the branch only if the repo does so, summary.
Wait on CI through the PR subscription or the next item, never a sleep loop.

## continue: keep developing

Queue: the repo's inbox, unfinished agent work, then its plans in order
(Tessellate: CLAUDE.md standing order 1). Put the top 5 to 10 into the
checklist. Per item: scout (Haiku), implement (Sonnet), tests first, gate
before push, one commit per step, `reviewer` on risky changes. A PR every 3
to 5 items; fix its CI before moving on; do not merge unless the user's order
said so.

After every 3 items, or when the queue is empty, run the next scan in this
rotation and add what it confirms to the checklist (the scan agent reports;
you fix):

1. Bugs: `reviewer` on the last day's diff; failing or skipped tests.
2. Security: the security reviewer (or `reviewer` with a security brief) on
   changed endpoints, input handling, secrets, auth.
3. Architecture: duplicated logic, layers calling the wrong way, dead code,
   files over 800 lines.
4. UI and UX: `ux-auditor` in the running app: text overflow and clipping
   (`scrollWidth > clientWidth`), contrast, focus order and visible focus,
   target size, keyboard traps, labels, reflow at 320px (WCAG 2.2 AA).
5. Learnability: `blind-tester` with only a user goal: first-use friction,
   unclear labels, missing help, inconsistent patterns.

Claims about UI need a number from the running app.

## Stop rules (check `/spend` or usage after each item)

- Weekly limit 70%+: one agent, no Opus, targeted tests only.
- Weekly 85%+ or 5-hour window 90%+: finish the step, push,
  `status: stopped (usage)`.
- An item failed twice with new evidence: mark it `[!]` with the evidence,
  move on. Three blocked items in a row: `status: blocked (<why>)`.
- ship done, or continue with nothing left after a full scan rotation:
  `status: done`.

## On stopping

Summary at the top of the handover and as the final message, 8 lines at
most: done (PRs, merges), blocked (what the user must do), usage used, next.
Then `retro` if it was a milestone.

`/work stop`: set `status: stopped (user)`, push, summary.
