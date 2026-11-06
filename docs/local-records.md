# Local record workspace

Stage 6 adds a **separate** [private-beta server](private-beta.md) with explicit organization saves. This guide continues to describe the local `/workspace/` and `/local/` routes; their memory/export behavior is unchanged.

Implements Stages 4–5 of [the canonical brief](../build.md), sections 6–8. Engineer-dependent validation is deferred by founder direction on 2026-10-03, not passed. This is a local prototype for approved metadata and references, with a separate [local Python collector](collector.md); it has no customer hosting, account system or network ingestion.

Use **Capture from your test setup → Add collector capture** to append an inspected collector handoff containing one robot, one snapshot and optionally one run. Existing records stay intact; identical reimports are skipped, conflicting identities reject the handoff, and synthetic/real records cannot mix. A snapshot-only capture opens Record with its exact snapshot selected and any custom fields displayed in the test draft; a capture with a run opens Compare. Export to retain the combined workspace. **Import JSON** continues to replace a complete workspace. See the [collector guide](collector.md) for setup, capture-before-test and runner commands.

## Open and use

Original Prompt 7 adds [investigations](investigations.md) under Compare: saved baseline choices, grouped evidence, append-only notes/states and JSON reports. Local workspace export includes the history; tab-memory persistence remains unchanged.

For robot-specific fields such as arm torque, leg joint settings or other measurements, use **Import engineer metadata · JSON / CSV**. The [custom metadata guide](custom-metadata.md) covers approved reusable mappings, custom comparison/correction fields, version-2 records and collector reuse. This extends the core format below; version-1 files remain supported.

Run `npm run dev` with Node 22.18 or newer, then choose **Open workspace** from the homepage or open <http://127.0.0.1:3000/workspace/>. **Add your robot** on the example viewer also opens the workspace. The old `/local/` bookmark remains supported. The development command binds to loopback. Both workspace routes are unavailable in the production static export. Do not expose the development server to a network or deploy it as customer hosting.

If the public preview already uses port 3000, run `npm run dev -- --port 3001` and open <http://127.0.0.1:3001/workspace/> instead. The implementation session left this second local address running for review; restart it with that command if the process has stopped.

1. The workspace opens with **Add a robot** visible. Enter a stable robot ID, name and task/cell, then click **Add robot**. To add another, use the **Add robot** button beside the page title. Alternatively, import an existing JSON file. **Load synthetic example** is optional; all edits and additions to that example remain synthetic, so clear it before entering actual records.
2. After creating a robot, **Record** opens. Expand **Record a hardware change / initial setup**, and record the component identity, revision, reporting author, observation time and evidence reference. This creates a new snapshot with other fields unknown. A physical change gets a new snapshot ID.
3. Open **History**, select the snapshot under **Snapshot revisions**, and expand **Correct a recorded field** to supply or correct metadata. Each save appends a revision with author, reason and prior-revision reference. A correction is a record change, not an instruction to change the robot.
4. Open **Record**, expand **Record a test run** and explicitly choose its exact snapshot revision. Record the time, outcome and pick counts when applicable. Version-1 snapshots require both counts; custom schema-2 snapshots allow both to be omitted. Partial results may still be classified as success or failure by the supplied procedure; Tavrik does not infer the outcome from the count.
5. In **Compare**, select a target run and a successful baseline. Read the condition warnings, unknowns, unavailable evidence and original provenance. No baseline is automatically selected. The 24-hour stale-hardware threshold is a prototype policy, not an engineer-validated requirement.
6. **Export JSON** to keep the complete workspace. Save private records outside this repository and public assets. The browser controls the download destination; verify the file saved. Reimport it to restore the session.

Records live only in the current tab's memory. There is no automatic localStorage, IndexedDB, cloud backup or autosave. Refreshing or closing loses the session. Changed sessions request a browser leave warning; browsers may suppress that warning. Replacing/clearing an edited session asks for confirmation. After a download is requested the session is marked exported, but Tavrik cannot verify that the browser wrote the file. The original imported file is never changed.

Corrections do not rebind past runs. Run comparisons always use the original exact revision; a visible notice indicates later revisions. Inspect the correction history to see the corrected values and provenance. New runs may reference a later revision explicitly. Run records themselves cannot be edited in this stage.

