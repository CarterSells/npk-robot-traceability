# Local collector

Stage 6 adds a separate, explicit [reviewed upload queue](private-beta.md#collector-upload-queue) for a configured private-beta server. The capture and attach-run commands documented here remain local and never upload automatically.

Stage 5 of [the canonical brief](../build.md), sections 6–8. Captures approved metadata for the [local workspace](local-records.md). No upload, accounts, cloud persistence, robot configuration writes or causal diagnosis. Pilot-engineer validation remains unverified.

## Start with the synthetic example

Use Python 3.10 or newer. No pip packages are required. Windows uses `python`; Linux typically uses `python3`. Run commands from the project root. The optional Git input requires Git on PATH. The base collector does not need ROS.

```sh
python collector/unify_collector.py capture --config collector/examples/config.synthetic.json --dry-run
```

This prints the entire proposed metadata envelope, including unknowns and provenance, without creating a capture file. Avoid shared terminal logs when previewing private metadata. Example hardware dates deliberately remain old; they are not refreshed by capture.

For actual use, copy the example configuration, hardware manifest and settings to a private directory **outside this repository and public assets**. Change the robot, author, times and approved values; set `synthetic` to `false` only for actual records. Use matching robot ID, name and task when adding to an existing workspace. Never enter secrets into free text or evidence references. Unknown fields are acceptable; fabricated values are not.

## Capture, run, import

Windows example (replace paths with your private directory):

```powershell
python collector/unify_collector.py capture --config C:/RobotRecords/config.json --dry-run
python collector/unify_collector.py capture --config C:/RobotRecords/config.json --output C:/RobotRecords/before-test-001.json
```

Linux example:

```sh
python3 collector/unify_collector.py capture --config /home/operator/robot-records/config.json --dry-run
python3 collector/unify_collector.py capture --config /home/operator/robot-records/config.json --output /home/operator/robot-records/before-test-001.json
```

Run the test after capturing. Keep the setup stable between capture and test; the collector cannot establish that it remained unchanged. Have your existing test runner write this small result JSON, using its actual outcome and UTC completion time:

```json
{
  "id": "test-001",
  "at": "2026-10-09T15:30:00Z",
  "outcome": "success",
  "successfulPicks": 10,
  "attemptedPicks": 10
}
```

The example timestamp is illustrative: replace it with a time at or after capture. A generic runner invokes these commands with argument arrays, checks exit codes, and stops the handoff on failure:

```sh
python collector/unify_collector.py attach-run --capture /private/before-test-001.json --run /private/result-001.json --output /private/test-001.json
python collector/unify_collector.py validate /private/test-001.json
```

`attach-run` preserves the captured snapshot exactly and binds the result to revision 1; it never recollects after the test, derives outcomes from counts or runs robot commands. Each capture accepts at most one run. Use a new capture and filename for the next test. Files are exclusively created: existing captures are never overwritten. Exit 0 means success; exit 2 means invalid input or an output error. Missing optional sources produce explicit unknown fields and exit 0, so inspect coverage before accepting a capture.

Open the site with `npm run dev`, then `/workspace/`. Expand **Capture from your test setup → Add collector capture**, and choose the inspected JSON. This appends the snapshot and optional run; earlier revisions remain unchanged. Identical reimports are ignored; conflicting robot details, snapshot revisions or run IDs reject the entire handoff. Synthetic and real records cannot mix. A capture without a run opens Record with its exact revision selected and its custom fields displayed in the test draft; enter the actual run ID, time and outcome. A capture with a run opens Compare; choose a successful baseline yourself.

Repeat for a second test, compare the recorded changes and unknowns, then **Export JSON** to retain the combined workspace. **Import JSON** restores/replaces a whole workspace; **Add collector capture** appends a single capture. The browser retains data only in tab memory. Both workspace routes remain excluded from public output.

## Explicit configuration

Top-level configuration version 1 keys: `version`, `synthetic`, `robot`, `author`, plus optional `git`, `model`, `calibration`, `hardware`, `settings`, `metadata`, `ros2`, `custom`. Unknown configuration keys are rejected. Input paths resolve relative to the configuration file; absolute paths also work. The collector does not scan directories for configuration or read environment variables as record fields.

`custom` adds an approved JSON/CSV mapping alongside all existing capture inputs. Create and download the mapping through the workspace, then configure `source`, `mapping`, `observedAt` and optional zero-based CSV `row`. See [custom metadata](custom-metadata.md). Custom captures use bundle/snapshot version 2 and support run outcomes without pick counts; configuration and mapping envelopes remain version 1. Additional source fields are excluded until explicitly approved in a new mapping.

| Input | Captured output | Limits |
| --- | --- | --- |
| `git`: repository path | HEAD commit and dirty boolean, including staged/untracked changes | No remote URLs, emails, diffs, source or filenames. Unborn/missing repository, unsupported commit, failure or timeout becomes unknown. Git commands have a 5-second / 64 KiB output limit. |
| `model`, `calibration`: file paths | SHA-256 of exact bytes | Streamed locally; no bytes or paths in the output. File changes detected during hashing produce unknown. 30-second hashing deadline checked between blocks; slow filesystem reads can exceed it. |
| `hardware`: manifest path | Manual component identity/revision, author, confirmation time, evidence reference | Manifest version 1 shown in the example. Not automatically verified; old times stay old. Missing/unreadable manifest becomes unknown. Structurally invalid readable manifests reject capture. |
| `settings`: JSON path | Numeric `gripForce` in N; `conditions.speed_m_s`, `ambient_C`, `payload_kg` | Only those fields are projected. Extra settings are excluded. Invalid selected fields become unknown. Partial conditions describe only supplied measurements, not all physical conditions. |
| `metadata` | Explicit `firmware`, `lineage`, `procedure`, `object`, `model`, `calibration` declarations | Each entry has `field`, `observedAt`, `evidence`, `available`. `field` uses known/unknown/not-applicable states from the local record contract. A field cannot have both a file source and a declaration. |

Captured sources are read sequentially, not as an atomic robot-wide measurement. Each field records its observation and final recording time. Operator-declared observation times are preserved. Automatic source availability means the local source was read; it does not prove the robot used those bytes. Evidence references are text and never fetched. Free-text metadata is explicitly supplied, not automatically secret-scrubbed.

Hardware uses the existing version-1 `hardwareConfirmedAt` slot. When hardware is unknown, the slot and provenance time record the missing-report observation, **not** a physical confirmation; the workspace labels it unconfirmed. Never interpret that timestamp as proof of current hardware. With a valid manifest, the slot retains the operator's reported confirmation time.

Every capture has a new random snapshot ID and revision 1. Snapshot schemaVersion is 1 without custom metadata or 2 with it. Byte hashes are deterministic; IDs/times intentionally differ between captures. JSON reads and output are bounded to 2 MiB. Duplicate keys, unsupported versions, malformed values and future observations are rejected. Corrections use the workspace's append-only history workflow. The collector `validate` command accepts only one-snapshot handoffs, not complete corrected workspace exports. The website validates the full contract again before accepting anything.

## Optional ROS 2 adapter

Opt in with this configuration instead of `settings`:

```json
"ros2": { "node": "/gripper", "parameter": "grip_force", "timeoutSeconds": 3 }
```

In a sourced ROS 2 environment, this invokes `ros2 param get --hide-type /gripper grip_force`. Only this numeric parameter is permitted, mapped to grip force in newtons; confirm your node uses that unit. There are no parameter writes or broad dumps. Timeout must be 0.1–10 seconds; stdout is capped at 128 bytes. Missing ROS, timeouts, invalid output and negative/nonfinite values become unknown. ROS may use the configured ROS/DDS network to read that parameter, including during dry-run; no Tavrik ingestion/upload exists. This adapter's command handling is tested with synthetic substitutes; live robot/ROS behavior requires an engineer trial.

## Verification

The optional adapter's CLI syntax was checked against the [official ROS 2 parameter-get implementation](https://github.com/ros2/ros2cli/blob/rolling/ros2param/ros2param/verb/get.py). This is a source check, not verification against a live ROS installation.

```sh
python collector/test_collector.py
npm test
npm run build
npm run test:local
```

The JavaScript integration and collector browser tests execute Python-generated synthetic handoffs. Set `UNIFY_PYTHON` to your interpreter if it is not `python` (Windows) or `python3` (Linux). This workspace also has an ignored portable interpreter at `.tools/python-3.13.7/python.exe`. Tests require Git for a temporary synthetic repository. No actual customer records are test fixtures.

Before calling this customer-validated, a pilot engineer must capture a real approved snapshot, inspect what was and was not recorded, and explain it back. This remains an evidence goal, not a passed gate. Authenticated ingestion and customer hosting remain Stage 6 work with authorization, isolation and recovery checks.
