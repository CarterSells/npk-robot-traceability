"""Shared operations. External references are never fetched."""

import hashlib
import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from .models import KINDS, Manifest, ProjectInput, RobotInput, RunInput


class Problem(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def now():
    return datetime.now(timezone.utc).isoformat(timespec="microseconds")


class Store:
    def __init__(self, path):
        self.path = Path(path)

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        try:
            with db:
                yield db
        except sqlite3.IntegrityError:
            raise Problem("Record conflicts with existing history or a database constraint", 409) from None
        finally:
            db.close()

    def initialize(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.executescript(Path(__file__).with_name("schema.sql").read_text())

    @staticmethod
    def require(db, table, identifier):
        # Table names are internal constants, never user inputs.
        row = db.execute(f"SELECT * FROM {table} WHERE id=?", (identifier,)).fetchone()
        if row is None:
            raise Problem(f"Unknown {table.rstrip('s')} ID: {identifier}", 404)
        return dict(row)

    @staticmethod
    def _project(db, project):
        old = db.execute("SELECT * FROM projects WHERE id=?", (project.id,)).fetchone()
        if old and old["name"] != project.name:
            raise Problem("Project ID already exists with a different name", 409)
        db.execute("INSERT OR IGNORE INTO projects VALUES (?,?)", (project.id, project.name))

    def project(self, project: ProjectInput):
        with self.connect() as db:
            self._project(db, project)
        return project.model_dump()

    def robot(self, robot: RobotInput):
        values = robot.model_dump()
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            self.require(db, "projects", robot.project_id)
            old = db.execute("SELECT * FROM robots WHERE id=?", (robot.id,)).fetchone()
            if old and dict(old) != values:
                raise Problem("Robot ID already exists with different contents", 409)
            db.execute("INSERT OR IGNORE INTO robots VALUES (:id,:project_id,:name,:serial)", values)
        return values

    def release(self, manifest: Manifest, local_files=None):
        data = manifest.model_dump()
        data["artifacts"] = sorted(data["artifacts"], key=lambda a: a["type"])
        encoded = canonical(data)
        local_files = local_files or {}
        if set(local_files) - set(KINDS):
            raise Problem("Unknown local-file artifact type")
        verified = set()
        for artifact in manifest.artifacts:
            if artifact.type in local_files:
                try:
                    with Path(local_files[artifact.type]).open("rb") as stream:
                        digest = hashlib.file_digest(stream, "sha256").hexdigest()
                except OSError:
                    raise Problem("Cannot read requested local verification file") from None
                if digest != artifact.sha256:
                    raise Problem("Local file hash does not match the manifest SHA-256")
                verified.add(artifact.type)
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            old = db.execute("SELECT manifest_json FROM releases WHERE id=?", (manifest.release_id,)).fetchone()
            if old:
                if old[0] != encoded:
                    raise Problem("Release ID already exists; corrections require a new release ID", 409)
                return {"id": manifest.release_id, "created": False}
            self._project(db, manifest.project)
            if manifest.parent_release_id:
                parent = self.require(db, "releases", manifest.parent_release_id)
                if parent["project_id"] != manifest.project.id:
                    raise Problem("Parent release belongs to another project", 409)
            timestamp = now()
            db.execute("INSERT INTO releases VALUES (?,?,?,?,?,?)", (
                manifest.release_id, manifest.project.id, manifest.creator, timestamp,
                manifest.parent_release_id, encoded))
            for artifact in manifest.artifacts:
                item = artifact.model_dump()
                item["project_id"] = manifest.project.id
                item["verification"] = "verified_local_sha256" if artifact.type in verified else "unverified_reference"
                item["id"] = "a_" + hashlib.sha256(canonical(item).encode()).hexdigest()
                item["timestamp"] = timestamp
                db.execute("""INSERT OR IGNORE INTO artifacts
                    (id,project_id,type,label,source,version,sha256,verification,timestamp)
                    VALUES (:id,:project_id,:type,:label,:source,:version,:sha256,:verification,:timestamp)""", item)
                db.execute("INSERT INTO release_artifacts VALUES (?,?,?,?)", (
                    manifest.release_id, manifest.project.id, artifact.type, item["id"]))
        return {"id": manifest.release_id, "created": True}

    @classmethod
    def _release(cls, db, identifier):
        release = cls.require(db, "releases", identifier)
        release.pop("manifest_json")
        rows = db.execute("""SELECT a.* FROM artifacts a JOIN release_artifacts ra
            ON a.id=ra.artifact_id WHERE ra.release_id=?""", (identifier,)).fetchall()
        release["artifacts"] = sorted([dict(r) for r in rows], key=lambda a: KINDS.index(a["type"]))
        return release

    def get_release(self, identifier):
        with self.connect() as db:
            return self._release(db, identifier)

    def run(self, run: RunInput):
        encoded = canonical(run.model_dump())
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            robot = self.require(db, "robots", run.robot_id)
            release = self.require(db, "releases", run.release_id)
            if robot["project_id"] != release["project_id"]:
                raise Problem("Robot and release must belong to the same project", 409)
            old = db.execute("SELECT input_json FROM runs WHERE id=?", (run.id,)).fetchone()
            if old:
                if old[0] != encoded:
                    raise Problem("Run ID already exists with different contents", 409)
            else:
                timestamp = (datetime.fromisoformat(run.timestamp.replace("Z", "+00:00"))
                             .astimezone(timezone.utc).isoformat(timespec="microseconds")) if run.timestamp else now()
                db.execute("INSERT INTO runs VALUES (?,?,?,?,?,?,?,?,?)", (
                    run.id, robot["project_id"], run.robot_id, run.release_id,
                    timestamp, run.outcome, run.notes, run.recording_url, encoded))
        return self.get_run(run.id)

    def get_run(self, identifier):
        with self.connect() as db:
            run = self.require(db, "runs", identifier)
            run.pop("input_json")
            run["robot"] = self.require(db, "robots", run["robot_id"])
            run["release"] = self._release(db, run["release_id"])
            previous = db.execute("""SELECT id,release_id FROM runs WHERE robot_id=?
                AND outcome='success' AND timestamp < ? ORDER BY timestamp DESC, id DESC LIMIT 1""",
                (run["robot_id"], run["timestamp"])).fetchone()
            run["previous_success"] = dict(previous) if previous else None
        return run

    def compare(self, before, after):
        with self.connect() as db:
            first = self._release(db, before)
            second = self._release(db, after)
        if first["project_id"] != second["project_id"]:
            raise Problem("Cannot compare releases from different projects", 409)
        rows = []
        for a, b in zip(first["artifacts"], second["artifacts"]):
            fields = ("source", "version", "sha256")
            rows.append({"type": a["type"], "changed": any(a[f] != b[f] for f in fields), "before": a, "after": b})
        return {"before": first, "after": second, "artifacts": rows,
                "notice": "Recorded reference changes are observations, not proof of incompatibility or causes of failure."}

    def dashboard(self):
        with self.connect() as db:
            projects = [dict(r) for r in db.execute("SELECT * FROM projects ORDER BY name,id")]
            robots = [dict(r) for r in db.execute("SELECT * FROM robots ORDER BY name,id")]
            releases = [dict(r) for r in db.execute("SELECT id,project_id,timestamp FROM releases ORDER BY timestamp DESC,id")]
            for robot in robots:
                robot["runs"] = [dict(r) for r in db.execute("""SELECT id,release_id,timestamp,outcome
                    FROM runs WHERE robot_id=? ORDER BY timestamp DESC,id DESC""", (robot["id"],))]
        return {"projects": projects, "robots": robots, "releases": releases}
