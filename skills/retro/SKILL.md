---
name: retro
description: End-of-session workflow retrospective for any repo. Measures where this session's usage went, records one ledger line, and changes at most one workflow rule on evidence. Use at session end, before starting a fresh session, or when the user says "retro".
---

# Retro (one pass, under 10 tool calls)

1. Measure: from the project root, run `python <this skill's base directory>/usage_report.py`.
   Note turns, mean context per turn, cold turns, cost share of reads,
   writes and output, subagent share.
2. Find the top waste signal, with its evidence:
   - Context per turn far above the ledger median: start fresh sooner,
     read line ranges, fewer images and big tool outputs.
   - Cache writes over 40% of cost: cold gaps over an hour, model switches,
     compactions; batch work, no idle check-ins.
   - Many turns for the work done: unbatched tool calls, an agent searching
     what a brief could have named, retries without a new hypothesis.
   - Rework: a fix that came back, a reviewer finding the builder missed.
   - A rung mismatch: Opus on mechanical work, Haiku output that was redone.
3. Append one line to `.claude/retro-ledger.md` (create it with this header
   if missing):
   `date | branch | tier | orchestrator | turns | ctx/turn | cost r/w/o | agents | delivered | waste signal | rule changed`
4. Change at most one rule, only when the same signal shows in two or more
   ledger lines: the "Lean workflow" section of CLAUDE.md, an agent, or a
   skill. Name the ledger lines in the commit body. If a rule changed two
   retros ago and its signal did not improve, revert it.
5. Commit the ledger line (and the rule) as one commit. Report three lines:
   numbers, signal, change.

Never: claim a saving from one session; loosen a quality gate to save
usage; route anything to Fable unless the user named it for that task.
