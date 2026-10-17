#!/usr/bin/env bash
# Tag releases from the version in .claude-plugin/plugin.json: lean-workflow--vX.Y.Z on the first-parent
# commit of the current branch where that version first appeared. Safe to re-run; existing tags are kept.
#   scripts/tag.sh            tag the current version locally
#   scripts/tag.sh --push     ... and push the new tags
#   scripts/tag.sh --version 1.5.0   tag that version (it must appear in plugin.json's history on this branch)
#   scripts/tag.sh --all      also tag every earlier version found in the history (backfill)
# bash, git, sed only.
set -euo pipefail
push=0; all=0; want=""
while [ $# -gt 0 ]; do
  case "$1" in
    --push) push=1;;
    --all) all=1;;
    --version) shift; want="${1#v}"; case "$want" in [0-9]*.[0-9]*.[0-9]*) ;; *) echo "--version needs X.Y.Z" >&2; exit 2;; esac;;
    *) echo "usage: $0 [--version X.Y.Z] [--all] [--push]" >&2; exit 2;;
  esac
  shift
done
manifest=.claude-plugin/plugin.json
ver_of() { sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | sed -n 1p; }
new=()
tag_version() {  # version commit
  local tag="lean-workflow--v$1"
  if git rev-parse -q --verify "refs/tags/$tag" >/dev/null; then echo "kept    $tag"; return; fi
  git tag -a "$tag" -m "lean-workflow $1" "$2"
  echo "tagged  $tag -> $(git log -1 --format='%h %s' "$2")"
  new+=("$tag")
}
current=$(ver_of < "$manifest")
[ -n "$current" ] || { echo "no version in $manifest" >&2; exit 1; }
target=${want:-$current}
if [ "$all" -eq 1 ]; then
  # oldest first, so each version lands on the commit that first carried it
  declare -A seen
  for c in $(git log --first-parent --reverse --format=%H -- "$manifest"); do
    v=$(git show "$c:$manifest" 2>/dev/null | ver_of) || true
    [ -n "${v:-}" ] && [ -z "${seen[$v]:-}" ] && { seen[$v]=1; tag_version "$v" "$c"; }
  done
else
  c=$(git log --first-parent --reverse --format=%H -S"\"version\": \"$target\"" -- "$manifest" | sed -n 1p)
  if [ -z "$c" ]; then
    echo "version $target never appears in $manifest on this branch: raise it there in a PR first (current is $current)" >&2
    exit 1
  fi
  tag_version "$target" "$c"
fi
if [ "$push" -eq 1 ] && [ "${#new[@]}" -gt 0 ]; then
  # One push per tag, so a refusal of one does not stop the rest.
  failed=()
  for t in "${new[@]}"; do git push origin "$t" || failed+=("$t"); done
  if [ "${#failed[@]}" -gt 0 ]; then
    echo "not pushed: ${failed[*]}" >&2
    echo "GitHub refuses a tag push from Actions (GITHUB_TOKEN) when the tagged commit's history changes a file under .github/workflows." >&2
    echo "Fix once: add a repository secret TAG_TOKEN (fine-grained token, Contents and Workflows read/write); the workflow uses it. See README, Releases." >&2
    echo "Or push from your own checkout: git tag -a <tag> -m <msg> <commit> && git push origin <tag> (scripts/tag.sh --all --push in a bash shell)." >&2
    exit 1
  fi
fi
