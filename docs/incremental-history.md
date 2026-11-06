# B2 incremental history

This implements the persistence portion of [the backend roadmap](backend-master-prompts.md), preserving [build.md](../build.md) sections 6–7. Existing relational payload tables remain authoritative after an explicit organization cutover. No record IDs, immutable payloads, exact snapshot references or original submitted-version audit links are rewritten.

## Operation

Install `20261022022323_b2_incremental_history.sql` after the four existing migrations. Never replay the original migrations on the configured hosted project: its migration timestamps differ from local filenames. Enable server-only `BETA_HISTORY_ENABLED=true` after installation. An administrator calls `cutover_history(org, verified_owner_id)` through trusted tooling after checkpointing the application tables. The function locks the organization and compares counts and canonical JSONB payloads in both directions for all six immutable collections. Any mismatch aborts; investigate it rather than replacing data.

Before cutover, existing saves retain their legacy behavior. After cutover, `append_records` accepts a validated bounded batch, checks current membership or collector scope, serializes submissions within the organization and commits records, audit, receipt and pilot activity together. Unrelated writers can append without a stale whole-workspace version conflict. An existing ID with different contents fails atomically. Retries must retain the same request ID and content; reuse with different content fails. The old bundle stays frozen as a checkpoint, and old `beta_command` saves fail closed. History is not deleted to stay within editor bounds.

The HTTP import/save adapter still accepts `unify-local` versions 1 and 2: maximum 2 MiB and 1,000 entries per collection **per import**, with complete reference/correction dependencies. Total database history is not subject to that limit. Legacy small JSON exports still work. Large histories use the streaming archive below. The local editor remains bounded; very long individual correction/investigation chains may require the archive instead of editing in the browser.

## Read and export contracts

- `GET /api/org/:org/history?collection=runs&limit=25`: `rows`, `watermark`, `next`. Allowed collections are robots, snapshots, runs, corrections, mappings, investigation_revisions and audit_events. Rows include key, revision, payload and original submitted_version. Continue with next.key as `after`, next.revision as `revision`, and the original watermark. Order is stable record-key/revision order, not an assertion of observation chronology. Runs/snapshots optionally filter by `robot_id`.
- `GET /api/org/:org/run-context?ids=run-a,run-b`: bounded validated editor context with exact snapshots, correction history and investigations for the selected runs, plus investigation baseline/retest references.
- `GET /api/org/:org/export-history`: streamed `application/x-ndjson`. First line: `format: unify-history`, `version: 1`, synthetic flag and watermark. Following lines identify collection, key, revision, payload and submitted_version. Submission audit rows preserve actor/credential/time linkage. Last line must contain `complete: true` with the same watermark. Discard incomplete downloads. This is a record archive, not a database/Auth backup or a local JSON import file.

Every page rechecks current membership; export stops when access is revoked. A watermark excludes later submissions while immutable records retain their original contents. The browser distinguishes saved history from a bounded draft, offers paginated browsing and opens selected runs in the existing comparison workflow. A large history produces an explicitly labeled empty import draft, never a claim that saved records disappeared.

## Compatibility, recovery and rollback

Keep the migration and new server deployed together throughout the compatibility window. Do not cut over an organization while an older writer must remain active. Keep the legacy checkpoint until an independently approved retention policy permits removal; no cleanup is implemented here.

Before migration, privately checkpoint application tables and verify the target contains only authorized synthetic data. The October 21 checkpoint includes all 17 application tables and their audit/receipt/credential state. It is ignored under `.cache`; it is not a substitute for managed Auth/storage recovery. Record its digest and counts in private operator evidence.

Before any incremental append, rollback can keep the additive schema and old server while organizations remain uncut. After cutover, **do not turn off the flag or deploy an old writer**: its saves are intentionally rejected. Stop writes and keep the new server in a read/export mode while repairing forward. To restore an older server, first restore the checkpoint into an isolated target and reconcile every later immutable submission/audit record; only a dataset that fits the old format can be reconstructed into an old bundle. Never reset the live database or discard post-cutover history. Test managed Auth recovery independently before hosting customers.

## Measured evidence and limits

Local tests verify canonical legacy cutover, immutable checkpoints, atomic conflicting writes, idempotency, concurrent appends, watermark pagination, membership revocation, privileged-RPC denial, cross-robot references and overflow behavior. A PGlite benchmark appended 1,200 synthetic runs in twelve bounded batches, with observed write time 376–922 ms, page time 9–18 ms and process RSS 402–435 MiB across runs. These measure the local test engine, not managed PostgreSQL capacity.

Hosted synthetic verification passed cutover for both existing organizations, an appended run/exact snapshot, retry deduplication, viewer/cross-tenant denial, relogin and archive audit linkage. The measured save was 776 ms. The full 10-organization/200-robot/10,000-run/200,000-event envelope and multi-reader hosted load remain unverified; no five-second capacity promise is made. B5 supplies the separate structured-event ingestion path. Customer recovery, operational release and actual customer evidence remain open gates.
