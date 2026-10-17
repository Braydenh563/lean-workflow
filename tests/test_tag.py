"""scripts/tag.sh tags the commit that first set the plugin version, and is safe to re-run."""
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def git(repo, *args):
    env = {"GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t", "PATH": "/usr/bin:/bin:/usr/local/bin"}
    return subprocess.run(["git", *args], cwd=repo, check=True, capture_output=True, text=True, env=env).stdout.strip()


def tag(repo, *args):
    env = {"GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t", "PATH": "/usr/bin:/bin:/usr/local/bin"}
    return subprocess.run(["bash", str(repo / "scripts" / "tag.sh"), *args], cwd=repo, check=True, capture_output=True, text=True, env=env).stdout


def release(repo, version):
    (repo / ".claude-plugin").mkdir(exist_ok=True)
    (repo / ".claude-plugin" / "plugin.json").write_text('{\n  "name": "x",\n  "version": "%s"\n}\n' % version)
    git(repo, "add", "-A")
    git(repo, "commit", "-qm", f"release {version}")
    return git(repo, "rev-parse", "HEAD")


def repo_at(tmp_path):
    (tmp_path / "scripts").mkdir()
    shutil.copy(ROOT / "scripts" / "tag.sh", tmp_path / "scripts" / "tag.sh")
    git(tmp_path, "init", "-q", "-b", "main")
    return tmp_path


def test_tags_the_commit_that_first_set_the_version_not_the_head(tmp_path):
    repo = repo_at(tmp_path)
    first = release(repo, "1.0.0")
    (repo / "later.txt").write_text("x")
    git(repo, "add", "-A")
    git(repo, "commit", "-qm", "later work, same version")
    assert "tagged  lean-workflow--v1.0.0" in tag(repo)
    assert git(repo, "rev-list", "-n1", "lean-workflow--v1.0.0") == first
    assert git(repo, "cat-file", "-t", "lean-workflow--v1.0.0") == "tag"  # annotated


def test_rerun_keeps_existing_tags(tmp_path):
    repo = repo_at(tmp_path)
    release(repo, "1.0.0")
    tag(repo)
    assert "kept    lean-workflow--v1.0.0" in tag(repo)
    assert git(repo, "tag", "-l") == "lean-workflow--v1.0.0"


def test_all_backfills_each_version_once_on_its_own_commit(tmp_path):
    repo = repo_at(tmp_path)
    a = release(repo, "1.0.0")
    b = release(repo, "1.1.0")
    out = tag(repo, "--all")
    assert "tagged  lean-workflow--v1.0.0" in out and "tagged  lean-workflow--v1.1.0" in out
    assert git(repo, "rev-list", "-n1", "lean-workflow--v1.0.0") == a
    assert git(repo, "rev-list", "-n1", "lean-workflow--v1.1.0") == b


def test_push_sends_only_the_new_tags(tmp_path):
    remote = tmp_path / "remote.git"
    subprocess.run(["git", "init", "-q", "--bare", str(remote)], check=True)
    (tmp_path / "work").mkdir()
    repo = repo_at(tmp_path / "work")
    release(repo, "2.0.0")
    git(repo, "remote", "add", "origin", str(remote))
    tag(repo, "--push")
    assert "lean-workflow--v2.0.0" in git(remote, "tag", "-l")


def test_no_version_is_an_error(tmp_path):
    repo = repo_at(tmp_path)
    (repo / ".claude-plugin").mkdir()
    (repo / ".claude-plugin" / "plugin.json").write_text("{}")
    git(repo, "add", "-A")
    git(repo, "commit", "-qm", "x")
    r = subprocess.run(["bash", str(repo / "scripts" / "tag.sh")], cwd=repo, capture_output=True, text=True)
    assert r.returncode == 1 and "no version" in r.stderr


def test_version_tags_an_earlier_release_on_its_own_commit(tmp_path):
    repo = repo_at(tmp_path)
    a = release(repo, "1.0.0")
    release(repo, "1.1.0")
    assert "tagged  lean-workflow--v1.0.0" in tag(repo, "--version", "v1.0.0")
    assert git(repo, "rev-list", "-n1", "lean-workflow--v1.0.0") == a
    assert git(repo, "tag", "-l") == "lean-workflow--v1.0.0"


def test_version_that_was_never_released_is_an_error_naming_the_fix(tmp_path):
    repo = repo_at(tmp_path)
    release(repo, "1.0.0")
    r = subprocess.run(["bash", str(repo / "scripts" / "tag.sh"), "--version", "9.9.9"], cwd=repo, capture_output=True, text=True)
    assert r.returncode == 1
    assert "never appears" in r.stderr and "1.0.0" in r.stderr
    assert git(repo, "tag", "-l") == ""


def test_version_must_look_like_a_version(tmp_path):
    repo = repo_at(tmp_path)
    release(repo, "1.0.0")
    r = subprocess.run(["bash", str(repo / "scripts" / "tag.sh"), "--version", "latest"], cwd=repo, capture_output=True, text=True)
    assert r.returncode == 2


def test_the_workflow_offers_a_run_button_with_a_version_box():
    text = (ROOT / ".github" / "workflows" / "tag.yml").read_text()
    for part in ("workflow_dispatch:", "version:", "required: true", "backfill:", "release:", "contents: write", "scripts/tag.sh --version"):
        assert part in text, part
    assert "${{ inputs.version }}" in text and "run: |" in text
    # inputs reach the shell through env, never interpolated into the script text
    assert "${{ inputs" not in text.split("run: |", 1)[1]
