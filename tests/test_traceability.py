import hashlib
import json
import subprocess
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from npk.demo import load_demo
from npk.models import Manifest, ProjectInput, RobotInput, RunInput
from npk.service import Problem, Store
from npk.web import create_app

ROOT = Path(__file__).resolve().parent.parent


@pytest.fixture
def manifest():
    return json.loads((ROOT / "examples/release-a.json").read_text())


@pytest.fixture
def store(tmp_path):
    result = Store(tmp_path / "trace.sqlite3")
    result.initialize()
    return result


@pytest.fixture
def demo(store):
    load_demo(store)
    return store


def test_demo_history_linkage_comparison_and_restart(demo):
    original = demo.get_release("demo-release-a")
    load_demo(demo)
    restarted = Store(demo.path)
    restarted.initialize()
    assert restarted.get_release("demo-release-a") == original
    board = restarted.dashboard()
    assert len(board["releases"]) == 2
    assert len(board["robots"][0]["runs"]) == 2
    for suffix in ("a", "b"):
        run = restarted.get_run(f"demo-run-{suffix}")
        assert run["robot"]["id"] == "demo-robot"
        assert run["release"]["id"] == f"demo-release-{suffix}"
        assert len(run["release"]["artifacts"]) == 5
        assert all(a["version"] for a in run["release"]["artifacts"])
    comparison = restarted.compare("demo-release-a", "demo-release-b")
    assert {r["type"]: r["changed"] for r in comparison["artifacts"]} == {
        "hardware": True, "firmware": False, "dataset": False, "model": False, "configuration": False}
    assert restarted.get_run("demo-run-b")["previous_success"]["id"] == "demo-run-a"
    assert restarted.get_run("demo-run-a")["previous_success"] is None
    assert not any(r["changed"] for r in restarted.compare("demo-release-a", "demo-release-a")["artifacts"])


@pytest.mark.parametrize("mutation", [
    lambda m: m.update(schema_version=2),
    lambda m: m.update(schema_version=True),
    lambda m: m.update(extra="unexpected"),
    lambda m: m.update(release_id="bad/id"),
    lambda m: m["artifacts"].pop(),
    lambda m: m["artifacts"][0].update(type="model"),
    lambda m: m["artifacts"][0].pop("version"),
    lambda m: m["artifacts"][0].update(sha256="not-a-sha"),
    lambda m: m["artifacts"][0].update(verification="verified_local_sha256"),
    lambda m: m.update(parent_release_id=m["release_id"]),
])
def test_invalid_manifests(manifest, mutation):
    mutation(manifest)
    with pytest.raises(ValidationError):
        Manifest.model_validate(manifest)


@pytest.mark.parametrize("url", [
    "javascript:alert(1)", "file:///tmp/private", "data:text/plain,hi", "//example.com/path",
    "https://user:secret@example.com/file", "https://example.com/file?token=secret",
    "https://example.com/file#secret", "https://example.com:bad/file", "https://example.com/%0afoo",
    "https://example.com/\\evil", "https:///missing", "https://example.com/?", "https://example.com/#",
])
def test_unsafe_links(manifest, url):
    manifest["artifacts"][0]["source"] = url
    with pytest.raises(ValidationError):
        Manifest.model_validate(manifest)
    with pytest.raises(ValidationError):
        RunInput(id="r", robot_id="r", release_id="r", outcome="unknown", recording_url=url)


def test_duplicate_import_order_independent_and_conflict_atomic(store, manifest):
    assert store.release(Manifest.model_validate(manifest))["created"]
    original = store.get_release(manifest["release_id"])
    manifest["artifacts"].reverse()
    assert not store.release(Manifest.model_validate(manifest))["created"]
    manifest["artifacts"][0]["version"] = "different-version"
    with pytest.raises(Problem, match="corrections require"):
        store.release(Manifest.model_validate(manifest))
    assert store.get_release(manifest["release_id"]) == original
    with store.connect() as db:
        assert db.execute("SELECT count(*) FROM artifacts").fetchone()[0] == 5


