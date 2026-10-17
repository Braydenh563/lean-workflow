"""The skills, the autopilot that triggers them, and the docs agree with each other."""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODES = ["focus", "triage", "review", "budget", "release"]


def front(path: Path) -> dict:
    m = re.match(r"---\n(.*?)\n---\n", path.read_text(), re.S)
    assert m, f"{path} has no frontmatter"
    return dict(re.findall(r"^(\w+):\s*(.+)$", m.group(1), re.M))


def test_every_skill_has_a_name_matching_its_folder_and_a_description_with_a_trigger():
    for skill in (ROOT / "skills").glob("*/SKILL.md"):
        f = front(skill)
        assert f["name"] == skill.parent.name, skill
        assert len(f["description"]) > 60 and ("Use when" in f["description"] or "use when" in f["description"] or "Use " in f["description"]), skill


def test_each_mode_is_a_skill_and_the_autopilot_names_its_trigger():
    autopilot = (ROOT / "hooks" / "register.tsx").read_text()
    modes_ts = (ROOT / "hooks" / "modes.ts").read_text()
    for mode in MODES:
        assert (ROOT / "skills" / mode / "SKILL.md").exists(), mode
        assert f"'{mode}'" in modes_ts, mode
    for phrase in ("focus mode", "triage", "review this PR/diff", "budget mode", "weekly limit passed 70%", "cut a release"):
        assert phrase in autopilot, phrase


def test_triage_skill_states_what_the_plugin_enforces():
    text = (ROOT / "skills" / "triage" / "SKILL.md").read_text()
    for part in ("Haiku", "screenshots", "inbox", "no builds"):
        assert part.lower() in text.lower(), part
    assert "Do not open them yourself" in text


def test_budget_skill_matches_the_tier_thresholds():
    tier = (ROOT / "hooks" / "tier.ts").read_text()
    assert "proWeek: 70" in tier and "stopWeek: 85" in tier and "stopFive: 90" in tier
    text = (ROOT / "skills" / "budget" / "SKILL.md").read_text()
    assert "70%" in text and "85%" in text and "90%" in text


def test_release_mode_never_publishes():
    text = (ROOT / "skills" / "release" / "SKILL.md").read_text()
    assert "never push a tag" in text.lower() and "Never skip the gate" in text


def test_work_and_away_carry_the_guards_the_hooks_enforce():
    for name in ("work", "away"):
        text = (ROOT / "skills" / name / "SKILL.md").read_text()
        for part in ("force-push", "60 minutes", "item_ledger.py", ".claude/inputs/"):
            assert part in text, (name, part)


def test_away_writes_the_heading_the_briefing_reads():
    assert "## Morning summary" in (ROOT / "skills" / "away" / "SKILL.md").read_text()
    assert r"(morning|summary)" in (ROOT / "hooks" / "briefing.ts").read_text()


def test_the_idle_guard_default_matches_the_docs():
    sh = (ROOT / "scripts" / "keep-going.sh").read_text()
    assert "idle=60" in sh
    assert "max-idle-minutes" in (ROOT / "skills" / "work" / "SKILL.md").read_text()


def test_version_and_options_are_documented():
    plugin = json.loads((ROOT / ".claude-plugin" / "plugin.json").read_text())
    readme = (ROOT / "README.md").read_text()
    assert plugin["version"] == "1.6.0"
    assert f"version-{plugin['version']}-" in readme
    for key in plugin["userConfig"]:
        assert f"`{key}`" in readme, key


def test_every_command_is_in_the_readme():
    src = (ROOT / "hooks" / "register.tsx").read_text()
    readme = (ROOT / "README.md").read_text()
    for name in re.findall(r"command\.register\(\{ name: '(\w+)'", src):
        assert f"`/{name}`" in readme, name


def test_the_gitignore_covers_run_state():
    ignore = (ROOT / ".gitignore").read_text()
    for line in (".claude/work-order.count", ".claude/work-order.last", ".claude/inputs/"):
        assert line in ignore, line
