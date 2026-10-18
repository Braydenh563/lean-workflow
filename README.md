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
  <img alt="version 1.6.1" src="https://img.shields.io/badge/version-1.6.1-2DD4BF?labelColor=0B1220">
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

### Guards for unattended runs

Active only while `.claude/work-order.md` says `status: active` (a `/work` order, or an `away` run, which writes one). They apply to the main thread and to every agent. A refused call says why, and the model marks the item `[!]` instead of working around it.

| Guard | Effect |
| --- | --- |
| Force-push | `git push` with `--force`, `--force-with-lease`, `-f` or a `+ref` is denied |
| CI and settings | Edits to `.github/workflows`, `.gitlab-ci.yml`, `.circleci`, `Jenkinsfile`, `azure-pipelines*.yml`, `.claude/settings*.json` are denied (the `Edit`/`Write` tools, and shell commands that name them with a write, move or remove) |
| No commit for 60 minutes | The Stop hook (`scripts/keep-going.sh`) sets `status: stopped (no commit in 60 minutes)` and lets the run end. `max-idle-minutes:` in the order changes the 60. The clock restarts at each new `HEAD` |
| Document inputs | A PDF, Word, Excel or PowerPoint file is read once; the model saves the text it needs to `.claude/inputs/<file>.txt`, and a second read of the document is denied in favour of that copy |
| Finish-up line | At the weekly line (default 85%, 90% for the 5-hour window, or your own) the order is set to `stopped (usage)` |

These are pattern checks on the usual spellings, not a sandbox: a determined script can get around them. The 60-minute rule runs when Claude tries to stop, so it ends a run between turns, not in the middle of one.

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

`/coach` reports each habit's count this session and in your stored sessions (the last 30), the estimated tokens the nudges flagged (what they pointed at, not spend saved), and the trend: the older half of those sessions against the newer half, once there are four. **Where the dashboard shows.** A pane (the "sidebar") is drawn only by the terminal, the desktop app, VS Code and the mobile app; the plugin API has no pane for the browser at claude.ai/code, and that client may not route plugin slash commands at all. For those the plugin also registers a tool, `mcp__lean-workflow__view` (`dash`, `progress`, `spend`, `coach`, `brief`), and the autopilot tells the model to call it and show the text when you ask for the dashboard.

Nudges only advise; the one denial remains the unnamed-agent guard. The coach never suggests Fable.

### Tier and your finish-up line

The plugin reads your live limits from the host every turn. The tier follows them: `max`, then `pro` from 70% of the weekly limit (one agent, Opus agents denied unless you name Opus, budget mode on), then `stop` at the finish-up line. Each change is shown as a toast and handed to the model in its next tool result, so it knows without being asked. Recovery lifts the tier and the automatic budget mode.

Set your own line in the plugin options (`finishAtWeek`, `finishAtFiveHour`) or in a prompt: "finish up at 60% weekly" or "once I get to 60% weekly usage, finish up". The model is told the line and the current figure, told again when it is within 5 points, and at the line it finishes the step, commits, pushes and stops. The `tier` option (`max` or `pro`) sets the floor.

### Plan

Set the `plan` option once (`free`, `pro`, `max5x`, `max20x`, `team`, `enterprise`, `api`); the host does not report it, so the plugin cannot detect it. Unset keeps the old behaviour (tier `max`, 70% / 85% / 90%). The plan supplies defaults; your `tier`, `finishAtWeek` and `finishAtFiveHour` options and prompt lines override them. The table is in `hooks/plans.ts` and the model is told its row at session start.

| Plan | Start tier | Agents at once | Opus agents | Check-in loops | Budget from (weekly) | Finish up (weekly / 5-hour) |
| --- | --- | --- | --- | --- | --- | --- |
| `free` | pro | 1 | no | none | 50% | 80% / 80% |
| `pro` | pro | 1 | no | none | 70% | 85% / 90% |
| `max5x` | max | 2 | one | every 50 min at most | 70% | 85% / 90% |
| `max20x` | max | 3 | one | every 30 min at most | 75% | 90% / 95% |
| `team`, `enterprise` | max | 2 | one | every 50 min at most | 70% | 85% / 90% |
| `api` | max | 3 | one | none | none (no windows) | none (set your own) |

What is documented, and what is this plugin's judgement:

