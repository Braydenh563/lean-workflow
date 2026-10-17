---
name: upgrade-scan
description: Weekly routine for the lean-workflow repo. Reads the retro ledgers, Anthropic model release notes, Claude Code release notes and the plugin API types, then proposes updates to the routing table and hooks in one PR with evidence. Never merges, never routes to Fable. Use weekly, or when the user says "upgrade scan".
---

# Upgrade scan (weekly, one PR, nothing merged)

Run from a checkout of the lean-workflow repo, on a fresh branch `upgrade-scan/<YYYY-MM-DD>` from the default branch. Run it as a scheduled task or by hand; it needs no session history.

## 1. Gather (read-only)

1. **Ledgers.** For each repo you track, `python skills/upgrade-scan/scan.py ledger <repo>/.claude/retro-ledger.md`. Keep `actionable` (a signal on two or more lines), `median_ctx`, `orchestrators` and `rules_changed`. Also read the habit counts the coach stored (`/coach`) if the user pastes them.
2. **Model release notes.** Fetch Anthropic's model and pricing pages and release notes (docs.anthropic.com, "Models overview" and "Release notes"). Record, with the URL and a one-line quote: new model ids, retirements and deprecation dates, price per million tokens by rung, context window.
3. **Claude Code release notes.** Fetch the changelog (github.com/anthropics/claude-code, `CHANGELOG.md`) for versions since the last scan (the last PR's body names it). Record changes to hooks, plugins, agents, skills, usage limits and cache behaviour.
4. **Plugin API types.** Take the current types (`.claude-plugin/types/claude-code/index.d.ts` after a load, or the plugin-authoring skill's `types/claude-code.d.ts`) and run `python skills/upgrade-scan/scan.py api <that file> --diff`. Added and removed events and types are the evidence; read the declaration of each before using it.

If a source cannot be fetched, say so in the PR. A missing source is a gap, not a reason to guess.

## 2. Decide what may change

Only these files, only on evidence:

| Target | Where | Evidence needed |
| --- | --- | --- |
| Routing table | rungs in `skills/lean-setup/SKILL.md`; `AUTOPILOT` and `PINNED` in `hooks/register.tsx`; `model:` in `agents/*.md` | A release note naming the model change, **or** two or more ledger lines showing a rung mismatch (Opus on mechanical work, Haiku output redone) |
| Prices | `RATE` in `hooks/coach.ts` | The pricing page, quoted. Ratios only |
| Coach thresholds | `LIMITS` in `hooks/coach.ts` | Two or more sessions of `/coach` counts or ledger lines. A threshold that never fires or always fires |
| Hooks | `hooks/register.tsx` | An API diff entry (new event that replaces a workaround, removed or renamed event the hooks use), or a Claude Code release note about a behaviour the hooks rely on |

A change with one ledger line or no quote is not proposed; list it under "Watching" with what would justify it. Change at most five things in one scan. Do not touch quality gates to save usage.

## 3. Hard rules

- **Never route to Fable.** The routing table has no Fable rung. If a release names a Fable model, record it under "Observed" with the quote and change nothing: Fable stays opt-in, used only when the user names it for a task. Do not add it to `PINNED`, an agent's `model:`, a nudge's suggested alternative or `RATE`.
- **Never merge.** Open the PR ready for review and stop. No auto-merge, no merge call, no approval on your own PR. A human decides.
- One PR per scan. If one is already open from a previous scan, push to it instead of opening another.

## 4. Verify, then open the PR

1. `claude plugin validate .` and `claude plugin test .` pass; `python -m pytest -q tests` passes. A red check means fix or drop the change.
2. If the API diff changed, run `python skills/upgrade-scan/scan.py api <types file> --write` so the snapshot moves with the PR.
3. Commit with the evidence in the body. Open the PR with this body:

```
## Scan <date>
Sources read: <ledgers (n lines)>, <model notes URL>, <Claude Code vX..vY>, <API types build>
Sources missing: <none | which>

## Changes
| Change | File | Evidence (quote + URL, or ledger lines) |

## Observed, no change
## Watching (what would justify it)
```

4. Report three lines to the user: sources read, changes proposed, PR link.
