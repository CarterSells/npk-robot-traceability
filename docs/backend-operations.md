# Backend operations and release evidence (B13)

Current checkpoint: November 1, 2026, local time. Authority: [build.md](../build.md), especially sections 6–10. Detailed results: [build progress](build-progress.md). This guide updates the older [operating guide](operations-guide.md), [release checklist](launch-readiness.md) and [pilot guide](pilot-guide.md) without turning preparation into a launch. B13 is partially prepared; deployed acceptance is blocked on the targets and evidence below.

## Supported scope and compatibility

| Component | Implemented/checked | Open acceptance |
| --- | --- | --- |
| Next beta + hosted Supabase | Loopback server, synthetic Auth/database persistence, role/project isolation, exact revisions | Final HTTPS application/proxy, production project and deployed authorization |
| Google login | PKCE/session/linking software and mocked provider tests | Configured provider and real success/cancel/linking verification |
| Incremental history and generic collector | B2/B5/B6 durable ingestion, receipts, lifecycle and archive; synthetic hosted tests | Proposed production workload, Linux/power-loss recovery, actual customer capture |
| Client portal | Published fields, project grants, reconnect/revocation, JSON reports/downloads; actual Chrome | Real client comprehension and final deployment checks |
| Onshape | Exact CAD references, encrypted OAuth framework, approved jobs; simulated-provider acceptance | HTTPS callback, developer/OAuth setup, authorized test document, actual refresh/read/write/export checks |
| SOLIDWORKS/PDM | Connector specification | Installed edition/version/authentication inventory and implementation |
| UR ROS 2 status gateway | Three allowlisted status observations, missing-data handling, subscriber-only mock tests | Exact ROS/controller/driver inventory, simulator and supervised hardware, deployed transport |
| Controlled requests | simulation.check only; actual Python journal/handshake with hosted API bridge | No motion adapter; no robot simulator, physical execution or safety certification |
| Reports/webhooks | Immutable publications, scoped API, signed/retried outbox; hosted database with injected receiver acknowledgment | Persistent signing encryption keys, approved receiver, real HTTPS, egress policy, worker scheduling |
| Predictions | Four unavailable readiness explanations; offline curated baselines and candidate artifacts | Real datasets, evidence review, deployed registry/serving/monitoring; maintenance survival evaluation |

Read [gateway](robot-gateway.md), [commands](controlled-commands.md), [Onshape](onshape-integration.md), [reports](reports-and-webhooks.md) and [predictions](prediction-readiness.md) for exact versions, limits and interfaces. No controller compatibility is certified by the existence of an adapter. CAD revisions do not prove physical installation. Synthetic test fixtures never establish real-world prediction performance.

## Rehearsal and release evidence

Use two synthetic organizations, internal roles, two client accounts and robot-scoped credentials. Preserve their private manifests outside public assets. Record application artifact/version, migration checksums and actual remote versions, origin, timestamp and operator for each run.

1. Sign in using the intended provider; test cancellation, explicit linking, session expiry and revocation. Email/password staging checks cannot stand in for Google.
2. Grant team/internal membership separately from explicit client-project access. Verify the other client and organization are denied by both API and direct database paths.
3. Capture approved metadata with manual hardware provenance visible, persist an exact snapshot and run, then sign out/in. Compare a failed test against an engineer-selected comparable success. Confirm unknowns and condition warnings, without causal claims.
4. Resolve a CAD reference to an exact provider version using the approved synthetic document. Keep installed hardware confirmation separate. The existing simulated-provider run is not this acceptance.
5. Review selected execution evidence and publish a B11 revision. Verify client portal/service API equality, correction history, exact download and revoked-recipient denial. Record publication event ID.
6. Against an authorized test receiver, start the separately hosted worker. Verify signature/timestamp, durable receiver deduplication and acknowledgment; inject timeout/non-2xx and a lost acknowledgment; confirm stable event IDs and controlled dead-letter replay. Verify redirects/private destinations are denied at application and network layers.
7. Confirm each prediction capability remains unavailable until its own evidence and deployment gates pass. An offline candidate or simulation cohort must not make the portal available.
8. Disconnect/reconnect collector/gateway and restart workers. Retain the original bytes, receipts and journal. Never rerun an uncertain command to prove recovery; confirm its unknown/manual reconciliation behavior.

