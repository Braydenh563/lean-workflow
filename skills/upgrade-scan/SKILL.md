---
name: upgrade-scan
description: Weekly routine for the lean-workflow repo. Reads the retro ledgers, Anthropic model release notes, Claude Code release notes and the plugin API types, then proposes updates to the routing table and hooks in one PR with evidence. Never merges, never routes to Fable. Use weekly, or when the user says "upgrade scan".
---

# Upgrade scan (weekly, one PR, nothing merged)

Run from a checkout of the lean-workflow repo, on a fresh branch `upgrade-scan/<YYYY-MM-DD>` from the default branch. Run it as a scheduled task or by hand; it needs no session history.

## 1. Gather (read-only)

1. **Ledgers.** For each repo you track, `python skills/upgrade-scan/scan.py ledger <repo>/.claude/retro-ledger.md`. Keep `actionable` (a signal on two or more lines), `median_ctx`, `orchestrators` and `rules_changed`. Also read the habit counts the coach stored (`/coach`) if the user pastes them.
2. **Item ledgers.** `python skills/upgrade-scan/scan.py items <repo>/.claude/item-ledger.md ...` (one path per tracked repo; `away` and `work` append a line per finished item with `scripts/item_ledger.py add`). It prints rework by task type and rung and the `moves` it will stand behind: a type moves up a rung when a third of at least 3 items on a rung, over 2 days or more, needed rework; down when 4 items on a dear rung needed none and the cheaper rung has not already failed on that type. `watching` lists what is short of the bar. Fable rows are counted and never produce a move.
3. **Model release notes.** `curl -sSL https://platform.claude.com/docs/en/release-notes/overview.md -o <scratch>/notes.md`, then `python skills/upgrade-scan/scan.py notes <scratch>/notes.md` (default `--since` is the date in `last-scan.json`). The file is about 130 KB; the command keeps only dated entries after that date and only the lines about models, prices, context windows, deprecations and retirements. Record, with the entry date and a one-line quote: new model ids, retirements and their dates, price per million tokens by rung, context window. Fetch the pricing page too (`https://platform.claude.com/docs/en/about-claude/pricing`) when a price line shows up.
4. **Claude Code changelog.** `curl -sSL https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md -o <scratch>/cc.md`, then `python skills/upgrade-scan/scan.py changelog <scratch>/cc.md` (default `--since` is the version in `last-scan.json`). The file is about 1 MB: never read it whole. The command keeps versions after that one and only the lines that touch hooks, plugins, skills, agents, usage limits, cache or compaction, or models, each tagged with its topics. These lines are the evidence for the "Hooks" row below.
5. **Plugin API types.** Take the current types (`.claude-plugin/types/claude-code/index.d.ts` after a load, or the plugin-authoring skill's `types/claude-code.d.ts`) and run `python skills/upgrade-scan/scan.py api <that file> --diff`. Added and removed events and types are the evidence; read the declaration of each before using it.

After the scan's PR is opened, record what was read so the next scan starts there: `python skills/upgrade-scan/scan.py last --write --claude-code <newest version> --notes <newest date>` (both are in the `newest` field of the outputs above), and commit `last-scan.json` in the same PR. `last-scan.json` also holds the two source URLs. The first scan after 1.6.0 starts from the baseline written then; pass `--since` to look further back.

If a source cannot be fetched, say so in the PR. A missing source is a gap, not a reason to guess.

## 2. Decide what may change

Only these files, only on evidence:

| Target | Where | Evidence needed |
| --- | --- | --- |
| Routing table | rungs in `skills/lean-setup/SKILL.md`; `AUTOPILOT` and `PINNED` in `hooks/register.tsx`; `model:` in `agents/*.md` | A release note naming the model change, **or** two or more ledger lines showing a rung mismatch (Opus on mechanical work, Haiku output redone) |
| Task-type rungs | the rung sentence in `skills/lean-setup/SKILL.md` ("Haiku for lookup..., Sonnet for implementation...") and the rung table in `skills/work/SKILL.md` | A `move` from `scan.py items`, quoted with its counts. One move per task type per scan; a move up is applied before a move down |
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
Sources read: <retro ledgers (n lines)>, <item ledgers (n items)>, <model notes URL, entries since DATE>, <Claude Code vX..vY>, <API types build>
Sources missing: <none | which>

## Changes
| Change | File | Evidence (quote + URL, or ledger lines) |

## Observed, no change
## Watching (what would justify it)
```

4. Report three lines to the user: sources read, changes proposed, PR link.