def test_failed_import_leaves_no_partial_project_or_release(store, manifest):
    manifest["parent_release_id"] = "missing"
    with pytest.raises(Problem, match="Unknown"):
        store.release(Manifest.model_validate(manifest))
    assert store.dashboard() == {"projects": [], "robots": [], "releases": []}


def test_transaction_rolls_back_all_five_artifacts(store, manifest):
    with store.connect() as db:
        db.executescript("""CREATE TRIGGER simulate_failure BEFORE INSERT ON artifacts
            WHEN NEW.type='model' BEGIN SELECT RAISE(ABORT, 'simulated'); END;""")
    with pytest.raises(Problem):
        store.release(Manifest.model_validate(manifest))
    with store.connect() as db:
        for table in ("projects", "releases", "artifacts", "release_artifacts"):
            assert db.execute(f"SELECT count(*) FROM {table}").fetchone()[0] == 0


def test_cross_project_and_unknown_references(demo, manifest):
    demo.project(ProjectInput(id="other", name="Other"))
    demo.robot(RobotInput(id="other-robot", project_id="other", name="Other"))
    with pytest.raises(Problem, match="same project"):
        demo.run(RunInput(id="bad", robot_id="other-robot", release_id="demo-release-a", outcome="unknown"))
    with pytest.raises(Problem, match="Unknown"):
        demo.run(RunInput(id="bad", robot_id="missing", release_id="demo-release-a", outcome="unknown"))
    with pytest.raises(Problem, match="Unknown"):
        demo.robot(RobotInput(id="bad", project_id="missing", name="Bad"))
    manifest.update(release_id="other-release", project={"id": "other", "name": "Other"}, parent_release_id="demo-release-a")
    with pytest.raises(Problem, match="another project"):
        demo.release(Manifest.model_validate(manifest))
    manifest.pop("parent_release_id")
    demo.release(Manifest.model_validate(manifest))
    with pytest.raises(Problem, match="different projects"):
        demo.compare("demo-release-a", "other-release")


def test_database_foreign_keys_and_type_constraints(demo):
    with pytest.raises(Problem):
        with demo.connect() as db:
            db.execute("INSERT INTO robots VALUES ('bad','missing','name',NULL)")
    demo.project(ProjectInput(id="other", name="Other"))
    demo.robot(RobotInput(id="other-robot", project_id="other", name="Other"))
    with pytest.raises(Problem):
        with demo.connect() as db:
            db.execute("INSERT INTO runs VALUES ('bad','other','other-robot','demo-release-a','time','success','','','{}')")
    hardware = demo.get_release("demo-release-a")["artifacts"][0]["id"]
    with pytest.raises(Problem):
        with demo.connect() as db:
            db.execute("UPDATE release_artifacts SET artifact_id=? WHERE release_id='demo-release-a' AND type='model'", (hardware,))
    with pytest.raises(Problem):
        with demo.connect() as db:
            db.execute("UPDATE runs SET outcome='invented' WHERE id='demo-run-a'")


def test_local_hash_verification_and_no_forged_evidence(store, manifest, tmp_path):
    local = tmp_path / "synthetic.bin"
    local.write_bytes(b"synthetic hardware")
    manifest["artifacts"][0]["sha256"] = hashlib.sha256(local.read_bytes()).hexdigest()
    store.release(Manifest.model_validate(manifest), {"hardware": local})
    artifacts = store.get_release(manifest["release_id"])["artifacts"]
    assert artifacts[0]["verification"] == "verified_local_sha256"
    assert all(a["verification"] == "unverified_reference" for a in artifacts[1:])
    manifest["release_id"] = "wrong-hash"
    local.write_bytes(b"changed")
    with pytest.raises(Problem, match="does not match"):
        store.release(Manifest.model_validate(manifest), {"hardware": local})
    assert len(store.dashboard()["releases"]) == 1


def test_run_history_and_timezone_normalization(demo):
    before = demo.get_run("demo-run-a")
    with pytest.raises(Problem, match="different contents"):
        demo.run(RunInput(id="demo-run-a", robot_id="demo-robot", release_id="demo-release-b", outcome="failure"))
    assert demo.get_run("demo-run-a") == before
    run = RunInput(id="offset", robot_id="demo-robot", release_id="demo-release-b",
                   outcome="unknown", timestamp="2026-09-17T07:00:00-04:00")
    assert demo.run(run)["previous_success"]["id"] == "demo-run-a"
    with pytest.raises(ValidationError):
        RunInput(id="invalid", robot_id="demo-robot", release_id="demo-release-a",
                 outcome="success", timestamp="2026-09-17T10:00:00")


