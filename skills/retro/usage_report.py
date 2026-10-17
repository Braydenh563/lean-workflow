#!/usr/bin/env python3
"""Where a Claude Code session's usage went, from its local transcript.

Usage: python usage_report.py [SESSION.jsonl ...]
With no argument it reads the newest transcript for this repository under
~/.claude/projects/. Subagent transcripts beside it are counted separately.

Tokens are weighted by their price relative to plain input (cache read 0.1,
5-minute cache write 1.25, 1-hour cache write 2, output 5), so the split
shows what each kind of token cost, not just how many there were. The
weights are ratios, not a measurement of plan usage.
"""
from __future__ import annotations

import json
import re
import sys
from datetime import datetime
from pathlib import Path

WEIGHTS = {"input": 1.0, "read": 0.1, "write_5m": 1.25, "write_1h": 2.0, "output": 5.0}
COLD_GAP_S = 3600  # past this the cache has expired and the next turn rewrites it


def project_dir() -> Path:
    # Run from the project's root: transcripts are filed under its path.
    return Path.home() / ".claude" / "projects" / re.sub(r"[^A-Za-z0-9]", "-", str(Path.cwd().resolve()))


def turns(path: Path) -> list[dict]:
    seen: dict[str, dict] = {}
    with path.open(encoding="utf-8") as fh:
        for line in fh:
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            msg = row.get("message") or {}
            usage = msg.get("usage") if isinstance(msg, dict) else None
            if not usage:
                continue
            # A streamed reply is logged once per content block with the same id.
            key = row.get("requestId") or msg.get("id") or row.get("uuid")
            seen[key] = {"usage": usage, "ts": row.get("timestamp"), "model": msg.get("model", "?")}
    return list(seen.values())


def split(rows: list[dict]) -> dict[str, float]:
    tot = dict.fromkeys(WEIGHTS, 0.0)
    for r in rows:
        u = r["usage"]
        cc = u.get("cache_creation") or {}
        w1h = cc.get("ephemeral_1h_input_tokens")
        w5m = cc.get("ephemeral_5m_input_tokens")
        if w1h is None and w5m is None:
            w5m, w1h = u.get("cache_creation_input_tokens", 0), 0
        tot["input"] += u.get("input_tokens", 0)
        tot["read"] += u.get("cache_read_input_tokens", 0)
        tot["write_5m"] += w5m or 0
        tot["write_1h"] += w1h or 0
        tot["output"] += u.get("output_tokens", 0)
    return tot


def cold_turns(rows: list[dict]) -> int:
    stamps = sorted(datetime.fromisoformat(r["ts"].replace("Z", "+00:00")) for r in rows if r.get("ts"))
    return sum(1 for a, b in zip(stamps, stamps[1:]) if (b - a).total_seconds() > COLD_GAP_S)


def report(label: str, rows: list[dict]) -> None:
    if not rows:
        return
    tot = split(rows)
    raw = sum(tot.values())
    cost = {k: v * WEIGHTS[k] for k, v in tot.items()}
    weighted = sum(cost.values()) or 1.0
    ctx = (tot["read"] + tot["write_5m"] + tot["write_1h"] + tot["input"]) / len(rows)
    models = sorted({r["model"] for r in rows})
    print(f"== {label}: {len(rows)} turns, models {', '.join(models)}")
    print(f"   mean context per turn {ctx / 1000:.0f}k tokens; cold turns (gap > 1h) {cold_turns(rows)}")
    for k in WEIGHTS:
        print(f"   {k:9} {tot[k] / 1e6:7.2f}M tokens {100 * tot[k] / (raw or 1):5.1f}%   cost share {100 * cost[k] / weighted:5.1f}%")


def main(argv: list[str]) -> int:
    paths = [Path(a) for a in argv]
    if not paths:
        found = sorted(project_dir().glob("*.jsonl"), key=lambda p: p.stat().st_mtime)
        if not found:
            print(f"no transcripts under {project_dir()}")
            return 1
        paths = [found[-1]]
    for p in paths:
        report(f"session {p.stem[:8]}", turns(p))
        subs = sorted(p.with_suffix("").glob("**/*.jsonl"))
        sub_rows = [t for s in subs for t in turns(s)]
        report(f"subagents ({len(subs)} transcripts)", sub_rows)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
