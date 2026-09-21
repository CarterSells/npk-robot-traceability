"""Repeatable synthetic records; no external connections."""

import json
from pathlib import Path

from .models import Manifest, RobotInput, RunInput


def load_demo(store):
    folder = Path(__file__).resolve().parent.parent / "examples"
    for filename in ("release-a.json", "release-b.json"):
        store.release(Manifest.model_validate(json.loads((folder / filename).read_text())))
    store.robot(RobotInput(id="demo-robot", project_id="demo-project", name="Lab arm 01", serial="SYNTHETIC-001"))
    for suffix, outcome, timestamp, notes in (
        ("a", "success", "2026-09-17T10:00:00Z", "Synthetic baseline: hardware A and model A."),
        ("b", "failure", "2026-09-18T10:00:00Z", "Synthetic failure: hardware B and model A. Outcome entered for demonstration; cause not established."),
    ):
        store.run(RunInput(id=f"demo-run-{suffix}", robot_id="demo-robot",
                          release_id=f"demo-release-{suffix}", outcome=outcome, timestamp=timestamp, notes=notes))
    return {"robot": "demo-robot", "runs": ["demo-run-a", "demo-run-b"],
            "releases": ["demo-release-a", "demo-release-b"]}
