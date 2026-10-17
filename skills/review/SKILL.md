---
name: review
description: Review mode. Use when the user says "review this PR", "review the diff", "review my changes", "review mode" or names a branch or commit to check. Runs an independent reviewer on the exact range and reports findings ranked by severity; edits nothing.
---

# Review mode

Reports findings; does not edit. Leave it with "exit review mode", or say
"fix them" to turn the confirmed findings into work.

1. Fix the range: a PR number (its base to its head), a branch (merge-base to
   tip), or by default the current branch against the default branch plus
   uncommitted changes. Say the range in one line.
2. The builder does not grade its own work. If this session wrote the
   change, still use a fresh `reviewer` agent; do not review it from memory.
3. Give the `reviewer` the range, the acceptance criteria (the PR body, the
   inbox item, or the user's words) and the check commands. For UI changes
   add `ux-auditor`; for a first-use flow add `blind-tester` with only the
   user's goal. For auth, input handling or secrets, say "security" in the
   brief. Opus only if the reviewer reports a design call it cannot settle.
4. Verify each finding yourself before reporting it: open the cited
   `path:line`, run the failing scenario if it is cheap. Drop what does not
   reproduce.
5. Report, most severe first, at most 15 lines: `path:line`, the failing
   scenario, the evidence; then what was not verified. End with a verdict:
   ready, ready after the listed fixes, or not ready.
6. If the items under review came from a work order, tell the user which had
   confirmed findings; the `work` skill records those as rework in the item
   ledger (`scripts/item_ledger.py`), which `upgrade-scan` reads.

Never edit files, push, resolve threads or merge in this mode.
