---
name: triage
description: Inbox-only mode. Use when the user says "triage", "go through the inbox", "triage these screenshots" or "triage these bugs". Records each item in the inbox, has a Haiku agent describe screenshots into text, builds nothing and edits only inbox files.
---

# Triage mode

The plugin enforces this while the mode is on: edits only to the inbox
(`.claude/now.md`, `INBOX.md`, `docs/roadmap/INBOX.md`), no builds, tests or
installs, and Haiku agents only. Leave it with "exit triage". Nothing is
fixed in this mode; it makes the pile short and clear.

1. Find the inbox the repo uses (`docs/roadmap/INBOX.md`, `INBOX.md`, or the
   Inbox in `.claude/now.md`). Read its open items once.
2. **Screenshots.** Do not open them yourself. For image files on disk, start
   one Haiku agent (`scout`, `model: haiku`) per batch of up to 5 with this
   brief: "Describe each image in at most 4 lines: which screen, what looks
   wrong, any text, number or error shown, verbatim. No guesses about
   cause." Keep its text; that text is the evidence. An image attached
   straight to the prompt is already in context: describe it once in the same
   form, then suggest `/compact` so it stops riding along.
3. For each item the user gave (word for word) and each described screenshot,
   add one numbered line to the inbox:
   `N. **kind** the user's words, then the evidence — where (file:line if a
   scout found it) — one-line triage: fix now / plan <file> / drop`.
   Merge duplicates into the existing item rather than adding a second.
4. Keep the inbox under 20 items. Over that, say which to drop or fold.
5. Report in at most 6 lines: items added, merged, dropped; the three that
   should go first and why; "say `exit triage` to start on them".

Never: edit source or tests, run a build, test or install, start a
non-Haiku agent, or open an image you can have described. The plugin refuses
the first three.
