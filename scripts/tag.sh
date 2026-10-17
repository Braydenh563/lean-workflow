#!/usr/bin/env bash
# Tag releases from the version in .claude-plugin/plugin.json: lean-workflow--vX.Y.Z on the first-parent
# commit of the current branch where that version first appeared. Safe to re-run; existing tags are kept.
#   scripts/tag.sh            tag the current version locally
#   scripts/tag.sh --push     ... and push the new tags
#   scripts/tag.sh --all      also tag every earlier version found in the history (backfill)
# bash, git, sed only.
set -euo pipefail
push=0; all=0
for a in "$@"; do case "$a" in --push) push=1;; --all) all=1;; *) echo "usage: $0 [--all] [--push]" >&2; exit 2;; esac; done
manifest=.claude-plugin/plugin.json
ver_of() { sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1; }
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
if [ "$all" -eq 1 ]; then
  # oldest first, so each version lands on the commit that first carried it
  declare -A seen
  for c in $(git log --first-parent --reverse --format=%H -- "$manifest"); do
    v=$(git show "$c:$manifest" 2>/dev/null | ver_of) || true
    [ -n "${v:-}" ] && [ -z "${seen[$v]:-}" ] && { seen[$v]=1; tag_version "$v" "$c"; }
  done
else
  c=$(git log --first-parent --reverse --format=%H -S"\"version\": \"$current\"" -- "$manifest" | head -1)
  tag_version "$current" "${c:-HEAD}"
fi
if [ "$push" -eq 1 ] && [ "${#new[@]}" -gt 0 ]; then git push origin "${new[@]}"; fi
