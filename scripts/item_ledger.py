#!/usr/bin/env python3
"""Per-item ledger: which rung did each work-order item use, and did it need rework?

  item_ledger.py add --type bug --rung sonnet --rework 0 "fix the parser"   append a line
  item_ledger.py summary [PATH ...]                                        counts per type and rung, and rung moves

The ledger is .claude/item-ledger.md, one line per finished item:
  date | item | type | rung | rework | note
`rework` counts the rounds an item came back after its first "done": a reviewer finding, a red CI, a fix that
returned. upgrade-scan reads the summary and moves a task type between rungs only on repeated evidence.
Standard library only; Fable rows are kept but never produce a move (Fable stays opt-in).
"""
import argparse
import json
import re
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path

DEFAULT = Path(".claude/item-ledger.md")
HEADER = "date | item | type | rung | rework | note"
RUNGS = ["haiku", "sonnet", "opus"]  # cheapest to dearest; "fable" is accepted but is not on the ladder
MIN_ITEMS = 3  # items of one type on one rung before a move is proposed
MIN_DEMOTE = 4  # more, to move down: a clean record on few items proves little
MIN_DATES = 2  # evidence from one day is one observation
REWORK_RATE = 1 / 3  # a third of the items coming back moves the type up a rung


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9-]+", "-", s.strip().lower()).strip("-")


def parse(text: str) -> list[dict]:
    rows = []
    for line in text.splitlines():
        parts = [p.strip() for p in re.split(r"\s*\|\s*", line.strip())]
        if len(parts) < 5 or not re.match(r"\d{4}-\d{2}-\d{2}$", parts[0]):
            continue
        try:
            rework = int(parts[4])
        except ValueError:
            continue
        rows.append({"date": parts[0], "item": parts[1], "type": parts[2], "rung": parts[3], "rework": rework})
    return rows


def stats(rows: list[dict]) -> dict:
    """{type: {rung: {n, reworked, rework_rounds, dates}}}"""
    out: dict = defaultdict(lambda: defaultdict(lambda: {"n": 0, "reworked": 0, "rework_rounds": 0, "dates": set()}))
    for r in rows:
        s = out[r["type"]][r["rung"]]
        s["n"] += 1
        s["reworked"] += 1 if r["rework"] > 0 else 0
        s["rework_rounds"] += r["rework"]
        s["dates"].add(r["date"])
    return out


def moves(rows: list[dict]) -> dict:
    """Rung moves with their evidence, plus what is being watched. Pure; the tests pin the thresholds."""
    out, watching = [], []
    for typ, by_rung in sorted(stats(rows).items()):
        for rung, s in sorted(by_rung.items()):
            if rung not in RUNGS:
                continue
            i = RUNGS.index(rung)
            rate = s["reworked"] / s["n"]
            enough = s["n"] >= MIN_ITEMS and len(s["dates"]) >= MIN_DATES
            if rate >= REWORK_RATE and i < len(RUNGS) - 1 and enough:
                out.append({"type": typ, "from": rung, "to": RUNGS[i + 1], "why": f"{s['reworked']} of {s['n']} {typ} items on {rung} needed rework ({len(s['dates'])} days)"})
            elif rate >= REWORK_RATE:
                watching.append(f"{typ} on {rung}: {s['reworked']} of {s['n']} reworked, not yet {MIN_ITEMS} items over {MIN_DATES} days")
            elif i > 0 and s["reworked"] == 0 and s["n"] >= MIN_DEMOTE and len(s["dates"]) >= MIN_DATES:
                lower = by_rung.get(RUNGS[i - 1])
                if lower and lower["n"] >= MIN_ITEMS and lower["reworked"] / lower["n"] >= REWORK_RATE:
                    continue  # the cheaper rung already failed on this type
                out.append({"type": typ, "from": rung, "to": RUNGS[i - 1], "why": f"{s['n']} {typ} items on {rung}, none needed rework ({len(s['dates'])} days): try {RUNGS[i - 1]}"})
    return {"moves": out, "watching": watching}


def summary(texts: list[str]) -> dict:
    rows = [r for t in texts for r in parse(t)]
    table = {
        typ: {rung: {"n": s["n"], "reworked": s["reworked"], "rework_rounds": s["rework_rounds"], "days": len(s["dates"])} for rung, s in sorted(by.items())}
        for typ, by in sorted(stats(rows).items())
    }
    return {"items": len(rows), "types": table, **moves(rows)}


def add(path: Path, item: str, typ: str, rung: str, rework: int, note: str = "", today: str | None = None) -> str:
    rung = rung.strip().lower()
    if rung not in RUNGS + ["fable"]:
        raise SystemExit(f"rung must be one of {', '.join(RUNGS)} (or fable, when the user named it): got {rung!r}")
    if rework < 0:
        raise SystemExit("rework is a count of rounds, 0 or more")
    clean = lambda s: " ".join(s.replace("|", "/").split())  # noqa: E731 - a pipe or newline would break the line
    line = f"{today or date.today().isoformat()} | {clean(item)} | {slug(typ) or 'other'} | {rung} | {rework} | {clean(note)}"
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists() or not path.read_text().strip():
        path.write_text(HEADER + "\n")
    with path.open("a") as f:
        f.write(line + "\n")
    return line


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("add")
    a.add_argument("item")
    a.add_argument("--type", required=True, help="kind of task: lookup, mechanical, bug, feature, refactor, ui, security, docs, test, design, review, release")
    a.add_argument("--rung", required=True, help="haiku, sonnet or opus: the model that did the work")
    a.add_argument("--rework", type=int, default=0, help="rounds the item came back after its first done")
    a.add_argument("--note", default="")
    a.add_argument("--path", default=str(DEFAULT))
    a.add_argument("--date", default=None)
    s = sub.add_parser("summary")
    s.add_argument("paths", nargs="*", default=[str(DEFAULT)])
    args = ap.parse_args(argv)
    if args.cmd == "add":
        print(add(Path(args.path), args.item, args.type, args.rung, args.rework, args.note, args.date))
        return 0
    print(json.dumps(summary([Path(p).read_text() for p in args.paths if Path(p).exists()]), indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