Actual evidence today: B10 hosted command API plus Python bridge, B11 hosted publication/API plus injected signing receiver, B11/B12 real Chrome client flows and earlier B1–B9 synthetic tests. No single deployed Google-to-real-provider-to-internet-receiver rehearsal has passed.

A small November 1 read smoke used loopback Next development plus hosted synthetic Supabase: 20 report/readiness GETs at concurrency 4, one client/project, 0 errors, min 228 ms, p50 558 ms, p95 821 ms, max 848 ms. These are end-to-end request times, not database query timings or a production capacity SLA. Private raw result: ignored .cache/b13-read-smoke-result.json. No ingestion lag, sustained queue drain, storage growth or provider throughput was measured by this check.

## Proposed workload, limits and observability

The prompt pack proposes 10 organizations, 200 robots, 10,000 runs/day, 20 structured events/run and bursts of 100 events/second. This is **unverified**. Before testing, identify isolated staging host/database, runtime/plan, authorized cost cap, duration and rollback owner. Document measured payload percentiles, tenant skew, bursts, concurrent readers and receiver behavior; use synthetic metadata only. Do not run the full envelope against the sole current environment without that isolation and budget context.

Measure p50/p95/p99 query/request latency by operation; observed-to-ingested/ingested-to-published lag separately; oldest queued age, depth, retry/dead counts and acknowledgment rate; CPU/memory/connections; actual table/index growth and egress. Run cold/warm cases, a dominant tenant, reader contention, provider rate limits and 24-hour disconnected queues at the agreed workload. Preserve unknown clock offsets and missing denominators. Do not call a short warm read sample a five-second ingestion guarantee.

Current protective bounds are documented in the feature guides: bounded imports/pages, scoped machine rate limits, 1,000-entry/256 MiB local queues, bounded command journals/requests, 25-attempt report selections, 10 endpoints/100 issued report credentials per organization and 60 report API requests/minute per credential. These are staging controls, not a proven capacity allocation. Reaching capacity rejects new work; it must not evict unacknowledged evidence. Review tenant limits/backpressure against measured results before customer admission.

Configure redacted operational metrics for request failures, ingestion lag, oldest backlog, dead deliveries, unknown commands, queue/disk exhaustion, expired credentials, key-unseal failures and worker heartbeat. No bodies, headers, tokens, private URLs or unrestricted provider errors in logs. Assign an actual operator and escalation route and exercise alert receipt before release. Alert destinations and thresholds are not configured by this document.

Retention tiers remain undecided: immutable engineering history, transient delivery metadata, private offline artifacts and backups need separate customer-approved periods and deletion reconciliation. No automatic retention purge is enabled. Estimate operating cost from measured monthly rows/index bytes, backup retention, requests, outbound bytes, worker runtime and provider quotas, using the chosen plan's current prices. No measured monthly cost or paid upgrade is claimed.

## Recovery and rollback

Follow the [existing isolated recovery procedure](private-beta.md), extended for B5–B12:

