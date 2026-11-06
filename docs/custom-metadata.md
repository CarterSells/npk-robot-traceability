# Engineer metadata alongside existing tools

Extends the local Stages 4–5 workflow in [build.md](../build.md), section 6. Engineers can record different components and measurements without changing Tavrik's fixed core fields. A robot file can supply arm torque, leg joint position, a controller setting, a component version or another approved scalar. Differences remain evidence for investigation, never automatic diagnoses.

## First import

1. Open the [local workspace](local-records.md) and select or add a robot.
2. Expand **Import engineer metadata · JSON / CSV**, then choose an approved metadata export from the existing engineering tool. JSON must have an object at its root. CSV needs unique headers and consistent columns; select one data row per snapshot.
3. Select fields to include. Review the component, field name, value type, units and purpose. Choose **Test condition** when a difference should warn that runs may not be comparable. Numbers require a unit; use `1` for dimensionless quantities. Text and booleans have no unit.
4. Supply the engineer's name, source reference and actual observation time represented by the file. Inspect the approved snapshot preview, including unknowns. **Add approved snapshot** creates a new immutable revision-1 snapshot and saves its mapping in the workspace.
5. **Record** opens automatically with that exact snapshot revision selected. Its components, measurements, part numbers and CAD revision references appear in the test draft with their units and missing-value states. Enter the run ID, actual test time and explicit outcome, then **Record run**. Picking counts are optional under **Optional picking counts**; supply both or neither. Tavrik never invents them or derives success from them.
6. Import a later file using the saved mapping. Its approved values populate the preview automatically; **Add approved snapshot** updates the test draft to the new exact snapshot. Saved tests retain their previous references. Record the new result and compare both runs. Custom fields appear alongside core fields, with units and provenance. **Export JSON** retains snapshots, mappings, runs and corrections.

Illustrative synthetic JSON:

```json
{
  "arm": { "torque": { "value": 12, "unit": "Nm" } },
  "leg": { "enabled": true },
  "controller": { "version": "synthetic-v1" }
}
```

Nested object fields and indexed array entries are discoverable. `{ "value": 12, "unit": "Nm" }` supplies an explicit unit source; CSV headers such as `Torque [Nm]` suggest a unit. These are suggestions to confirm, not a universal engineering-file interpreter. JSON retains its actual scalar types; CSV uses strict numeric and `true`/`false` conversions. Numeric strings in JSON remain text unless the source changes to actual numbers. Empty or incompatible selected values become unknown. Provenance references the approved mapping and stable field ID; CSV imports also retain the selected one-based data row. A run cannot precede its custom observations.

## Reuse, teamwork and changes

A saved mapping captures only its approved source paths. Newly encountered fields are ignored until reviewed. Missing paths, incompatible types, oversized values and changed explicit unit sources produce unknowns. No unit conversion or semantic equivalence is inferred.

Use **Download mapping** to save the mapping independently, then **Open mapping file** on another engineer's workspace or use it with the collector. The mapping contains definitions and source paths, not captured values, but names and paths can still be private: review before sharing and keep files outside the repository. Share the same mapping to retain stable field IDs. Matching labels alone do not merge measurements created under different IDs.

**Review a mapping copy** keeps existing field IDs while creating a new mapping ID for additions or definition changes. Saved mappings and prior snapshot definitions remain unchanged. If the same field's unit, type, component, name or purpose changes, comparisons show unknown with a definition-mismatch warning. Existing mapped fields absent from the selected file remain in the copy as unknowns; a new mapping can deliberately select a different set. Imported mapping-ID conflicts reject the whole operation instead of overwriting history.

**History → Correct a recorded field** also supports custom fields. Corrections append author, reason and provenance. They cannot alter definitions or unrelated fields; historical tests retain their original revision. A newly observed physical/configuration change belongs in a new snapshot, not a correction.

This is a local extension and file handoff, not simultaneous shared accounts or automatic cross-company synchronization. Each browser tab needs explicit export. A mapping cannot identify the correct robot, prove the source file is current, or verify physical hardware; engineers choose the robot and observation time. Core fields not supplied by this import remain unknown. The collector can capture custom and core metadata together.

Fields are not limited to torque or one robot design: for example, map vacuum pressure in kPa, camera exposure in microseconds, a component part number, and a CAD document revision as text. Export these from the engineering tool as JSON/CSV metadata. Raw STEP, STL, CAD assemblies and other binary files are not interpreted. Adding a file means selecting it in this browser workflow; changes on disk do not silently update saved tests or trigger a background watcher.

## Collector configuration

Keep the existing collector configuration version 1 and add:

```json
"custom": {
  "source": "engineer-metadata.json",
  "mapping": "tavrik-mapping.json",
  "observedAt": "2026-10-10T10:00:00Z"
}
```

Paths resolve relative to the configuration file. Replace the illustrative date with the source's actual UTC observation time. For CSV, set `source` to the CSV path and optionally add `"row": 0` (zero-based; default first row). Mapping format determines parsing. Use the normal [capture, dry-run, attach-run and validate commands](collector.md). Invalid mappings reject capture; missing/invalid data sources produce unknown values with unavailable evidence. Inspect coverage before accepting the capture. Only approved mapped scalars enter output; additional fields are ignored. There is no upload or file watcher. An existing test runner may invoke capture before each test using the saved mapping.

## Version 2 and limits

Old version-1 files remain readable and retain their original structure. New custom captures use bundle version 2 and snapshot schemaVersion 2. A v2 workspace may contain both snapshot versions. Every snapshot still has the core values/provenance contract. Schema-2 snapshots add 1–100 `custom` fields, each with `id`, `component`, `name`, `type`, `unit`, `category`, `value` and `provenance`. States are known, unknown or not-applicable. Version-1 runs still require pick counts; runs referencing schema-2 snapshots may omit both counts.

Version-2 bundles optionally include up to 1,000 `mappings`. Each mapping has `id`, `name`, `format` and 1–100 field definitions with `source` and optional `unitSource` JSON pointers. A standalone mapping file wraps one mapping in `{ "format": "unify-mapping", "version": 1, "mapping": ... }`. Custom correction events use `field: "custom:<stable-field-id>"`.

All input/output files and the exported workspace remain limited to 2 MiB. Browser discovery permits up to 200 fields, 16 nesting levels, 20,000 visited nodes and 1,000 CSV data rows. Custom text values and provenance strings are limited to 512 UTF-16 units; labels to 120 and units to 40. Duplicate JSON keys, ambiguous CSV headers and invalid mapping pointers are rejected. Limit metadata exports to useful selected measurements; arbitrary CAD/binary documents, raw telemetry streams, weights, recordings and datasets are not supported.

Source values are held transiently in the browser during review. Unselected values do not enter snapshots or exports. Common sensitive field names are blocked, but this is not a complete secret detector: inspect and approve only metadata and references. No evidence URL is fetched. Authors and editable local files are not authenticated or tamper-proof. Automatic file parsing does not satisfy the engineer workflow-validation gate; see [build progress](build-progress.md) for actual checks and limitations.