## Version 1 file contract

An export is the reference example. **Load synthetic example → Export JSON** produces a complete, valid synthetic file without requiring a private record in the repository.

```json
{
  "format": "unify-local",
  "version": 1,
  "synthetic": false,
  "records": { "robots": [], "snapshots": [], "runs": [] },
  "corrections": []
}
```

Limits: 2 MiB per JSON file and exported workspace; at most 1,000 robots, snapshot revisions, runs and correction events each. IDs use letters, digits, dots, underscores and hyphens, begin with a letter/digit, and have at most 120 characters. Dates are real UTC instants in `YYYY-MM-DDTHH:mm:ssZ` form. Unknown schema versions, extra keys, duplicate identities, broken references and missing correction history are rejected. Error messages name the field/path without echoing its supplied value. Validation does not prove the truth of imported records or detect every possible secret in free text.

`robots` contain `id`, `name`, `task`. `snapshots` contain `id`, `revision`, `robotId`, `schemaVersion: 1`, `hardwareConfirmedAt`, `values`, and `provenance`. Snapshot identities are global within one workspace. Each exact `(id, revision)` is unique. Higher revisions require complete, contiguous correction history. Import replaces the workspace atomically after validation; there is no partial merge or overwrite of existing revisions.

Every snapshot has all ten domain fields. Each uses `{ "state": "known", "value": ... }`, `{ "state": "unknown", "reason": "..." }`, or `{ "state": "not-applicable", "reason": "..." }`. Empty/missing fields are not silently treated as unchanged.

| Field | Known value |
| --- | --- |
| `hardware` | Object with `component` and `revision` strings |
| `software` | Object with a 40-character lowercase hexadecimal `commit`, boolean `dirty`, optional `buildDigest` string |
| `firmware`, `model`, `lineage`, `calibration` | Version, hash or approved reference string |
| `gripForce` | Nonnegative number in newtons |
| `procedure` | Procedure/version string |
| `object` | Task/object string |
| `conditions` | Nonempty object of supported numeric measurements: `speed_m_s`, `ambient_C`, `payload_kg` |

Known conditions compare only the supplied measurements. Unrecorded conditions remain unverified; matching supplied values never establishes identical physical conditions. If required measurements are missing, mark the domain unknown and describe what is missing. These version-1 core fields remain supported alongside the version-2 custom fields; custom test conditions also produce comparability warnings.

Each field's `provenance` has `source`, `method`, `author`, `observedAt`, `recordedAt`, `evidence` strings and `available` boolean. Observation must not follow recording. Hardware method must visibly say manual and its observation time must match `hardwareConfirmedAt`. Evidence is a text reference: it is never loaded, fetched, uploaded or automatically verified. `available: true` means the author reports availability.

`runs` contain `id`, `robotId`, `snapshotId`, `snapshotRevision`, `at`, `outcome` (`success` or `failure`), integer `successfulPicks` and positive integer `attemptedPicks`. Successful count cannot exceed attempts. Snapshot/robot references must resolve exactly, and hardware confirmation cannot be after the run.

`corrections` contain `snapshotId`, `revision`, `priorRevision`, `field`, `author`, `reason`, `recordedAt`. Each changes one field's value/provenance; all other fields are preserved. The new revision must directly follow its prior revision, use the same robot and match the corrected field's author/recorded time. A hardware correction also updates its confirmation time. Only the latest revision can be corrected in the UI. History is enforced by the application/import contract; a local editable JSON file is not cryptographic tamper-proof evidence, and authors are not authenticated.

## Data handling and verification

Never put credentials, raw source code, weights, datasets or recordings in these files. The importer has structural field allowlists, not a universal secret detector. The repository excludes `private/`, `customer-data/`, `prospects/`, environment files and test outputs, but private records should remain outside the workspace. This repository had no Git directory at implementation time; no tracked-data audit is claimed.

Run `npm test`, `npm run build`, `npm run typecheck`, and `npm run test:browser` for record and public-release regression checks. Run `npm run test:local` for the development-only workflow on loopback port 3001. Build before starting the local browser suite because build and development share framework-generated files. Only synthetic inputs are used in automated checks. See [build progress](build-progress.md) for actual results and remaining limitations.
