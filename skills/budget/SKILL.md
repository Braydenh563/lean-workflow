---
name: budget
description: Budget mode, for when usage is the limit. The plugin turns it on at 70% of the weekly limit; also use when the user says "budget mode", "save tokens", "I'm running low on usage". One agent, Sonnet and Haiku only, targeted tests, short sessions, stop at the finish-up line.
---

# Budget mode

Automatic at the weekly limit's 70% (the plugin says so, shows the tier in
the status line and `/dash`, and refuses Opus agents unless the user names
Opus). It lifts by itself when the limit recovers. Say "exit budget mode" to
leave it early; the Opus refusal stays until then or until you name Opus.

1. Read the live figures once (`/dash`, or the plugin's view tool): weekly and
   5-hour percentages, when the week resets, and the finish-up line (default
   85% weekly, 90% 5-hour; the user can set their own, e.g. "finish up at
   60% weekly").
2. Work as the `pro` tier: one agent at a time, Haiku for lookup, Sonnet for
   the rest. No Opus, no Fable. No scan rotation, no `blind-tester`, no UI
   sweep unless the task is a UI change.
3. Targeted tests (`scripts/gate.sh --changed`), the full gate once before the
   push. No re-reads; grep, then line ranges. Compact at 100k context and
   keep the handover current.
4. Commit and push at every step: a stop can come at the next turn.
5. Before starting anything that costs more than a few turns, say what it
   costs and whether it can wait for the reset. Prefer the smallest change
   that meets the check.
6. At the finish-up line: finish the step, commit, push, update the handover
   with the next item named, stop. An active work order is marked
   `stopped (usage)` by the plugin; do not restart it.

Never loosen a quality gate to save usage.
