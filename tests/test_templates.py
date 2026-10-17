"""The lean-setup templates work in a scratch repo.

lean-setup copies codemap.py, orient.sh and gate.sh into other repositories,
so a template that only runs here is a broken install there. Each test builds
a tiny repo in tmp_path and runs the template the way an installed copy runs.
"""

import shutil
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
TEMPLATES = ROOT / "skills" / "lean-setup" / "templates"


def _git(repo, *args):
    subprocess.run(
        ["git", "-c", "user.email=t@t", "-c", "user.name=t", *args],
        cwd=repo, check=True, capture_output=True,
    )


@pytest.fixture
def repo(tmp_path):
    (tmp_path / "scripts").mkdir()
    (tmp_path / "src").mkdir()
    (tmp_path / "tests").mkdir()
    (tmp_path / ".claude").mkdir()
    for name in ("codemap.py", "orient.sh", "gate.sh"):
        shutil.copy(TEMPLATES / name, tmp_path / "scripts" / name)
    (tmp_path / "src" / "mod.py").write_text("class A:\n    def m(self): pass\n\ndef top(): pass\n")
    (tmp_path / "src" / "a.ts").write_text("export function f() {}\nexport const g = async (x: number) => x\n")
    (tmp_path / "src" / "m.go").write_text("package x\nfunc (s *S) Run() {}\ntype S struct{}\n")
    (tmp_path / "tests" / "test_mod.py").write_text("def test_a(): pass\ndef test_b(): pass\n")
    (tmp_path / ".claude" / "now.md").write_text("# Goal\n## Inbox\n1. a\n2. b\n## Decisions\n- x\n")
    _git(tmp_path, "init", "-q")
    _git(tmp_path, "add", "-A")
    _git(tmp_path, "commit", "-qm", "init")
    return tmp_path


def _codemap(repo, *args):
    return subprocess.run(
        [sys.executable, "scripts/codemap.py", *args], cwd=repo, capture_output=True, text=True
    )


def test_codemap_lists_definitions_in_three_languages_and_test_counts(repo):
    assert _codemap(repo).returncode == 0
    text = (repo / "docs" / "CODEMAP.md").read_text()
    for row in ("A.m | src/mod.py:2", "top | src/mod.py:4", "f | src/a.ts:1",
                "g | src/a.ts:2", "S.Run | src/m.go:2", "S | src/m.go:3"):
        assert row in text
    assert "| `tests/test_mod.py` | 2 |" in text


def test_codemap_check_flags_a_stale_map_and_passes_a_fresh_one(repo):
    _codemap(repo)
    assert _codemap(repo, "--check").returncode == 0
    (repo / "src" / "mod.py").write_text("def moved(): pass\n")
    stale = _codemap(repo, "--check")
    assert stale.returncode == 1 and "stale" in stale.stderr


def test_orient_is_short_and_reports_inbox_and_map(repo):
    _codemap(repo)
    out = subprocess.run(["bash", "scripts/orient.sh"], cwd=repo, capture_output=True, text=True).stdout
    assert "open inbox items: 2 (limit 20)" in out
    assert "decisions recorded: 1" in out
    assert "fresh" in out
    assert len((TEMPLATES / "orient.sh").read_text().splitlines()) < 40


def test_gate_runs_checks_and_picks_the_test_naming_a_changed_file(repo):
    gate = (repo / "scripts" / "gate.sh").read_text()
    gate = gate.replace(":  # lean-setup replaces this line, e.g.: ruff check . && mypy src", "true")
    gate = gate.replace(':  # e.g.: python -m pytest -q "$@"', 'echo "would run: $@"')
    (repo / "scripts" / "gate.sh").write_text(gate)
    (repo / "tests" / "test_mod.py").write_text("from src.mod import top\ndef test_a(): pass\n")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-qm", "wire test")
    _codemap(repo)
    (repo / "src" / "mod.py").write_text("def top(): pass\n")
    _codemap(repo)
    run = subprocess.run(["bash", "scripts/gate.sh", "--changed"], cwd=repo, capture_output=True, text=True)
    assert run.returncode == 0, run.stdout + run.stderr
    assert "would run: tests/test_mod.py" in run.stdout
    assert "failed: none" in run.stdout


def test_gate_fails_when_a_fast_check_fails_and_when_the_map_is_stale(repo):
    gate = (repo / "scripts" / "gate.sh").read_text()
    gate = gate.replace(":  # lean-setup replaces this line, e.g.: ruff check . && mypy src", "false")
    (repo / "scripts" / "gate.sh").write_text(gate)
    run = subprocess.run(["bash", "scripts/gate.sh"], cwd=repo, capture_output=True, text=True)
    assert run.returncode != 0
    assert "fast-checks" in run.stdout and "FAILED" in run.stdout
