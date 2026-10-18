"""The per-item ledger: the line format, the moves it proposes, and the evidence thresholds."""

import importlib.util
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("item_ledger", ROOT / "scripts" / "item_ledger.py")
il = importlib.util.module_from_spec(spec)
spec.loader.exec_module(il)


def lines(*rows):
    """rows: (date, type, rung, rework)"""
    return "date | item | type | rung | rework | note\n" + "".join(f"{d} | item {i} | {t} | {r} | {w} | \n" for i, (d, t, r, w) in enumerate(rows))


def test_add_creates_the_ledger_with_a_header_and_cleans_the_fields(tmp_path):
    path = tmp_path / ".claude" / "item-ledger.md"
    line = il.add(path, "fix | the\nparser", "Bug Fix", "Sonnet", 1, "came back once", today="2026-10-17")
    assert line == "2026-10-17 | fix / the parser | bug-fix | sonnet | 1 | came back once"
    il.add(path, "second", "ui", "haiku", 0, today="2026-10-18")
    text = path.read_text()
    assert text.startswith(il.HEADER + "\n") and text.count("\n") == 3
    assert [r["rung"] for r in il.parse(text)] == ["sonnet", "haiku"]


def test_add_refuses_an_unknown_rung_and_negative_rework(tmp_path):
    for bad in (dict(rung="gpt"), dict(rework=-1)):
        args = dict(item="x", typ="bug", rung="haiku", rework=0) | bad
        try:
            il.add(tmp_path / "l.md", **args)
        except SystemExit as e:
            assert e.code
        else:
            raise AssertionError("accepted " + str(bad))


def test_a_line_whose_trailing_space_was_stripped_still_parses():
    assert il.parse("2026-10-17 | a | bug | sonnet | 2 |")[0]["rework"] == 2


def test_rework_on_a_cheap_rung_moves_the_type_up_one_rung():
    text = lines(("2026-10-01", "bug", "haiku", 1), ("2026-10-02", "bug", "haiku", 0), ("2026-10-03", "bug", "haiku", 2))
    m = il.summary([text])["moves"]
    assert m == [{"type": "bug", "from": "haiku", "to": "sonnet", "why": "2 of 3 bug items on haiku needed rework (3 days)"}]


def test_a_clean_record_on_a_dear_rung_moves_the_type_down_but_only_after_four_items():
    three = lines(*[(f"2026-10-0{d}", "docs", "opus", 0) for d in (1, 2, 3)])
    assert il.summary([three])["moves"] == []
    four = lines(*[(f"2026-10-0{d}", "docs", "opus", 0) for d in (1, 2, 3, 4)])
    assert il.summary([four])["moves"][0]["to"] == "sonnet"


def test_no_move_from_one_days_evidence_and_the_shortfall_is_listed_as_watching():
    text = lines(*[("2026-10-01", "bug", "haiku", 1)] * 3)
    s = il.summary([text])
    assert s["moves"] == [] and "not yet 3 items over 2 days" in s["watching"][0]


def test_no_demotion_when_the_cheaper_rung_already_failed_on_that_type():
    text = lines(
        *[(f"2026-10-0{d}", "bug", "sonnet", 0) for d in (1, 2, 3, 4)],
        *[(f"2026-10-0{d}", "bug", "haiku", 1) for d in (5, 6, 7)],
    )
    moves = il.summary([text])["moves"]
    assert [(m["from"], m["to"]) for m in moves] == [("haiku", "sonnet")]


def test_fable_rows_are_counted_but_never_move_anything():
    text = lines(*[(f"2026-10-0{d}", "design", "fable", 1) for d in (1, 2, 3, 4)])
    s = il.summary([text])
    assert s["items"] == 4 and s["moves"] == [] and s["types"]["design"]["fable"]["n"] == 4


def test_no_rung_ever_moves_to_fable_or_past_opus():
    text = lines(*[(f"2026-10-0{d}", "design", "opus", 1) for d in (1, 2, 3)])
    assert il.summary([text])["moves"] == []


def test_the_command_line_adds_and_summarises_and_scan_py_reads_it(tmp_path):
    path = tmp_path / "item-ledger.md"
    for d, w in (("2026-10-01", 1), ("2026-10-02", 1), ("2026-10-03", 0)):
        subprocess.run([sys.executable, str(ROOT / "scripts" / "item_ledger.py"), "add", "--type", "ui", "--rung", "haiku", "--rework", str(w), "--date", d, "--path", str(path), "restyle"], check=True, capture_output=True)
    out = subprocess.run([sys.executable, str(ROOT / "skills" / "upgrade-scan" / "scan.py"), "items", str(path)], check=True, capture_output=True, text=True).stdout
    assert '"to": "sonnet"' in out and '"items": 3' in out


def test_the_top_rung_with_enough_rework_is_not_reported_as_short_of_evidence():
    s = il.summary([lines(("2026-10-01", "bug", "opus", 1), ("2026-10-02", "bug", "opus", 1), ("2026-10-03", "bug", "opus", 1))])
    assert s["moves"] == [] and s["watching"] == []
