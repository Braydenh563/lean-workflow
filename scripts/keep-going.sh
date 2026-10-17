#!/usr/bin/env bash
# Stop hook: while a work order is active, refuse the stop and hand Claude its next item,
# so an unattended run does not end after one task. bash, grep, sed only (Git Bash works).
# The order lives in .claude/work-order.md; a counter caps the continues so it can never loop,
# and 60 minutes with no commit stops the run (status: stopped).
input=$(cat)
cwd=$(printf '%s' "$input" | sed -n 's/.*"cwd"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)
order="${cwd:-.}/.claude/work-order.md"
[ -f "$order" ] || exit 0
field() { sed -n "s/^$1:[[:space:]]*//p" "$order" | head -1 | tr -d '\r'; }
[ "$(field status)" = "active" ] || exit 0
mode=$(field mode)
cap=$(field max-continues); case "$cap" in ''|*[!0-9]*) cap=40;; esac
count_file="${cwd:-.}/.claude/work-order.count"
stop_order() { sed -i.bak "s/^status:.*/status: stopped ($1)/" "$order" && rm -f "$order.bak"; }
# Idle guard: no new commit for max-idle-minutes (default 60) ends the run. The clock restarts at each new HEAD;
# its first reading is the order file's age, so a run that never commits is caught too. LEAN_NOW is for tests.
idle=$(field max-idle-minutes); case "$idle" in ''|*[!0-9]*) idle=60;; esac
now=${LEAN_NOW:-$(date +%s)}
head=$(git -C "${cwd:-.}" rev-parse HEAD 2>/dev/null); head=${head:-none}
last_file="${cwd:-.}/.claude/work-order.last"
read -r last_head last_at < "$last_file" 2>/dev/null
if [ ! -f "$last_file" ]; then
  last_head=$head
  last_at=$(stat -c %Y "$order" 2>/dev/null || stat -f %m "$order" 2>/dev/null || echo "$now")
  echo "$last_head $last_at" > "$last_file"
elif [ "$head" != "$last_head" ]; then
  echo "$head $now" > "$last_file"
  last_at=$now
fi
case "$last_at" in ''|*[!0-9]*) last_at=$now;; esac
if [ $(( (now - last_at) / 60 )) -ge "$idle" ]; then
  stop_order "no commit in $idle minutes"
  exit 0
fi
n=$(cat "$count_file" 2>/dev/null); case "$n" in ''|*[!0-9]*) n=0;; esac
if [ "$n" -ge "$cap" ]; then
  stop_order "continue cap reached"
  exit 0
fi
left=$(grep -c '^[[:space:]]*[-*] \[ \]' "$order")
next=$(grep -m1 '^[[:space:]]*[-*] \[ \]' "$order" | sed 's/^[[:space:]]*[-*] \[ \][[:space:]]*//')
if [ "$left" -eq 0 ]; then
  case "$mode" in
    ship) exit 0 ;;  # ship ends when its checklist is done; the skill sets status: done after merging
    *) why="The queue is empty. Refill it from the next scan in the rotation (work skill), then continue." ;;
  esac
else
  why="$left items left. Next: $next"
fi
echo $((n + 1)) > "$count_file"
reason="Work order ($mode, continue $((n + 1))/$cap) is active: do not stop. $why Follow the work skill: one commit per step, tick the item in .claude/work-order.md, check usage, and set status: done or stopped there when a stop rule is met."
reason=$(printf '%s' "$reason" | tr -d '\000-\037' | sed 's/\\/\\\\/g; s/"/\\"/g')
printf '{"decision":"block","reason":"%s"}\n' "$reason"
