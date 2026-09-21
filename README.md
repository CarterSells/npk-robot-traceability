# NPK · Robot traceability

A local prototype answering: **Which hardware, firmware, dataset, model, and configuration were recorded for a robot run, and what changed since its last successful run?** The customer need remains a hypothesis for discovery interviews.

One Python 3.13 application: FastAPI, Jinja server-rendered pages, SQLite, and a CLI using the same business logic. No external account, robot, customer files, or paid service is needed. Only synthetic data belongs in this prototype.

## Start here

Run commands from this project folder. The environment and demo have already been prepared in this workspace:

```sh
cd /Users/tk2s/docs
.venv/bin/python -m npk init
.venv/bin/python -m npk demo
.venv/bin/python -m npk serve
```

Open **http://127.0.0.1:8000**. If the review server is already running, open that URL without starting another copy. Stop a server in its terminal with Ctrl+C. Use `serve --port 8001` if port 8000 is occupied.

On a **clean macOS/Linux setup**, bootstrap with an available Python 3.9+ (used only to install uv). These commands install the app's supported Python and locked dependencies inside the project; initial setup needs Internet access:

```sh
python3 -m venv .bootstrap
.bootstrap/bin/python -m pip install uv==0.12.17
UV_PYTHON_INSTALL_DIR="$PWD/.runtime" UV_CACHE_DIR="$PWD/.uv-cache" .bootstrap/bin/uv sync --locked
.venv/bin/python -m npk init
.venv/bin/python -m npk demo
.venv/bin/python -m npk serve
```

`uv.lock` pins all application/test dependencies with distribution hashes. `.python-version` selects Python 3.13. The prepared workspace was tested with Python 3.13.15 on macOS. Runtime dependencies are local; pages use local CSS and no frontend framework. FastAPI's optional `/docs` API explorer loads its Swagger assets from a CDN.

## Try the synthetic demo

1. On the dashboard, open **demo-run-a**: successful run, hardware A, model A, and all five exact versions.
2. Open **demo-run-b**: failed run, hardware B, model A, and all five exact versions.
3. Click **Compare with last successful run**. Hardware is **Changed**; firmware, dataset, model, and configuration are **Unchanged**. The dashboard's comparison selectors provide the same view.
4. Restart the server and revisit either run. SQLite preserves the records.

The failure is entered demonstration data. A changed hardware reference does **not** prove model incompatibility or establish the cause of a failed run. Demo links on `example.com` are synthetic placeholders, not downloadable artifacts.

`init` and `demo` are safe to repeat. The demo uses fixed IDs and run timestamps and does not add duplicate history. If those IDs already contain different data, it fails deliberately rather than replacing it.

## CLI

All commands support `--db PATH` **before** the command, or the `NPK_DB` environment variable. Default: `data/npk.sqlite3`, relative to the working directory. Use the same database path for CLI and server. `init` creates its parent directory and schema; initialization is also automatic with `serve`.

```sh
.venv/bin/python -m npk --help
.venv/bin/python -m npk inspect demo-run-b
.venv/bin/python -m npk compare demo-release-a demo-release-b

# Import the checked-in manifests (already present after demo; returns created: false).
.venv/bin/python -m npk release examples/release-a.json
.venv/bin/python -m npk release examples/release-b.json

# Add another synthetic robot and run using an existing release.
.venv/bin/python -m npk robot review-arm --project demo-project --name "Review arm" --serial SYNTHETIC-002
.venv/bin/python -m npk run review-run-1 --robot review-arm --release demo-release-b --outcome unknown --notes "Synthetic review run"
.venv/bin/python -m npk inspect review-run-1

# Optional separate workspace: initialize, then register a project.
.venv/bin/python -m npk --db data/experiment.sqlite3 init
.venv/bin/python -m npk --db data/experiment.sqlite3 project experiment "Synthetic experiment"
```

`run` accepts optional `--timestamp` (ISO 8601 with timezone) and `--recording-url`. Without a timestamp, the application records current UTC time. IDs are at most 80 characters: letters, digits, hyphens, underscores, starting with a letter or digit.

CLI output is JSON. Exit codes: **0** success (including identical re-import), **1** file/JSON/database failure, **2** validation or usage error, **3** unknown reference, **4** history/project conflict. Error messages omit submitted input values. Never place secrets in input metadata or shell arguments.

## API

Open http://127.0.0.1:8000/docs for request contracts and interactive requests; `/openapi.json` exposes the schema. The API has the same operations as the CLI:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/api/init` | Initialize database |
| POST | `/api/projects` | Register `{id,name}` |
| POST | `/api/robots` | Register `{id,project_id,name,serial?}` |
| GET | `/api/robots` | Projects, robots, runs, and release list |
| POST | `/api/releases` | Import versioned manifest |
| GET | `/api/releases/{id}` | Exact release and five artifacts |
| POST | `/api/runs` | Record `{id,robot_id,release_id,outcome,notes?,timestamp?,recording_url?}` |
| GET | `/api/runs/{id}` | Run, robot, release, five artifacts, prior success |
| GET | `/api/compare?before=ID&after=ID` | Deterministic comparison |

```sh
curl -sS -H 'Content-Type: application/json' --data-binary @examples/release-a.json http://127.0.0.1:8000/api/releases
curl -sS http://127.0.0.1:8000/api/runs/demo-run-b
curl -sS 'http://127.0.0.1:8000/api/compare?before=demo-release-a&after=demo-release-b'
```

Invalid inputs return **422**, unknown references **404**, conflicts **409**, and database unavailability **503**, with readable JSON errors. There are no update/delete routes; these methods return **405**. Browser pages are read-only; register records with the CLI or API. No API endpoint accepts local filesystem paths.