1. Stop ingress and all connector/report workers, disable command dispatch, and preserve queue/journal evidence before the drill. Record the last durable source and database receipts. Restore only to a separately identified isolated target with no customer receivers or robot access.
2. Capture schema/migrations/grants/RLS, application and Auth state consistently; inventory provider configuration, signing/encryption key versions, external artifact locations and local queues/journals. Backups do not replace separate secret recovery. Supabase [database backup guidance](https://supabase.com/docs/guides/platform/backups) states Storage objects are not included; verify the selected plan's backup capabilities rather than assume them. No real raw artifacts are hosted by this implementation.
3. Recover exact snapshot/run/lifecycle relationships, project grants, approved sessions, machine identities/events/receipts, connector jobs/secrets, command grants/requests/states/events, report publications/credentials/endpoints/deliveries/attempts, pilot state and private offline evaluation artifacts. The v2 history archive omits command/report state and is not a full recovery backup.
4. Reconcile a separately protected deletion/revocation ledger after the backup point. Revoke restored outstanding invitations and machine/collector/report credentials; invalidate restored sessions and rotate/reissue approved secrets before reconnecting. Restore no endpoint merely because its old row exists. Verify current client grants and issuer permissions.
5. Report delivery leases can expire and resend the same stable event ID. Restore the receiver's durable inbox consistently or expect duplicates and reconcile; never promise exactly-once receipt. Test restored signing-key availability/rotation and authorization before a deliberate synthetic replay.
6. Command execution latches and local journals require separate reconciliation. A backup predating an execution is not proof it never ran. Leave ambiguous work unknown; never clear a journal or create a replacement command ID to repeat it. Manually reconcile with actual local evidence. Onshape uncertain writes also require provider-side reconciliation before further writes.
7. Run fresh Auth/tenant/client/API/RLS denials, exact-reference/immutability tests, revoked-token checks and synthetic publication/receiver checks in the restored target. Keep production disconnected until the operator accepts results.
8. Record actual recovery-start/usable-service times and latest durable source/restored record times. Derive measured RTO and RPO from these observations, including missing-event reconciliation. Both remain **unmeasured** today. Record target and accepted objective separately; do not invent an SLA.

Migration rollback is a reviewed forward repair or application rollback that preserves additive tables/history. Do not drop B10/B11 tables to disable features. Stop workers and disable their flags; already-sent requests cannot be recalled. After B2 cutover, an older whole-workspace writer is incompatible: retain the new reader/export path and repair forward. Rehearse any schema/application rollback on the isolated restored target first. No live reset or restore is authorized by this guide.

## Client onboarding and four-week pilot

After customer-hosting gates pass, identify a verified engineer, buyer and operator; approve one workflow, field allowlist, exact procedures/conditions, robot/component confirmation responsibilities and retention. Use the [permission matrix](project-permissions.md) to invite internal roles and separately grant client viewers. Registration alone grants no organization access. Invitations are not automatically emailed.

Preview one capture, record a real outcome, compare exact snapshots and confirm the client sees only deliberately published fields. Review every report selection/conclusion before publication. Issue least-scope expiring service credentials; disclose keys once through an explicitly authorized private channel. Verify receiver ownership, signature validation, deduplication and revocation with synthetic reports before any customer report. Rotate keys and confirm offboarding/deletion procedures. No outreach, customer enrollment or billing occurs automatically.

Use the existing [four-week pilot dashboard and worksheet](pilot-guide.md): record setup/support time separately from independent use, reconstruction time separately from repair, and unknowns separately from observed zeros. Capture coverage requires an independently known expected eligible-run denominator; ingestion counts alone cannot supply it. Weekly reviews retain corrections and method notes. Agree success criteria and buyer review before the pilot. Customer claims require actual approved evidence.

## Blocking inputs for release

Run the local configuration check before deploying, using Node 24 and environment values from the host secret manager:

```sh
npm run check:beta-deployment -- app
npm run check:beta-deployment -- report-worker
npm run check:beta-deployment -- connector-worker
```

For the existing local configuration, use `node --env-file=beta/.env.local scripts/check-beta-deployment.mjs app` (or a worker profile). Environment variables already present in the process take precedence. The checker does not automatically load a file, contact services, validate credentials, apply migrations or start a worker. Its JSON contains fixed messages, never supplied secret values. Exit 1 means invalid/missing profile settings; exit 2 means invalid invocation. Even a passing check returns `release_verified:false`.

The deployment profile requires exact HTTPS DNS origins on the default port, account lifecycle enabled for the app, consistent feature flags, distinct public/privileged credentials, and no detected private setting in NEXT_PUBLIC_ variables. It checks only known private setting names and exact copied values; it is not an exhaustive secret scanner. Connector configuration requires provider credentials and an encryption key ring. Report publication can operate without a worker; report delivery additionally requires the key ring and approved destination hostnames. DNS resolution, receiver ownership and production egress must still be verified at delivery/deployment. This stricter hosted profile does not change supported loopback development behavior or existing application configuration.

No final HTTPS beta origin/host or separate production/recovery target has been selected here. Worker host/scheduler, persistent encryption-key management, authorized external receiver, deployed egress policy, Google/Onshape provider acceptance, real ROS/controller inventory, measured load/24-hour queue retention, isolated managed restore, alert ownership and actual pilot evidence remain open. B12 deployed registry/serving/monitoring remains unimplemented; all models stay unavailable. These are recorded blockers, not technical completion or launch claims. Continue independent fixes when evidence reveals them; obtain actual targets before dependent deployment or recovery.
