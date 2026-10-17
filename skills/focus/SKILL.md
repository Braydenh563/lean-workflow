---
name: focus
description: One-goal mode. Use when the user says "focus mode", "focus on this", "stay focused", or gives one narrow task and wants nothing else touched. Fixes the goal and the files in scope, records every new ask in the inbox instead of acting on it, and ends with the goal's check passing.
---

# Focus mode

The plugin sets this mode when you invoke the skill or the user says "focus
mode". It changes how you work, not what the hooks allow. Leave it with
"exit focus mode" or when the goal's check passes.

1. State the goal in one line and the check that proves it (a test, a
   command, a measurement). Write both under Goal in `.claude/now.md`.
2. Name the files in scope (`docs/CODEMAP.md` grep, one scout if unsure).
   Anything outside them is out of scope until the goal is done.
3. A new ask, idea or bug seen on the way: append it to the Inbox word for
   word with `focus: later` and carry on. Do not fix it, do not start an
   agent for it.
4. At most one agent at a time, and only a Haiku scout or the `reviewer`
   at the end. No scans, no refactors, no cleanup beyond the goal.
5. Done means the check passes and the gate is green. Report: goal met or
   not, the check's output, and the inbox items added (count and titles).
   Then clear the mode and triage the inbox in one pass, as the workflow
   says at a step boundary.

Never widen the goal because the neighbouring code is untidy.
