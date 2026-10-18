"""The Stop hook keeps an active work order running and never loops past its cap."""
import json
import os
import subprocess
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "keep-going.sh"


def stop(cwd: Path, now: int | None = None) -> str:
    payload = json.dumps({"cwd": str(cwd), "hook_event_name": "Stop", "stop_hook_active": False})
    env = {**os.environ, **({"LEAN_NOW": str(now)} if now is not None else {})}
    return subprocess.run(["bash", str(SCRIPT)], input=payload, capture_output=True, text=True, check=True, env=env).stdout


def git(repo: Path, *args: str) -> str:
    out = subprocess.run(["git", "-c", "user.email=t@t", "-c", "user.name=t", *args], cwd=repo, check=True, capture_output=True, text=True)
    return out.stdout.strip()


def order(tmp_path: Path, body: str) -> Path:
    (tmp_path / ".claude").mkdir(exist_ok=True)
    (tmp_path / ".claude" / "work-order.md").write_text(body)
    return tmp_path


def test_no_order_or_inactive_order_lets_claude_stop(tmp_path):
    assert stop(tmp_path) == ""
    assert stop(order(tmp_path, "mode: continue\nstatus: done\n- [ ] x\n")) == ""


def test_active_order_blocks_with_the_next_item_as_valid_json(tmp_path):
    out = json.loads(stop(order(tmp_path, 'mode: continue\nstatus: active\n- [x] a\n- [ ] fix "quoted" \\ bug\n')))
    assert out["decision"] == "block"
    assert 'Next: fix "quoted" \\ bug' in out["reason"]


def test_empty_queue_refills_in_continue_but_ends_in_ship(tmp_path):
    assert "Refill" in json.loads(stop(order(tmp_path, "mode: continue\nstatus: active\n- [x] a\n")))["reason"]
    assert stop(order(tmp_path, "mode: ship\nstatus: active\n- [x] a\n")) == ""


def test_cap_stops_the_loop_and_marks_the_order(tmp_path):
    path = order(tmp_path, "mode: continue\nstatus: active\nmax-continues: 2\n- [ ] a\n")
    assert stop(path) and stop(path)
    assert stop(path) == ""
    assert "status: stopped (continue cap reached)" in (path / ".claude" / "work-order.md").read_text()


T0 = 1_800_000_000  # a fixed "now": the hook reads LEAN_NOW instead of the clock


def started(repo: Path, body: str) -> Path:
    """An order written at T0: the idle clock's first reading is the order file's age."""
    path = order(repo, body)
    os.utime(path / ".claude" / "work-order.md", (T0, T0))
    return path


def status(repo: Path) -> str:
    return next(l for l in (repo / ".claude" / "work-order.md").read_text().splitlines() if l.startswith("status:"))


def test_no_commit_for_60_minutes_stops_the_run_and_marks_the_order(tmp_path):
    git(tmp_path, "init", "-q")
    git(tmp_path, "commit", "-q", "--allow-empty", "-m", "init")
    path = started(tmp_path, "mode: continue\nstatus: active\n- [ ] a\n")
    assert stop(path, T0)  # first fire starts the clock and keeps the run going
    assert stop(path, T0 + 59 * 60)
    assert stop(path, T0 + 60 * 60) == ""
    assert status(path) == "status: stopped (no commit in 60 minutes)"


def test_a_new_commit_restarts_the_idle_clock(tmp_path):
    git(tmp_path, "init", "-q")
    git(tmp_path, "commit", "-q", "--allow-empty", "-m", "init")
    path = started(tmp_path, "mode: continue\nstatus: active\n- [ ] a\n")
    assert stop(path, T0)
    git(tmp_path, "commit", "-q", "--allow-empty", "-m", "work")
    assert stop(path, T0 + 50 * 60)  # new HEAD: clock restarts here
    assert stop(path, T0 + 100 * 60)  # 50 minutes since that commit
    assert status(path) == "status: active"
    assert stop(path, T0 + 111 * 60) == ""
    assert "no commit in 60 minutes" in status(path)


def test_max_idle_minutes_in_the_order_overrides_the_default(tmp_path):
    path = started(tmp_path, "mode: continue\nstatus: active\nmax-idle-minutes: 10\n- [ ] a\n")
    assert stop(path, T0)
    assert stop(path, T0 + 9 * 60)
    assert stop(path, T0 + 10 * 60) == ""
    assert status(path) == "status: stopped (no commit in 10 minutes)"


def test_a_repo_without_commits_still_gets_the_idle_guard(tmp_path):
    path = started(tmp_path, "mode: continue\nstatus: active\n- [ ] a\n")
    assert stop(path, T0)
    assert stop(path, T0 + 61 * 60) == ""


def test_an_order_that_is_not_active_is_left_alone(tmp_path):
    path = started(tmp_path, "mode: continue\nstatus: done\n- [ ] a\n")
    assert stop(path, T0) == "" and stop(path, T0 + 10 * 3600) == ""
    assert status(path) == "status: done"


def test_first_run_prints_nothing_on_stderr(tmp_path):
    repo = order(tmp_path, "mode: continue\nstatus: active\n- [ ] a\n")
    r = subprocess.run(["bash", str(SCRIPT)], input=json.dumps({"cwd": str(repo)}), capture_output=True, text=True, check=True)
    assert r.stderr == "" and json.loads(r.stdout)["decision"] == "block"