def test_api_workflow_history_and_safe_errors(store, manifest):
    with TestClient(create_app(store.path)) as client:
        assert client.post("/api/init").status_code == 200
        assert client.post("/api/releases", json=manifest).json()["created"]
        assert client.post("/api/releases", json=manifest).json()["created"] is False
        assert client.post("/api/robots", json={"id": "robot", "project_id": "demo-project", "name": "Arm"}).status_code == 200
        run = {"id": "run", "robot_id": "robot", "release_id": "demo-release-a", "outcome": "success"}
        assert client.post("/api/runs", json=run).status_code == 200
        assert len(client.get("/api/runs/run").json()["release"]["artifacts"]) == 5
        assert client.get("/api/releases/demo-release-a").status_code == 200
        assert client.get("/api/robots").json()["robots"][0]["id"] == "robot"
        assert client.get("/api/compare?before=demo-release-a&after=demo-release-a").status_code == 200
        for method in (client.put, client.patch, client.delete):
            assert method("/api/releases/demo-release-a").status_code == 405
        manifest["creator"] = "different"
        assert client.post("/api/releases", json=manifest).status_code == 409
        assert client.get("/api/runs/missing").status_code == 404
        manifest["artifacts"][0]["source"] = "https://user:TOPSECRET@example.com"
        response = client.post("/api/releases", json=manifest)
        assert response.status_code == 422
        assert "TOPSECRET" not in response.text
        assert client.post("/api/init", headers={"origin": "https://evil.example"}).status_code == 403


def test_pages_escape_content_and_show_all_artifacts(demo):
    demo.robot(RobotInput(id="escaped", project_id="demo-project", name='<script>alert("x")</script>'))
    demo.run(RunInput(id="escaped-run", robot_id="escaped", release_id="demo-release-a", outcome="unknown", notes="<img src=x onerror=alert(1)>"))
    with TestClient(create_app(demo.path)) as client:
        home = client.get("/")
        assert home.status_code == 200
        assert "<script>" not in home.text
        assert "&lt;script&gt;" in home.text
        detail = client.get("/runs/escaped-run").text
        assert "<img src=x" not in detail
        assert "&lt;img" in detail
        detail = client.get("/runs/demo-run-b").text
        assert "Compare with last successful run" in detail
        for artifact in demo.get_release("demo-release-b")["artifacts"]:
            assert artifact["version"] in detail
        comparison = client.get("/compare?before=demo-release-a&after=demo-release-b")
        assert comparison.status_code == 200
        assert comparison.text.count('>Changed</span>') == 1
        assert comparison.text.count('>Unchanged</span>') == 4
        assert client.get("/runs/missing").status_code == 404
        assert client.get("/static/app.css").status_code == 200


def test_cli_end_to_end_and_exit_codes(tmp_path):
    db = tmp_path / "cli.sqlite3"
    def cli(*args):
        return subprocess.run([sys.executable, "-m", "npk", "--db", str(db), *args], cwd=ROOT, text=True, capture_output=True)
    assert cli("init").returncode == 0
    assert cli("demo").returncode == 0
    assert cli("demo").returncode == 0
    result = cli("inspect", "demo-run-b")
    assert result.returncode == 0
    assert len(json.loads(result.stdout)["release"]["artifacts"]) == 5
    assert cli("compare", "demo-release-a", "demo-release-b").returncode == 0
    assert cli("inspect", "missing").returncode == 3
    assert cli("run", "demo-run-a", "--robot", "demo-robot", "--release", "demo-release-b", "--outcome", "failure").returncode == 4
    assert cli("release", str(ROOT / "examples/release-a.json")).returncode == 0
    bad = tmp_path / "bad.json"
    bad.write_text('{"schema_version":2}')
    assert cli("release", str(bad)).returncode == 2
    bad.write_text('not JSON')
    assert cli("release", str(bad)).returncode == 1
