#!/usr/bin/env python3
"""Evidence helpers for the upgrade-scan skill.

  scan.py ledger [PATH]            summarise a retro ledger (default .claude/retro-ledger.md)
  scan.py api TYPES.d.ts           list the hook events and exported types in a plugin API file
  scan.py api TYPES.d.ts --diff    compare them with skills/upgrade-scan/api-snapshot.json
  scan.py api TYPES.d.ts --write   replace the snapshot (only in the scan PR, after reading the diff)
"""
import json
import re
import statistics
import sys
from collections import Counter
from pathlib import Path

SNAPSHOT = Path(__file__).with_name("api-snapshot.json")
COLS = ["date", "branch", "tier", "orchestrator", "turns", "ctx", "cost", "agents", "delivered", "signal", "rule"]


def parse_ledger(text: str) -> list[dict]:
    rows = []
    for line in text.splitlines():
        parts = [p.strip() for p in line.split(" | ")]
        if len(parts) < len(COLS) or not re.match(r"\d{4}-\d{2}-\d{2}", parts[0]):
            continue
        rows.append(dict(zip(COLS, parts)))
    return rows


def num(s: str) -> float | None:
    m = re.search(r"[\d.]+", s.replace(",", ""))
    if not m:
        return None
    v = float(m.group())
    return v * 1000 if s.lower().rstrip().endswith("k") else v


def ledger_summary(text: str) -> dict:
    rows = parse_ledger(text)
    ctx = [v for v in (num(r["ctx"]) for r in rows) if v is not None]
    # a signal needs two ledger lines before the retro, and so this scan, may act on it
    signals = Counter(r["signal"].lower() for r in rows if r["signal"] and r["signal"] not in ("-", "none"))
    return {
        "lines": len(rows),
        "median_ctx": statistics.median(ctx) if ctx else None,
        "orchestrators": dict(Counter(r["orchestrator"] for r in rows)),
        "signals": dict(signals.most_common()),
        "actionable": [s for s, n in signals.items() if n >= 2],
        "rules_changed": [(r["date"], r["rule"]) for r in rows if r["rule"] and r["rule"] not in ("-", "none")],
    }


def api_surface(text: str) -> dict:
    # `'event.name': SomeType;` lines of the engine's event maps
    events = sorted(set(re.findall(r"^\s+'([a-z][\w]*\.[\w.]+)': [A-Z]\w*;", text, re.M)))
    types = sorted(set(re.findall(r"^\s*export type (\w+)\b", text, re.M)))
    return {"events": events, "types": types}


def api_diff(old: dict, new: dict) -> dict:
    return {
        k: {"added": sorted(set(new[k]) - set(old[k])), "removed": sorted(set(old[k]) - set(new[k]))}
        for k in ("events", "types")
    }


def main(argv: list[str]) -> int:
    if len(argv) < 2 or argv[1] not in ("ledger", "api"):
        print(__doc__)
        return 2
    if argv[1] == "ledger":
        path = Path(argv[2] if len(argv) > 2 else ".claude/retro-ledger.md")
        print(json.dumps(ledger_summary(path.read_text()), indent=2))
        return 0
    if len(argv) < 3:
        print(__doc__)
        return 2
    surface = api_surface(Path(argv[2]).read_text())
    if "--write" in argv:
        SNAPSHOT.write_text(json.dumps(surface, indent=1) + "\n")
    elif "--diff" in argv:
        print(json.dumps(api_diff(json.loads(SNAPSHOT.read_text()), surface), indent=2))
    else:
        print(json.dumps(surface, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
