---
name: release
description: Release mode. Use when the user says "cut a release", "release v1.2.0", "prepare the release" or "release mode". Runs the full gate, bumps every version site, writes the changelog from the commits, has an independent reviewer check the diff since the last tag, and stops short of publishing.
---

# Release mode

Prepares a release the user can publish with one command. Publishing is the
user's: never push a tag, create a GitHub release, publish a package or merge
in this mode, and never in an unattended run.

1. **Baseline.** `git describe --tags --abbrev=0` for the last tag (none: the
   first commit). Working tree clean, on the default branch or the release
   branch, up to date with its remote. Otherwise stop and say what is off.
2. **Gate.** `scripts/gate.sh --full` (or the repo's CI commands). Red means
   stop and report; do not release on red.
3. **Version.** From the commits since the tag: breaking change is major, a
   new feature is minor, fixes only is patch; use the version the user named
   if they named one. Find every place the current version appears
   (`git grep -n "<current version>"`: manifests, README badges, docs) and
   change them together. Do not touch an old version inside a changelog entry.
4. **Changelog.** One line per user-visible change from
   `git log <tag>..HEAD --format=%s`, grouped Added, Changed, Fixed; skip
   merges and chores. If the repo has no changelog, put the same text in the
   release commit body.
5. **Claims.** Read the README lines that describe what changed and check each
   against the code or a run. Fix the README, not the claim's wording around
   a gap.
6. **Review.** A fresh `reviewer` on `git diff <tag>..HEAD` with the changelog
   as the acceptance criteria. Fix what it confirms, then re-run step 2.
7. **Commit and tag locally.** (A repo with `scripts/tag.sh` or a tag workflow tags itself
   after the merge: commit only, and say so.) `git commit -m "Release vX.Y.Z"` and
   `git tag -a vX.Y.Z -m ...`. Never move or force-push a tag that exists.
8. **Report** in at most 6 lines: version, tag, gate result, reviewer verdict,
   and the exact commands the user runs to publish (`git push origin
   vX.Y.Z`, the release or publish step).

Never skip the gate, edit CI to get green, or publish.
