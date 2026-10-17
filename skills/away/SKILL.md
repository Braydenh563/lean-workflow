---
name: away
description: Unattended mode. Use when the user says they are going to sleep, to work, out, away, AFK, or "work while I'm gone". Runs the queue autonomously with the cheapest safe workflow, stops before the limits, and leaves a summary to read on a phone.
---

# Away mode

The user will not answer questions. Never stop to ask; decide by the repo's
rules, record the choice, and carry on. Stop only on the conditions below.

## Before the user leaves (same turn, under 5 tool calls)

1. Commit and push anything open. Write the handover "Now" line (or
   `.claude/now.md`): goal, branch, open PRs, next item.
2. Build the queue in order: the repo's inbox, unfinished agent work, then
   the plans (Tessellate: CLAUDE.md standing order 1). Write it into the
   handover as a numbered list.
3. Tell the user in at most 4 lines: the queue (top 5), the stop rules, and
   one optional line to paste for a hard stop:
   `/goal queue in the handover is done, or the weekly limit passes 85%, or 8 hours`.
   Then start.

## The work loop (per item)

- Scout with a Haiku agent; implement with Sonnet (yourself or one agent);
  Opus only for a design call a lower rung failed. Never Fable.
- Tests first, the repo's gate before every push, one commit per step.
- Risky or UI change: `reviewer` (and `blind-tester` for UI) before it counts
  as done.
- Open a PR every 3 to 5 finished items, never one PR for the whole night;
  fix its CI before moving on. Do not merge to the default branch: the user
  merges.
- After each item: one line in the handover (done, commit, PR, next). This
  is what survives a compaction or a new session.
- Wait on CI by its PR subscription or by doing the next item, never by an
  idle loop: an idle gap over an hour rewrites the whole context.

## Stop rules (check `/spend` figures each item)

- Weekly limit 70% or more: pro habits (one agent, no Opus, targeted tests).
- Weekly limit 85% or more, or the 5-hour window 90% or more: finish the
  step, push, stop.
- An item failed twice with new evidence each time: mark it blocked in the
  handover with the evidence, move to the next.
- Nothing left in the queue: run `upgrade-scan` if it is due, else stop.

## On stopping

Write the morning summary at the top of the handover and as the final
message, 8 lines at most: done (with PRs), blocked (why, what is needed from
the user), usage used, next item. Then run `retro`.
