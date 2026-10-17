<p align="center">
  <img src="assets/mark.svg" width="96" height="96" alt="lean-workflow logo"><br>
  <img src="assets/wordmark.svg" width="260" alt="lean-workflow"><br>
  <strong>Fewer tokens per task. The checks stay.</strong>
</p>

<p align="center">
  A Claude Code plugin that keeps sessions cheap and repeatable: guards against the usual token sinks,
  a code map and start-of-session script so work begins at the right file, one command that runs the
  repo's own checks, and a retro that changes a rule only when the numbers repeat.
</p>

<p align="center">
  <a href="https://github.com/Braydenh563/lean-workflow/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/Braydenh563/lean-workflow/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="version 1.5.0" src="https://img.shields.io/badge/version-1.5.0-2DD4BF?labelColor=0B1220">
  <a href="LICENSE"><img alt="MIT licence" src="https://img.shields.io/badge/licence-MIT-38BDF8?labelColor=0B1220"></a>
  <img alt="Claude Code plugin" src="https://img.shields.io/badge/Claude%20Code-plugin-FBBF24?labelColor=0B1220"><br>
  <a href="#install"><img alt="Install" src="https://img.shields.io/badge/-Install-0B1220?style=flat-square"></a>
  <a href="#what-it-does"><img alt="What it does" src="https://img.shields.io/badge/-What%20it%20does-0B1220?style=flat-square"></a>
  <a href="#what-lean-setup-adds-to-a-repo"><img alt="Repo setup" src="https://img.shields.io/badge/-Repo%20setup-0B1220?style=flat-square"></a>
  <a href="#configuration"><img alt="Configuration" src="https://img.shields.io/badge/-Configuration-0B1220?style=flat-square"></a>
  <a href="#status-and-limits"><img alt="Limits" src="https://img.shields.io/badge/-Limits-0B1220?style=flat-square"></a>
</p>

## Why

Claude Code's cost is turns multiplied by context. Most of the avoidable spend comes from a few
habits: reading a 5,000-line file whole, repeating a failing call, handing an agent the wrong model,
and carrying a 150k-token context long past the point where a fresh session would be cheaper. This
plugin catches those at the moment they happen and keeps the project's state in files, so a new
session starts from a short note instead of re-exploring.