- Documented: Pro and Max have a five-hour session limit and a weekly limit, shared by Claude and Claude Code; Max adds a separate weekly limit for Fable; usage credits can continue past a limit; `/usage` shows the bars ([Use Claude Code with your Pro or Max plan](https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan)). Team and Enterprise seats draw from a per-seat allowance on a rolling five-hour and a weekly window, Standard or Premium seat, shared with chat ([Manage costs effectively](https://code.claude.com/docs/en/costs); [Claude Code with Team or Enterprise](https://support.claude.com/en/articles/11845131-use-claude-code-with-your-team-or-enterprise-plan)). API and cloud-provider use is billed per token with no plan windows ([Manage costs effectively](https://code.claude.com/docs/en/costs); [pricing](https://claude.com/pricing)). Check-in loops and idle goal check-ins resend the whole context each time, and the prompt cache lasts an hour on a subscription but five minutes on an API key ([Manage costs effectively](https://code.claude.com/docs/en/costs#why-usage-climbs-in-a-long-session)). Claude Code is part of Pro and Max, not Free ([Pro or Max plan article](https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan)).
- Not documented: Anthropic publishes no per-plan token or message counts, so the agent caps, percentages and cadences above are conservative defaults, scaled by the 5x / 20x multiples, not Anthropic figures. Premium Team seats hold more than Standard; use `max5x` lines or your own `finishAt*` if yours does. Read your own bars in `/usage` and `/dash`, and adjust.

### Commands

| Command | Shows |
| --- | --- |
| `/spend` | This session's cost split by model and token type, against your own median, with one next step |
| `/progress` | Work order bar and next item, tasks, running agents, open inbox items, and each plan's checklist as a bar (also at the end of `/dash`) |
| `/dash` | Live 5-hour and weekly limit bars with reset time, the tier and mode, a weekly trend from your stored sessions, context bar, agents, tasks and cost by model. Always printed as text (a pane opens too where the surface seats one), even when opening the pane fails. A command typed while a turn runs is queued until the turn ends; if it still shows nothing, ask Claude for the dashboard (it calls the `view` tool) |
| `/brief` | The morning briefing again (below) |
| `/coach` | Habit counts for this session and your history, with the trend |
| `/prune` | Plugins you have not used across the sessions recorded (after five) |

### Skills and agents

- `lean-setup` installs the files in the next section.
- `retro` measures the session, appends one ledger line and changes at most one rule, and only when the same signal appears in two or more lines.
- `upgrade-scan` is a weekly routine for this repo's maintainer. It reads the retro ledgers, the per-item ledgers, Anthropic's model release notes, the Claude Code changelog and the plugin API types (diffed against `api-snapshot.json`), and proposes routing-table and hook updates in one PR with a quote or ledger lines as evidence for each. The two release sources are about 130 KB and 1 MB, so `scan.py notes` and `scan.py changelog` keep only entries after the last scan (`last-scan.json`) and only the lines about models, prices, retirements, hooks, plugins, skills, agents, usage limits, cache and compaction. It also re-reads the plan-limit and pricing pages the plan table rests on (`scan.py pages` hashes them, so a rewrite is noticed), updates the table and its links, and moves `PLANS_VERIFIED`; past 90 days without a check the model is told the table may be stale. It never merges and never routes to Fable. Run it as a scheduled task or by hand.
- Item ledger. After each work-order or `away` item the model runs `scripts/item_ledger.py add`, appending `date | item | type | rung | rework | note` to `.claude/item-ledger.md`. `rework` counts the rounds an item came back (a confirmed reviewer finding, a red CI it caused, a fix that returned). `upgrade-scan` reads it and moves a task type up a rung when a third of at least 3 items on that rung, over 2 days or more, needed rework, and down when 4 items on a dear rung needed none and the cheaper rung has not already failed on that type. Fable rows are counted and never produce a move.
- Morning briefing. At session start, if `.claude/work-order.md` shows an `away` or work-order run you have not seen, the plugin shows its outcome, the done bar, blocked (`[!]`) items, the next item and the handover's `## Morning summary` block (from `HANDOVER.md`, `docs/HANDOVER.md`, `.claude/handover.md` or `.claude/now.md`). It shows once per run and outcome; `/brief` shows it again.
- Modes are skills the autopilot starts from your words; each is left with "exit <mode>":

  | Mode | Say | What it does |
  | --- | --- | --- |
  | `focus` | "focus mode", "stay focused" | One goal and its check; every new ask goes to the inbox word for word; one agent at most |
  | `triage` | "triage the inbox", "triage these screenshots" | Inbox only. A Haiku agent describes screenshots into text, nothing is built. **Enforced by the plugin**: edits only to inbox files, no build, test or install commands, Haiku agents only |
  | `review` | "review this PR", "review my changes" | A fresh `reviewer` on the exact range, findings verified and ranked, no edits |
  | `budget` | "budget mode", "I'm running low on usage"; **automatic at 70% weekly** | Pro habits: one agent, Sonnet/Haiku, targeted tests, commit every step, stop at the finish-up line. The Opus denial is enforced by the plugin |
  | `release` | "cut a release", "release v1.7.0" | Full gate, every version site bumped, changelog from the commits, reviewer on the diff since the last tag, local commit and tag; never publishes |

  The plugin sets the mode when the skill runs or your prompt matches, shows it in `/dash`, and clears it at session end.
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
| `plan` | empty | `free`, `pro`, `max5x`, `max20x`, `team`, `enterprise` or `api`; sets the defaults in the plan table |
| `tier` | plan's, else `max` | `max` or `pro`; the live limits raise it on their own |
| `finishAtWeek` | 85 | Weekly % at which the model is told to finish up, push and stop |
| `finishAtFiveHour` | 90 | Same for the 5-hour window |

## Status and limits

- Coach savings are estimates built on stated assumptions (20 turns of carry, 800 tokens per commit diff, 1,500 per image, 15k to start an agent, 50k per agent run, relative prices haiku 1 : sonnet 3 : opus 5). `upgrade-scan` re-checks the prices; treat the numbers as a ranking of habits, not a bill.
- Usage figures are the plugin's own counts of the session's token usage, weighted by relative price (reads 0.1, input 1, writes 2, output 5). They are ratios for comparison, not plan usage or money.
- The guards and templates are tested (`claude plugin test .`, `pytest tests`). Whether the rules save tokens in your repo is something to read off your own ledger; one session proves nothing, which is why `retro` waits for repeats.
- `codemap.py` reads Python with `ast` and JS/TS/Go with regular expressions, so it can miss unusual declaration styles. It maps top-level and exported definitions only.
- `gate.sh` runs whatever your CI runs; it cannot know a check CI does not.
- Modes other than `triage` and `budget` change how the model works through its instructions; the plugin does not police them. A mode is set from a skill running or a prompt matching a trigger phrase, so an unusual phrasing starts nothing, and "triage the ..." or a prompt that opens with "triage" starts triage even if you meant something looser. Say "exit triage" to lift it.
- The morning briefing is a toast at session start. Whether a surface shows it is the surface's call; `/brief` and the view tool always work where plugin commands or tools do.
- Item-ledger moves need repeated evidence over several days, so a new install proposes nothing for weeks.

### With other token plugins

Nothing here depends on another plugin. If `headroom` is installed, its `peek` skill is the way to read a long text copy of a document input. `token-shield` (CLAUDE.md diet), `token-efficiency-audit` and `cc-token-statusline` measure or trim different things; the one overlap is the status line, which both this plugin and a status-line plugin write to, so keep one of them for it. `/prune` lists plugins you never use.

## Develop

```
claude plugin test .       # hook tests
claude plugin validate .   # manifest
python -m pytest tests     # template tests, in a scratch repo
```

Releases: raise `version` in `.claude-plugin/plugin.json` (and the README badge) in the PR. When it merges to main, the `Tag release` workflow runs `scripts/tag.sh --push`, which tags the commit that set the version as `lean-workflow--vX.Y.Z` (annotated; an existing tag is never moved). To tag or re-tag a version yourself, open Actions, pick **Tag release**, press **Run workflow**, type the version (for example `1.7.0`) and run it; it tags that version's commit and creates the GitHub release page (untick *release* for the tag alone, tick *backfill* to tag every earlier version without a tag). The version must already be in `plugin.json` on main. By hand: `scripts/tag.sh --version 1.7.0 --push`, or `scripts/tag.sh --push`, or `scripts/tag.sh --all --push` to backfill every earlier version found in the history. A GitHub release page is still yours to create from the tag. **One-time setup for the workflow:** GitHub will not let the default workflow token create a tag whose commit's history changes a file under `.github/workflows` (which is most releases of this repo), so the run fails with "refusing to allow a GitHub App to create or update workflow ... without `workflows` permission". Create a fine-grained personal access token (GitHub, Settings, Developer settings, Fine-grained tokens) for this repository only, with **Contents: read and write** and **Workflows: read and write**, and save it as a repository secret named `TAG_TOKEN` (repository Settings, Secrets and variables, Actions). The workflow uses it when present and falls back to the default token otherwise. Without it, tag from your own checkout: `git tag -a lean-workflow--vX.Y.Z -m "lean-workflow X.Y.Z" <commit>` then `git push origin lean-workflow--vX.Y.Z`.

Layout: `hooks/` (guards and commands in `register.tsx`; pure rules in `coach.ts`, `tier.ts`, `plans.ts`, `modes.ts`, `guards.ts`, `briefing.ts`, `progress.ts`; formatting in `format.ts`), `skills/` (`lean-setup` with `templates/`, `retro`, `upgrade-scan`, `work`, `away`, and the modes `focus`, `triage`, `review`, `budget`, `release`), `scripts/` (`keep-going.sh`, `item_ledger.py`), `agents/`, `.claude-plugin/` (manifests).

## Licence

[MIT](LICENSE)
