"""upgrade-scan's evidence helpers, and the rules its SKILL.md promises."""

import importlib.util
import json
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


CHANGELOG = """# Changelog

## 2.1.302

- Added `CLAUDE_CODE_AUTO_MODE_MODEL` to choose the classifier model
- Fixed a prompt cache miss when a tool added mid-session was loaded again
- Fixed rows in the agents view staying blank after moving down a long list
- Fixed the spinner colour

## 2.1.300

- Added a `userConfig` field type to plugin manifests
- Fixed hooks not firing in a worktree

## 2.1.299

- Fixed the Stop hook running twice
"""

NOTES = """# Claude Platform release notes

### October 15, 2026

* [Fast mode](https://example.com/#claude-managed-agents) is out of research preview for Claude Opus 5.5.
* The [Compliance API](https://example.com/x) returns user preferences.

### October 9, 2026

* Claude Haiku 4 is deprecated and retires on January 5, 2027.
* New dashboard colours.

### October 1, 2026

* Pricing for Sonnet changed to $3 per million input tokens.
"""


def test_changelog_keeps_only_versions_after_since_and_only_lines_that_touch_the_plugin():
    r = scan.parse_changelog(CHANGELOG, since="2.1.299")
    assert r["newest"] == "2.1.302"
    assert [v["version"] for v in r["versions"]] == ["2.1.302", "2.1.300"]
    lines = [h["line"] for v in r["versions"] for h in v["hits"]]
    assert any("prompt cache miss" in l for l in lines)
    assert any("agents view" in l for l in lines)  # an agents line is in scope; a spinner colour is not
    assert not any("spinner" in l for l in lines)
    assert not any("Stop hook running twice" in l for l in lines)  # 2.1.299 is not after 2.1.299
    assert scan.parse_changelog(CHANGELOG)["scanned"] == 3


def test_changelog_topics_name_why_a_line_matters():
    hits = scan.parse_changelog(CHANGELOG, since="2.1.299")["versions"][1]["hits"]
    assert {t for h in hits for t in h["topics"]} >= {"plugins", "hooks"}


def test_release_notes_keep_model_price_and_retirement_lines_after_the_date():
    r = scan.parse_notes(NOTES, since="2026-10-01")
    assert r["newest"] == "2026-10-15"
    assert [e["date"] for e in r["entries"]] == ["2026-10-15", "2026-10-09"]
    flat = " ".join(h for e in r["entries"] for h in e["hits"])
    assert "Claude Opus 5.5" in flat and "retires" in flat
    assert "Compliance API" not in flat and "dashboard colours" not in flat
    assert "example.com" not in flat  # link addresses are dropped


def test_release_notes_link_targets_do_not_count_as_a_model_mention():
    r = scan.parse_notes("### October 15, 2026\n\n* The [Platform](https://x/claude-managed-agents) changed.\n")
    assert r["entries"] == []


def test_last_scan_file_names_the_sources_and_the_baseline():
    last = json.loads((SKILL / "last-scan.json").read_text())
    assert last["claude_code"] and last["notes"]
    assert last["sources"]["claude_code_changelog"].endswith("anthropics/claude-code/main/CHANGELOG.md")
    assert last["sources"]["anthropic_release_notes"].startswith("https://platform.claude.com/docs/en/release-notes")


def test_skill_reads_both_release_sources_with_the_helpers():
    text = (SKILL / "SKILL.md").read_text()
    for part in ("scan.py changelog", "scan.py notes", "scan.py items", "last-scan.json", "item-ledger"):
        assert part in text, part
