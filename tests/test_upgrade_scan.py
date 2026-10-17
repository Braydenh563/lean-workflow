"""upgrade-scan's evidence helpers, and the rules its SKILL.md promises."""

import importlib.util
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKILL = ROOT / "skills" / "upgrade-scan"
spec = importlib.util.spec_from_file_location("scan", SKILL / "scan.py")
scan = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scan)

LEDGER = """date | branch | tier | orchestrator | turns | ctx/turn | cost r/w/o | agents | delivered | waste signal | rule changed
2026-10-01 | a | M | opus | 40 | 90k | 40/30/30 | 2 | yes | cold gaps | -
2026-10-08 | b | S | sonnet | 20 | 60k | 50/20/30 | 0 | yes | cold gaps | none
2026-10-15 | c | M | opus | 30 | 120k | 45/25/30 | 1 | yes | big context | shorter handover
"""


def test_ledger_summary_marks_only_repeated_signals_actionable():
    s = scan.ledger_summary(LEDGER)
    assert s["lines"] == 3
    assert s["median_ctx"] == 90_000
    assert s["actionable"] == ["cold gaps"]
    assert s["rules_changed"] == [("2026-10-15", "shorter handover")]


def test_ledger_summary_ignores_header_and_blank_lines():
    assert scan.ledger_summary("")["lines"] == 0


def test_api_diff_reports_added_and_removed():
    old = scan.api_surface("  'a.b': AIn;\n  'c.d': CIn;\nexport type Old = 1\n")
    new = scan.api_surface("  'a.b': AIn;\n  'e.f': EIn;\nexport type New = 1\n")
    d = scan.api_diff(old, new)
    assert d["events"] == {"added": ["e.f"], "removed": ["c.d"]}
    assert d["types"] == {"added": ["New"], "removed": ["Old"]}


def test_snapshot_lists_the_events_the_hooks_use():
    import json

    events = set(json.loads((SKILL / "api-snapshot.json").read_text())["events"])
    src = (ROOT / "hooks" / "register.tsx").read_text()
    used = set(re.findall(r"\bon\('([a-z]+\.[a-z.]+)'", src))
    assert used <= events, used - events


def test_skill_never_merges_and_never_routes_to_fable():
    text = (SKILL / "SKILL.md").read_text()
    assert "Never route to Fable" in text
    assert "Never merge" in text
    assert "no auto-merge" in text.lower()


def test_routing_table_has_no_fable_rung():
    coach = (ROOT / "hooks" / "coach.ts").read_text()
    assert not re.search(r"RATE[^\n]*fable", coach, re.I)
    for agent in (ROOT / "agents").glob("*.md"):
        assert not re.search(r"^model:\s*fable", agent.read_text(), re.I | re.M), agent.name
