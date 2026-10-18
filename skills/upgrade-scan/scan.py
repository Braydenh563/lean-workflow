#!/usr/bin/env python3
"""Evidence helpers for the upgrade-scan skill.

  scan.py ledger [PATH]            summarise a retro ledger (default .claude/retro-ledger.md)
  scan.py api TYPES.d.ts           list the hook events and exported types in a plugin API file
  scan.py api TYPES.d.ts --diff    compare them with skills/upgrade-scan/api-snapshot.json
  scan.py api TYPES.d.ts --write   replace the snapshot (only in the scan PR, after reading the diff)
  scan.py items LEDGER [LEDGER ...]  per-item ledgers (scripts/item_ledger.py): rework by task type and rung, and rung moves
  scan.py changelog FILE [--since X.Y.Z]   the Claude Code CHANGELOG.md: versions after X.Y.Z, only the lines that touch this plugin
  scan.py notes FILE [--since YYYY-MM-DD]  Anthropic release notes (.md): dated entries after the date, only model, price and retirement lines
  scan.py pages NAME=FILE [NAME=FILE ...] [--write]   saved plan-limit and pricing pages: changed since the last scan (by hash), and the limit/plan/model lines
  scan.py last [--write --claude-code X.Y.Z --notes YYYY-MM-DD]   what the last scan read (last-scan.json)

Both sources are about a megabyte: never print or read them whole; these commands keep the matching lines.
"""
import hashlib
import json
import re
import statistics
import sys
from collections import Counter
from pathlib import Path

SNAPSHOT = Path(__file__).with_name("api-snapshot.json")
LAST = Path(__file__).with_name("last-scan.json")
SOURCES = {
    "claude_code_changelog": "https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md",
    "anthropic_release_notes": "https://platform.claude.com/docs/en/release-notes/overview.md",
}
# Pages the plan table in hooks/plans.ts rests on; `pages` hashes them so a rewrite is noticed.
PLAN_PAGES = {
    "pro_max_plan": "https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan",
    "team_enterprise_plan": "https://support.claude.com/en/articles/11845131-use-claude-code-with-your-team-or-enterprise-plan",
    "costs": "https://code.claude.com/docs/en/costs",
    "pricing": "https://claude.com/pricing",
    "models_overview": "https://platform.claude.com/docs/en/about-claude/models/overview",
}
PLAN_LINES = re.compile(r"limit|five.hour|5.hour|weekly|session|seat|usage credit|max 5x|max 20x|\bpro\b|team|enterprise|opus|sonnet|haiku|fable|deprecat|retire", re.I)
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


