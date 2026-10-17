"""The Stop hook keeps an active work order running and never loops past its cap."""
import json
import subprocess
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "keep-going.sh"


def stop(cwd: Path) -> str:
    payload = json.dumps({"cwd": str(cwd), "hook_event_name": "Stop", "stop_hook_active": False})
    return subprocess.run(["bash", str(SCRIPT)], input=payload, capture_output=True, text=True, check=True).stdout


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