It came out of [Tessellate](https://github.com/Braydenh563/Tessellate), where the same rules run
daily across long sessions with several agents.

## Install

```
/plugin install lean-workflow --marketplace Braydenh563/lean-workflow
```

Then open any repo. The first time, the plugin tells Claude to run `lean-setup`, which adds the
files below. A repo that already has the workflow is left alone.

## What it does

### Guards (always on)

| Guard | Trigger | Effect |
| --- | --- | --- |
| Huge-file read | Whole-file `Read` of a path matching `grepOnly` (code maps, histories, lockfiles, minified files) | Denied; grep, then read a line range |
| Repeat loop | The same tool call three times in a row | Denied; change the hypothesis or report the blocker |
| Unnamed agent | `Agent` call with no model (agent types that pin their own are exempt) | Denied; name haiku, sonnet or opus |
| Unrequested Fable | A Fable agent when your prompt did not name it | Denied |

### Warnings

- Live context window and your 5-hour and weekly limits in the status line (from the host, not estimated); a note to the model once context passes 150k.
- Any tool result over 20,000 characters, since it rides in context on every later turn.
- `CLAUDE.md` over 200 lines, `.claude/now.md` over 60 lines or at 20 inbox items.

### Habit coach

Nine habits are watched. Each nudge shows **once per session** (at most two per prompt), names the cheaper alternative and gives an estimated saving. Savings are in token-equivalents (plain input = 1; cache reads 0.1, writes 2, output 5) from the assumptions in `hooks/coach.ts`, not measured spend.

| Habit | Fires when | Cheaper alternative |
| --- | --- | --- |
| Long session | 3 h since `$.session.usage().startedAt`, 100 turns, or 150k context | Handover, then type `/compact` (a fresh session at a milestone) |
| Long-lived PR | Branch has 25 commits, or its oldest commit (from `git log` against the default branch) is 3 days old | Merge what is done; open the rest as a second PR |
| Agent model | An `Agent` call on opus or sonnet whose brief is lookup-sized (or opus with no design, review or debugging in it) | haiku, or sonnet |
| Big paste | A prompt over 20,000 characters | Save to a file, grep it, read a line range |
| Images | 2 or more images, or one over 1 MB | Crop to the problem, or state the numbers |
| Idle gap | 55 minutes since the last turn (the prompt cache has likely expired) | Fresh session from the handover |
| Weekly limit | The `seven_day` window is 70% used, or 50% used and 20 points ahead of an even burn | Cheaper rungs; big runs wait for the reset |
| Re-reads | The same file read whole 3 times (a ranged read does not count) | Put the facts in `now.md`, or grep and read a line range |
| Agent fan-out | 4 or more `Agent` calls in one prompt | One haiku scout to locate, then at most two builders |

`/coach` reports each habit's count this session and in your stored sessions (the last 30), the estimated tokens the nudges flagged (what they pointed at, not spend saved), and the trend: the older half of those sessions against the newer half, once there are four. Nudges only advise; the one denial remains the unnamed-agent guard. The coach never suggests Fable.

### Commands

| Command | Shows |
| --- | --- |
| `/spend` | This session's cost split by model and token type, against your own median, with one next step |
| `/progress` | Work order bar and next item, tasks, running agents, open inbox items, and each plan's checklist as a bar (also at the end of `/dash`) |
| `/dash` | Context bar, agents, tasks and cost by model (a pane where the surface has one, text otherwise) |
| `/coach` | Habit counts for this session and your history, with the trend |
| `/prune` | Plugins you have not used across the sessions recorded (after five) |

### Skills and agents

- `lean-setup` installs the files in the next section.
- `retro` measures the session, appends one ledger line and changes at most one rule, and only when the same signal appears in two or more lines.
- `upgrade-scan` is a weekly routine for this repo's maintainer. It reads the retro ledgers, Anthropic model and Claude Code release notes and the plugin API types (diffed against `api-snapshot.json`), and proposes routing-table and hook updates in one PR with a quote or ledger lines as evidence for each. It never merges and never routes to Fable. Run it as a scheduled task or by hand.
- `work` runs a preset order until it is done: `/work ship [PR]` (merge the base in, CI green, CodeQL and review threads cleared, a reviewer pass for bugs and clashes, then merge) or `/work continue` (the queue, plus a scan every 3 items rotating bugs, security, architecture, UI and WCAG with overflow checks, and learnability). It writes `.claude/work-order.md`; a Stop hook then refuses to end the run while that order is `active`, handing back the next unticked item, capped at `max-continues` (40). Stop it with `/work stop`. Pair it with `autoContinueAtUsageLimit` so a run resumes after the 5-hour reset.
- `away` runs when you say you are going to sleep, to work or away: it writes the queue and handover, works item by item (Haiku scouts, Sonnet builds, a reviewer checks), opens a PR every 3 to 5 items, stops at 85% of the weekly limit, and leaves an 8-line summary for your phone. No keep-warm pings: Claude Code's idle compaction already shrinks the context before the hour-long cache expires.
- Agents: `scout` (read-only finder, Haiku), `reviewer` (independent diff check), `ux-auditor`, `blind-tester`.

## What `lean-setup` adds to a repo

| File | Purpose |
| --- | --- |
| `CLAUDE.md` section "Lean workflow" | Model rungs, tiers, the Fable opt-in rule, retry limit, and the working rules below |
| `.claude/now.md` | Goal, current state, active files, changes, failed attempts, next steps, **Decisions** (written once, not remade) and **Inbox** (mid-task requests recorded word for word, triaged at the next step boundary, under 20) |
| `.claude/retro-ledger.md` | One line per session; the evidence the retro works from |
| `scripts/codemap.py` | Writes `docs/CODEMAP.md`: `name \| file:line` for Python, JS/TS and Go definitions, plus test files with counts. `--check` exits 1 when the map is stale |
| `scripts/orient.sh` | Under 40 lines of shell: head of `now.md`, inbox and decision counts, uncommitted paths, remaining-work files, map freshness, last ledger line |
| `scripts/gate.sh` | Filled from your CI config. Plain run: fast checks. `--changed`: plus tests that name changed files. `--staged`: checks against the index, so a commit that splits a pair is caught. `--full`: the whole suite. Always ends with the map check |

An existing 1.0 repo gets the new pieces by saying "lean upgrade".

### Working rules it writes

- Run `scripts/orient.sh` first, `scripts/gate.sh` before every push.
- Grep `docs/CODEMAP.md`, then read line ranges. Scouts do the same.
- Agents keep `.claude/remaining/<agent>.md` (done, next, blocked) and commit at least every 20 minutes, so a usage limit never loses work.
- Tests take a fixed "now" (an injected or frozen clock), never the real one.
- A claim about how a UI looks or behaves needs a measurement from the running app; say what was not verified.
- One retry per new hypothesis. The builder does not grade its own work.

## Configuration

Set under the plugin's options.

| Option | Default | Meaning |
| --- | --- | --- |
| `grepOnly` | code maps, histories, changelogs, lockfiles, `.min.js`, `.map` | Regex of paths that must not be read whole |
| `claudeMdMaxLines` | 200 | Warn when `CLAUDE.md` is read whole or written past this |
| `nowMaxLines` | 60 | Same for `.claude/now.md` |
| `coachOff` | empty | Comma-separated habits the coach should not count or show, e.g. `bigImage, idleGap` |

## Status and limits

- Coach savings are estimates built on stated assumptions (20 turns of carry, 800 tokens per commit diff, 1,500 per image, 15k to start an agent, 50k per agent run, relative prices haiku 1 : sonnet 3 : opus 5). `upgrade-scan` re-checks the prices; treat the numbers as a ranking of habits, not a bill.
- Usage figures are the plugin's own counts of the session's token usage, weighted by relative price (reads 0.1, input 1, writes 2, output 5). They are ratios for comparison, not plan usage or money.
- The guards and templates are tested (`claude plugin test .`, `pytest tests`). Whether the rules save tokens in your repo is something to read off your own ledger; one session proves nothing, which is why `retro` waits for repeats.
- `codemap.py` reads Python with `ast` and JS/TS/Go with regular expressions, so it can miss unusual declaration styles. It maps top-level and exported definitions only.
- `gate.sh` runs whatever your CI runs; it cannot know a check CI does not.

## Develop

```
claude plugin test .       # hook tests
claude plugin validate .   # manifest
python -m pytest tests     # template tests, in a scratch repo
```

Layout: `hooks/` (guards and commands in `register.tsx`, coach rules in `coach.ts`, formatting), `skills/` (`lean-setup` with `templates/`, `retro`, `upgrade-scan`), `agents/`, `.claude-plugin/` (manifests).

## Licence

[MIT](LICENSE)