def item_ledger():
    import importlib.util

    path = Path(__file__).resolve().parents[2] / "scripts" / "item_ledger.py"
    spec = importlib.util.spec_from_file_location("item_ledger", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# what this plugin depends on, by topic: a changelog line that matches none of these is noise to the scan
TOPICS = {
    "hooks": r"\bhooks?\b|\bPreToolUse\b|\bPostToolUse\b|\bSessionStart\b|\bStop hook\b|\bprompt\.compose\b",
    "plugins": r"\bplugins?\b|\bmarketplace\b|\buserConfig\b|\bplugin\.json\b|\bmods?\b",
    "skills": r"\bskills?\b|\bslash commands?\b",
    "agents": r"\bagents?\b|\bsubagents?\b|\bworktree\b",
    "limits": r"\busage limits?\b|\brate limits?\b|\b5-hour\b|\bweekly\b|\bsession usage\b|\bcredits?\b",
    "cache": r"\bprompt cache\b|\bcache (miss|hit|read|write)|\bcompact(ion|ing)?\b",
    "models": r"\b(opus|sonnet|haiku|fable)\b|\bmodel (alias|id)s?\b|\bdefault model\b",
}
MODEL_LINE = re.compile(r"claude-[a-z0-9.-]+|\b(opus|sonnet|haiku|fable)\b|\bdeprecat|\bretire|\bpric(e|ing)|\bper million\b|\bcontext window\b|\bfast mode\b|\brate limit", re.I)


def vtuple(v: str) -> tuple:
    return tuple(int(x) for x in re.findall(r"\d+", v)[:3])


def parse_changelog(text: str, since: str | None = None) -> dict:
    """Versions newer than `since` (`## 2.1.302` headings), each with the bullets that match a topic."""
    out, cur = [], None
    for line in text.splitlines():
        m = re.match(r"##\s+v?(\d+\.\d+\.\d+)\s*$", line)
        if m:
            cur = {"version": m.group(1), "hits": []}
            out.append(cur)
        elif cur and re.match(r"\s*[-*]\s", line):
            topics = [t for t, rx in TOPICS.items() if re.search(rx, line, re.I)]
            if topics:
                cur["hits"].append({"topics": topics, "line": line.strip()[:300]})
    if since:
        out = [v for v in out if vtuple(v["version"]) > vtuple(since)]
    return {"newest": out[0]["version"] if out else since, "versions": [v for v in out if v["hits"]], "scanned": len(out)}


def parse_notes(text: str, since: str | None = None) -> dict:
    """Dated entries (`### October 15, 2026`) after `since`, each with the bullets about models, prices or retirements."""
    from datetime import datetime

    def day(h: str):
        for fmt in ("%B %d, %Y", "%Y-%m-%d", "%b %d, %Y"):
            try:
                return datetime.strptime(h.strip(), fmt).date().isoformat()
            except ValueError:
                pass
        return None

    out, cur = [], None
    for line in text.splitlines():
        m = re.match(r"#{2,4}\s+(.+?)\s*$", line)
        if m and day(m.group(1)):
            cur = {"date": day(m.group(1)), "hits": []}
            out.append(cur)
        elif cur and re.match(r"\s*[-*]\s", line):
            text_only = re.sub(r"\]\([^)]*\)", "]", line.strip())  # a link's address is not the entry's subject
            if MODEL_LINE.search(text_only):
                cur["hits"].append(text_only[:400])
    if since:
        out = [e for e in out if e["date"] > since]
    return {"newest": max((e["date"] for e in out), default=since), "entries": [e for e in out if e["hits"]], "scanned": len(out)}


def page_report(pages: dict[str, str], known: dict[str, str]) -> dict:
    """Per page: its hash, whether it differs from the last scan's, and the sentences that talk about limits, plans or models.
    Sentences with a figure (digits with %, x, hours, messages) come first, so a number is not cut off by prose."""
    out = {}
    for name, text in pages.items():
        digest = hashlib.sha256(re.sub(r"\s+", " ", text).strip().encode()).hexdigest()[:16]
        parts = [p.strip() for line in text.splitlines() for p in re.split(r"(?<=[.!?])\s+", line) if PLAN_LINES.search(p)]
        parts = [p[:300] for p in parts]
        parts.sort(key=lambda p: not re.search(r"\d+\s*(%|x\b|hours?|messages?|tokens?|days?)", p, re.I))
        out[name] = {
            "hash": digest,
            "status": "new" if name not in known else "unchanged" if known[name] == digest else "changed",
            "lines": parts[:40],
        }
    return out


def read_last() -> dict:
    return json.loads(LAST.read_text()) if LAST.exists() else {"claude_code": None, "notes": None, "sources": SOURCES}


def flag(argv: list[str], name: str) -> str | None:
    return argv[argv.index(name) + 1] if name in argv and argv.index(name) + 1 < len(argv) else None


def main(argv: list[str]) -> int:
    if len(argv) < 2 or argv[1] not in ("ledger", "api", "items", "changelog", "notes", "last", "pages"):
        print(__doc__)
        return 2
    if argv[1] == "items":
        mod = item_ledger()
        print(json.dumps(mod.summary([Path(p).read_text() for p in argv[2:] if Path(p).exists()]), indent=2))
        return 0
    if argv[1] in ("changelog", "notes"):
        if len(argv) < 3:
            print(__doc__)
            return 2
        last = read_last()
        since = flag(argv, "--since") or last.get("claude_code" if argv[1] == "changelog" else "notes")
        parse = parse_changelog if argv[1] == "changelog" else parse_notes
        print(json.dumps(parse(Path(argv[2]).read_text(), since), indent=2))
        return 0
    if argv[1] == "pages":
        files = dict(a.split("=", 1) for a in argv[2:] if "=" in a)
        if not files:
            print(__doc__)
            return 2
        last = read_last()
        report = page_report({n: Path(f).read_text() for n, f in files.items()}, last.get("pages", {}))
        if "--write" in argv:
            last["pages"] = {**last.get("pages", {}), **{n: r["hash"] for n, r in report.items()}}
            last["sources"] = {**SOURCES, **PLAN_PAGES}
            LAST.write_text(json.dumps(last, indent=1) + "\n")
        print(json.dumps(report, indent=2))
        return 0
    if argv[1] == "last":
        if "--write" in argv:
            last = read_last()
            last["claude_code"] = flag(argv, "--claude-code") or last.get("claude_code")
            last["notes"] = flag(argv, "--notes") or last.get("notes")
            last["sources"] = {**SOURCES, **PLAN_PAGES}
            LAST.write_text(json.dumps(last, indent=1) + "\n")
        print(json.dumps(read_last(), indent=2))
        return 0
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