## Manifest and identity rules

Start from `examples/release-a.json`. `npk/models.py` defines the validated version-1 contract. A manifest contains `schema_version: 1`, a permanent `release_id`, a project `{id,name}`, a creator, an optional `parent_release_id`, and exactly one artifact for each of **hardware, firmware, dataset, model, configuration**. Unknown fields, unsupported schema versions, missing/duplicate types, invalid hashes, and self-parenting are rejected. Each artifact needs a label, source URL, and an immutable version identifier and/or lowercase 64-character SHA-256.

- **Release identity:** explicit ID, unique within the local database. Validated JSON is canonicalized with sorted keys and artifacts sorted by type; omitted optional fields become null. Formatting and artifact order do not matter. Same ID and canonical contents returns the existing record (`created: false`). Any changed contents under the same ID returns a conflict. A different ID explicitly creates a different release, even when its artifacts match. Corrections require new IDs.
- **Artifact identity:** `a_` plus SHA-256 of canonical metadata: project, type, label, source, version, supplied hash, and verification status. Identical metadata reuses an artifact; different metadata creates one. This ID hashes the metadata, **not** the artifact bytes. Creation timestamps are assigned by the application and are not part of identity.
- **Project/robot/run identity:** explicit permanent IDs. Identical registrations are idempotent; conflicting contents are rejected. Run identity compares submitted fields, including the supplied timestamp string; repeated requests that omitted a timestamp reuse the original recorded time. A name change under an existing project ID is a conflict.
- **Atomicity and boundaries:** project creation, release, artifacts, and all five links commit in one transaction. Parent releases must already exist in the same project. Robots must reference an existing project; runs must reference an existing robot and release in the same project. SQLite foreign keys and composite keys also enforce project/type boundaries.
- **Comparison:** fixed five-type order; exact `(source, version, sha256)` equality determines unchanged/changed. Label and verification differences remain visible but do not mark the reference changed. Comparing different projects is rejected.
- **Previous success:** the same robot's successful run with the latest timestamp strictly before the inspected run. Equal-time successes are not treated as earlier; ties among earlier successes use descending run ID. User-supplied times are normalized to UTC. This is recorded time, not independently verified robot telemetry.

## References and local verification

The application never fetches artifact or recording URLs. Only `http` and `https` are allowed. User-info credentials, all query strings and fragments (including signed URLs), control characters, and backslashes are rejected. Use a stable credential-free reference; never include secrets in URL paths, labels, versions, or notes. Browser content is escaped, and the supported server command disables request access logging to avoid recording submitted URLs.

Imported references and caller-supplied hashes are **unverified references**. A trusted local CLI import can optionally read a file the user explicitly selects, compute its SHA-256, and compare it to the manifest hash:

```sh
# After setting a new release_id and matching sha256 in your synthetic manifest:
.venv/bin/python -m npk release my-release.json --local-file hardware=./synthetic-mount.step
```

Repeat `--local-file TYPE=PATH` for other types. Mismatches or unreadable files abort the import. The local path and bytes are not stored. Successful checks are labeled **verified local SHA-256**. This verifies selected bytes at import time, not a remote URL, physical configuration, or deployment. API callers cannot claim verified status. Re-import never upgrades existing release evidence; use a new release ID to capture newly verified evidence.

## Tests and implementation map

```sh
.venv/bin/python -m pytest -q
```

The focused suite covers manifest validation, URL rejection, atomic rollback, SQLite constraints, cross-project checks, immutable history, duplicate imports, local hashes, run linkage, timestamps, comparison results, escaped HTML, API errors, and CLI exit codes. At delivery, 34 cases passed. Starlette's test client emits two upstream deprecation warnings; they do not affect results.

| Files | Responsibility |
| --- | --- |
| `npk/models.py` | Shared input contracts and safe references |
| `npk/schema.sql`, `npk/service.py` | SQLite constraints, transactions, identity, history, comparisons |
| `npk/__main__.py` | CLI and localhost server entry point |
| `npk/web.py`, `npk/templates/`, `npk/static/` | API, escaped server-rendered pages, responsive styles |
| `npk/demo.py`, `examples/` | Repeatable synthetic demo |
| `tests/test_traceability.py` | Acceptance-focused automated tests |
| `pyproject.toml`, `uv.lock`, `.python-version`, `.gitignore` | Reproducible setup and local-file exclusions |

Manual validation: initialized the database, loaded the demo repeatedly, inspected and compared through the CLI, opened the dashboard/run/comparison pages in Chrome, and checked persistence across a server restart.

## Limits and project context

This is **application-level history preservation**, not tamper-proof evidence. There are no application operations to edit/delete releases or artifacts, but someone with direct SQLite access can change them. The importer enforces exactly five artifacts transactionally; direct SQL can bypass application invariants. There is no migration framework yet; the schema initializer creates missing tables without changing existing schema.

The localhost prototype has no authentication, organization isolation, permissions, or independent verification of what physically ran. Hosted customer use requires those features and security review. It stores metadata only. No repository hosting, CAD diffs/plugins, robot agent/control, deployment, billing, cross-customer learning, or automatic compatibility/failure predictions are implemented.

`AGENTS.md`, `npk-ventures-handoff.md`, and `BUILD_PROMPT.md` remain in this folder; the existing alternate context files are preserved as well. The integration-first build prompt governs this milestone, while the handoff describes the broader four-surface vision.

No Git repository was present in this folder at inspection. No repository, remote, commit, push, or license was created. Intended future destination: **CarterSells/npk-robot-traceability**, private unless explicitly authorized otherwise. Publication waits for review and explicit approval.
