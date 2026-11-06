# Tavrik backend master plan and implementation prompts

Prepared October 15, 2026. Project: `C:\Users\carte\Desktop\npk-unify`.

## How to use this pack

In this project, say **Start prompt B1** (or B2 through B13). The agent must read this file's master context and selected stage, the full [business brief](../build.md), [repository instructions](../AGENTS.md), and [current progress](build-progress.md). It must use `plan-before-edit`, perform the required read-only pre-edit review, present its plan, implement only the selected stage, verify it, perform a separate final read-only review, and update progress. Resume existing work; do not automatically start the next stage. These are coding-agent instructions, not shell commands. Complete each stage's checks before starting dependent work. This pack plans future implementation; it does not claim those features already work.

This repository copy is the entry point for numbered B prompts. `build.md` remains the business source of truth; `docs/build-progress.md` owns current implementation and evidence status. The starting-point inspection below is historical. B1's hosted synthetic persistence and isolation checks passed October 18–21; see [B1 activation](backend-activation.md) and [the audit](base-prompts-audit-2026-10-20.md). Managed recovery and customer hosting remain gated. On October 21 the founder explicitly requested B1–B5 together; execute those in dependency order, without automatically starting B6.

Continuation direction, October 24: the founder explicitly requested finishing B5 and then B6 and subsequent numbered prompts in order. This supersedes the earlier stop-at-B5 instruction for this authorized sequence. Finish each stage's checks before dependent work; external setup, recovery, customer evidence and release gates remain intact. See build.md section 10 and current progress.

The original Prompt 6 has been implemented in code. Begin with B1, which verifies and connects that implementation. Do not rebuild completed stages blindly. Original Prompt 7's investigation workflow is incorporated into B7; original pilot and launch prompts remain relevant and are covered by B13. Predictions extend the original advanced-capability stage.

## Verified starting point

- The root Next.js application exports a static public showcase. Its demo imports bundled synthetic records.
- The local workspace uses tab-memory drafts and explicit JSON export. In hosted mode the shared component instead supports explicit saves to an organization.
- `beta/` is a separate Next.js server. `npm run dev:beta` targets loopback port 3002. Its existing UI has email/password login, organization selection, member/collector administration, saved-record loading and export.
- `lib/beta/server.ts` calls Supabase Auth and PostgREST. Saves call the `beta_command` database function; reads load the organization workspace.
- `supabase/migrations/202610130001_private_beta.sql` defines organizations, memberships, workspaces, robots, snapshots, runs, corrections, mappings, investigations, invitations, collector credentials, ingestion receipts and audit events.
- Current persistence retains a complete workspace bundle plus immutable relational payloads. It is limited to 2 MiB and 1,000 entries per record collection. This is not the intended long-term ingestion architecture.
- On inspection, `beta/.env.local` was absent. Root `.env.local` contained only contact/site variable names. Required beta variables were absent from the inspection process. No response was obtained from `http://127.0.0.1:3002/api/status`. This does not prove no remote project or separately configured deployment exists.
- The progress log explicitly distinguishes local PGlite/mock verification from outstanding live Supabase Auth/PostgREST, deployed isolation and managed recovery checks. Earlier test results were not rerun during this inspection.
- Google login, client/project permissions, automated webhook reporting, production robot execution and validated predictive models are not established by this inspection.

## Master context — paste first

```text
You are implementing the Tavrik robotics backend in C:\Users\carte\Desktop\npk-unify.

Read AGENTS.md, the full build.md, current build progress, applicable skills and affected code before planning edits. Preserve unrelated work. Inspect what actually exists and distinguish implemented, locally tested, live verified and customer validated states. Follow repository preflight and review requirements.

The product connects a robot's physical configuration, CAD references, software, calibration, settings and test conditions to immutable run history. Engineers compare runs and investigate changes. Recorded differences do not prove causation.

New founder direction expands the plan: developer companies have teams serving multiple clients; clients can sign in with restricted access; Google authentication is required; robots/services have independent scoped identities; integrations can read, write and request jobs; JSON reports are available by API and delivered automatically by webhook; prediction capabilities remain unavailable until suitable real data and evaluation support them. Physical robots take priority, CAD is important, and AI-agent execution is a later extension.

Record this expansion explicitly in the business brief. Earlier exclusions of fleet control, model training and broad connectors are revised only for the staged scope described here. Preserve human control, evidence semantics, tenant isolation and truthful release claims. Planning a connector is not proof that it works.

Reuse Next.js/TypeScript, Supabase PostgreSQL/Auth, existing immutable record contracts and the Python collector. Supabase is the PostgreSQL platform, not a second unrelated database. Use private object storage or customer-owned artifact references only when needed; initially keep raw recordings, CAD files, source, weights and datasets outside ingestion.

Use short server requests and durable asynchronous workers for connector jobs, report delivery and model jobs. Select worker hosting after documenting runtime, retry, networking and deployment requirements. Do not assume a queue itself executes jobs or that an HTTP request can safely run a long task.

Authorization is server- and database-enforced. Never trust a browser-provided tenant/client/project ID without verifying the actor's access and the record relationships. Use RLS on exposed tables; isolate privileged operations and test them. Keep secrets off the browser and out of logs. Do not use user-editable metadata for roles. Distinguish human sessions, robot/collector credentials and external client API credentials.

Physical robot commands are high-level requests to a local gateway/controller, not cloud servo control. Local safety interlocks, operator permissions and execution authority remain authoritative. No prediction automatically changes robot behavior. Never blindly retry an uncertain physical action.

Preserve exact historical snapshot references, provenance, units, observed and received times, correction history and known/unknown/not-applicable states. CAD revisions do not prove installed hardware changes. Synthetic examples and simulations must not count as real production training evidence.

For each prompt: inspect and present the implementation plan, implement only that stage, run meaningful targeted checks, review the changed scope, update build progress and report results and exact blockers. Do not fabricate external credentials, live test results or customer evidence. Future stage prompts are not authorization to execute all stages at once.
```

## Architecture and initial targets

Organization = developer company and primary tenant. Teams organize its employees. Clients represent customer relationships; projects belong to one organization and may belong to a client. A client user receives explicit project grants, never automatic organization-wide membership. A person may access several organizations or clients through separate memberships. Devices and service identities receive explicit scopes.

Data flow: collector/gateway → authenticated ingestion → durable run/event records → worker processing → portal/API reports → signed delivery to client systems. CAD connectors add versioned design references. Command requests take a separate authorized path to a local gateway. Prediction processing reads curated eligible records and writes versioned assessments.

Proposed initial load-test envelope: 10 developer organizations, 200 total robots, 10,000 job/test runs per day, an average of 20 structured events per run, and bursts of 100 events/second. Target connected run updates within five seconds under this envelope; test rather than promise it. A run is a defined job/test execution, not every sensor sample. Specify payload distributions, concurrent readers and tenant skew in benchmarks. Test offline retention for 24 hours at the agreed workload; handle disk exhaustion explicitly. Retention and storage cost require measured volumes before production settings are fixed.

## B1 — Activate and prove the existing backend

```text
Inspect the existing Prompt 6 implementation without rewriting it. Map public demo, local tab-memory workspace and hosted beta routes. Verify the actual environment source and target Supabase project without printing credentials. Check whether the migration is applied; never replay it over an unknown schema.

Use an explicitly identified synthetic staging environment. If project access/configuration is missing, report the exact missing items and finish independent local work. Do not claim the local configuration-status route proves database reachability: currently it only checks configuration.

Establish the beta's real Auth/PostgREST connection and provision synthetic test identities/organizations through the authorized setup. Exercise sign-in, create/import robot and snapshot, record run, Save to organization, reload, sign out, sign back in and read the same record. Confirm the exact database rows and revision references, not only a success banner. Test a second organization and a viewer against reads, writes, exports and foreign references.

Provide a clear local entry to the private app, preserving the public synthetic demo boundary. Show saved versus unsaved state, save errors, last successful save, and actionable empty states. Keep operator infrastructure diagnostics restricted to administrators. Update misleading status text according to verified capability, without claiming production availability.

Deliver: persistence trace, environment/setup guide, precise live verification results and a usable private workspace. Do not proceed as though staging works if only mocks pass.
```

## B2 — Replace bounded whole-workspace persistence

```text
Plan and implement a backward-compatible transition from the 2 MiB/1,000-entry whole-bundle model to incremental relational persistence. Inspect existing normalized payload tables first; extend them rather than creating competing sources of truth. Preserve IDs, provenance, immutable snapshots, corrections, exact run references and original submitter audit linkage.

Design cursor-paginated robot history, run details, snapshots, corrections and event queries. Use append-oriented writes, atomic per-operation idempotency, selective indexes and query plans. Avoid loading or rewriting an organization's full history for every event. Keep existing imports/exports working through versioned adapters; stream or background large exports.

Produce migration/backfill verification, counts and canonical content checks, cutover strategy, compatibility window and rollback procedure. Never edit a migration already applied elsewhere. Test migration with synthetic legacy records, conflicting versions, concurrent writes, large histories and tenant-qualified relationships. Separate import payload limits from history size. Keep retention/deletion explicit; do not silently discard history to satisfy limits.

Deliver: scalable storage path with a demonstrated workload benchmark. Report measured latency and resource use; the target envelope is not a capacity claim until tested.
```

## B3 — Google authentication and account lifecycle

```text
Add Google sign-in using current Supabase Auth guidance and the installed application framework. Verify current callback, cookie, token and API-key handling rather than copying stale patterns. Keep provider access tokens separate from application sessions; Google login does not authorize CAD access.

Implement callback allowlists, safe return destinations, session renewal/expiry, sign-out, account recovery and invitation acceptance. Handle account linking deliberately so matching email alone cannot silently merge access. Use verified identity/email rules for invitations. An email domain alone must not grant membership.

Preserve existing beta accounts or document a safe migration. Store permission truth in protected membership/grant records; ensure removal and role changes are enforced promptly despite cached tokens. Require stronger reauthentication for sensitive ownership/credential operations where appropriate.

Test successful/cancelled login, expired sessions, revoked access, malformed callbacks, invitation email mismatch and linked-account cases. Report provider setup that must be completed in the external console. Deliver working authentication, not just a Google-styled button.
```

## B4 — Organizations, teams, clients and permissions

```text
Extend organization membership to teams, clients, projects and explicit grants. A developer organization may serve many clients; each client may have multiple projects and users. Do not grant client users the existing organization-wide viewer role as a shortcut. Protect all nested records with organization/project relationship checks and database constraints.

Define a permission matrix before implementation. Initial roles: organization owner/admin, engineer, operator, internal viewer and client viewer. Separate permission to view internal evidence, configure integrations, issue credentials, request jobs, approve commands, publish reports and manage membership. Engineers should not automatically administer organization ownership. Client viewers default to published reports and explicitly shared project/run fields.

Implement single-use expiring invitations, revocation, team membership, client project grants and last-owner safeguards. Team membership must not accidentally broaden a client's permissions. Enforce access through API, RLS, storage, subscriptions, exports and workers.

Test two organizations and two clients within one organization, including guessed IDs, cross-project foreign keys, permission revocation, grants changed during an export and indirect evidence access. Deliver usable admin screens and documented role semantics.
```

## B5 — Machine identities and durable ingestion

```text
Extend scoped collector identities to robot gateways and external API clients. Keep each identity tied to an organization and explicit project/robot capabilities. Hash bearer secrets, reveal them once, support expiry, rotation overlap, revocation, last-use metadata and per-identity limits. Never issue a Supabase service key to a customer or robot.

Publish versioned OpenAPI and JSON Schema contracts plus Python/TypeScript examples. Define a common event envelope: event ID, schema version, run ID, source identity, source sequence, observed time, received time, event type and approved payload. Derive/validate tenant ownership from credentials, not the payload. Return actionable validation failures.

Persist before acknowledging. Handle duplicate delivery, out-of-order events, clock skew, reconnection, stale credentials, oversized payloads and conflicting idempotency keys. Add durable local spool management, backoff with jitter, queue limits, explicit overflow behavior and acknowledgement reconciliation. Separate transport retry from re-execution of a physical job.

Capture API action/audit metadata without secrets or unrestricted customer payloads. Test replay, interrupted writes, credential revocation while queued and noisy tenants. Deliver ingestion health and last-seen status without treating silence as proof of failure.
```

## B6 — Run lifecycle and evidence for future predictions

```text
Create explicit jobs, execution attempts, run events, steps, measurements and final outcomes. Define permitted transitions for requested/queued/running/succeeded/failed/cancelled/timed-out/unknown states; distinguish acknowledgement from execution completion. Keep retries as distinct attempts linked to the original job.

Each run references its exact configuration snapshot, procedure/version, task, environment and robot/component identity. Store duration, workload, outcome categories, unit-qualified metrics, inspection/quality labels, downtime and operator interventions when actually observed. Add component installation/removal and maintenance/service events with operating hours or cycle exposure where available. Missing evidence remains missing, not zero.

Support delayed results, interrupted runs, late corrections and collector restart. Keep raw events append-oriented; derive current state through deterministic projection rules. Version labels/corrections and preserve what was known at each time. Distinguish real, simulation, synthetic and manual records.

Test state conflicts, late completion, duplicated terminal events, reconnects, inconsistent units and exact historical references. Display timeline, outcome and evidence provenance. Collect prediction inputs now without inventing predictions.
```

## B7 — Investigations and client-visible portal

```text
Complete original Prompt 7 on the new persistent model: engineer-selected comparable baseline, grouped configuration differences, evidence references, stale/missing information, notes and investigation states. Confirmed resolutions require an evidence note or retest reference; a difference alone is not a root cause.

Provide developer organization/project views and a restricted client portal using the same backend. Clients see only approved projects and published fields/reports. Separate internal investigation notes from client-visible summaries. Include run history, latest outcomes, reporting status and prediction readiness without exposing secrets or administrative diagnostics.

Add connected status updates with subscription authorization and refetch/reconnect fallback. Show last-updated time; do not imply a stale view is live. Preserve explicit save behavior where drafts remain local.

Test client-to-client isolation, shared report redaction, inaccessible evidence, revoked grants, pagination and investigation persistence. Complete responsive and keyboard-access checks on the changed flows.
```

## B8 — Integration framework and Onshape first

```text
Define a versioned connector contract: authenticate, discover authorized resources, read metadata, subscribe/poll, normalize records, reconcile, disconnect and declare supported write/job actions. Implement encrypted recoverable provider-token storage, refresh coordination, secret rotation, least-privilege scopes, rate limits, bounded retries and delivery deduplication.

Implement Onshape first using current official OAuth/API/webhook documentation. Record stable document/element IDs and exact versions or microversions; mutable workspace links alone are not immutable evidence. Link design references to robot/component configurations without claiming an installation occurred.

Build and test read/import first, then one explicitly selected supported write action and one supported asynchronous operation such as an export. Do not equate CAD export with robot execution or claim a generic simulation API exists. Show capability support accurately. Verify incoming webhook authenticity using documented provider mechanisms and reconcile missed notifications.

Inventory SOLIDWORKS/PDM installations for the next connector: desktop API, PDM server and cloud products have different requirements. Produce a second-connector implementation specification with a Windows agent if necessary. Keep a generic metadata/API adapter available for unsupported tools.

Test revoked grants, token refresh races, duplicate/missed events, immutable version capture, denied writes and retries. Document external setup and actual supported product versions.
```

## B9 — ROS 2 and Universal Robots gateway

```text
Extend the Python collector with a gateway interface that works without ROS and can load a ROS 2 adapter. Discover supported signals explicitly, allowlist fields and map units. Use supported Universal Robots interfaces as the first manufacturer adapter; verify robot/controller/driver compatibility before enabling features.

Begin with monitoring and run/test-runner linkage. Keep high-frequency robot traffic local; send structured events and useful health aggregates to the backend. Preserve references to existing recordings instead of uploading raw streams by default. Record connection gaps and observation quality.

Prefer outbound authenticated gateway connections so robot controllers are not exposed directly to the internet. Document installation, identity enrollment, upgrades, local storage and network requirements. Test against simulators/mock devices first, clearly labeling them, and specify hardware checks still required.

Provide an adapter contract for later ABB, FANUC and OPC UA support. Do not describe a protocol as universally available; check required controller options and versions. Monitoring acceptance does not automatically authorize motion control.
```

## B10 — Controlled job requests and integration writes

```text
Implement an auditable command-request workflow for approved high-level jobs and connector writes. Record requesting human/service, approved parameters, target, expected configuration/version, expiration, approval requirement and correlation ID. Resolve authorization both when queued and before dispatch.

Use requested/approved/dispatched/acknowledged/executing/completed/rejected/expired/unknown states with clear meanings. The local gateway checks execution authority, safety interlocks, operator mode and stale configuration before accepting. Cloud requests must not bypass the robot controller's safety systems. Never provide a cloud emergency-stop guarantee.

Use durable execution IDs and local deduplication. If a physical action may have started but its acknowledgement is lost, reconcile actual state or require operator intervention; do not automatically launch it again. Define cancellation acknowledgement and distinguish requested cancellation from confirmed stop.

Validate the complete workflow in simulation before a supervised hardware test. Test gateway disconnect, replay, expired approval, changed permissions/configuration and ambiguous outcomes. Keep unsupported command types disabled and predictions advisory.
```

## B11 — JSON reports, client API and automatic webhooks

```text
Create a versioned, schema-validated report format and durable publication record. Include report/revision IDs, client/project scope, reporting period, run references, measured outcomes, durations, quality measurements, evidence completeness and generation time. Distinguish measured facts, engineer conclusions and model assessments. Unknown values remain explicit. Corrections produce a new revision referencing the earlier report.

Offer authenticated report retrieval, cursor pagination and scoped client service credentials. Client portal and API use the same authorization rules and approved field selection. Evaluate artifact access without embedding secrets or permanent public evidence links.

Automatically queue report.published/report.corrected events through a transactional outbox committed with publication. Implement a worker with signed payloads, timestamp/replay protection, stable delivery event IDs, exponential retries, timeouts, dead-letter state and controlled replay. Document at-least-once delivery and receiver deduplication; do not promise exactly-once receipt.

Validate configured destinations and enforce outbound network restrictions against SSRF, private/link-local addresses, DNS rebinding and redirect bypass. Store signing secrets securely and support rotation. Recheck authorization before delivery/replay. Capture delivery metadata without unrestricted report bodies or secrets in logs.

Deliver a sample receiver and automated tests for duplicate deliveries, timeout, non-2xx responses, secret rotation, tenant isolation and revoked recipients. Test only against authorized test endpoints, not real client destinations.
```

## B12 — Prediction readiness, evaluation and advisory models

```text
Build readiness before model activation. Define separate targets: pre-run failure probability, completion duration, a specified quality metric and a scoped maintenance outcome/horizon. Define eligible cohorts by procedure, robot/component configuration, operating context and data provenance. Record the prediction decision time so features cannot leak future outcomes.

Expose collecting_data, insufficient_labels, evaluating, available, degraded and paused states per capability/cohort. UI/API should explain missing comparable runs, outcomes, measurements or maintenance exposure. Minimum counts may be configurable screening rules, never sufficient proof of readiness. Do not show a fabricated universal progress percentage or promise unlocking after a fixed number of runs.

Implement reproducible datasets, feature/label versions, training provenance, model registry and prediction records with model version, timestamp, input snapshot, applicability and uncertainty. Exclude synthetic demo data; keep simulation cohorts separate. Tenant data stays private by default; pooling requires explicit rights and a separate policy.

Begin with transparent baselines and offline time-based evaluation on unseen later data. Prevent leakage across repeated jobs or near-duplicate runs; evaluate transfer to unseen robots if making that claim. Report calibration/precision-recall for risk, duration errors and interval coverage, task-defined quality errors, and maintenance lead-time/false-alert measures with censoring handled appropriately. Rare failures and missing maintenance outcomes may keep a capability unavailable.

Deploy only validated capabilities in shadow/advisory mode, monitor drift and missing features, allow abstention and rollback, and record realized outcomes for evaluation. Never turn a prediction into automatic robot control. Deliver model-specific evidence and limitations; readiness can be complete while all models remain unavailable.
```

## B13 — Operational verification, pilot and release

```text
Connect the completed work to original Prompts 8 and 9. Build a synthetic end-to-end staging demonstration: Google sign-in, organization/team/client grants, CAD reference, collector run, immutable snapshot, comparison, client report, webhook acknowledgement and truthful prediction-readiness state.

Load-test the agreed envelope with realistic payload sizes, tenant skew and concurrent reads. Measure query latency, ingestion lag, queue backlog, delivery success and storage growth. Add tenant limits, backpressure, retention tiers and alerts supported by results. Exercise collector/gateway disconnect and worker restart.

Run deployed authorization tests across organizations and clients, credential revocation, immutable history, restore into an isolated environment, recovery of Auth and worker state, deleted-data reconciliation, migration rollback and webhook/command replay safety. Specify measured recovery point/time objectives and operating cost assumptions. Do not treat record export as a complete database backup.

Create operator runbooks, integration compatibility matrix, client onboarding guide and four-week pilot measurements. Capture coverage requires an independently known expected-run denominator. Distinguish founder-assisted activity from independent customer use.

Publish only the agreed release to the identified environment when release access and authorization exist. Verify actual live flows and report unresolved blockers. Documentation should accurately distinguish supported integrations, simulation-only command checks and unavailable predictive capabilities. Customer outreach and billing require their own explicit authorization.
```

## Overall definition of done

An authorized developer can sign in, onboard a team and client project, connect a supported collector/tool, persist a real run with exact provenance, inspect it after signing back in, compare it, and publish an appropriately scoped report. An authorized client can view that report and receive it through an auditable webhook. Unauthorized users/services cannot cross organization or client boundaries. Commands execute only through authorized local control. Predictions display a defensible unavailable state until each capability passes its own evaluation.

## Research behind connector order

This is a practical integration shortlist for the initial manipulation-team niche, not a market-share ranking. Vendor case studies establish examples of use, not prevalence across all robotics teams.

- ROS ecosystem: https://discourse.openrobotics.org/t/2025-ros-metrics-report/52575
- Universal Robots supported interfaces: https://docs.universal-robots.com/Universal_Robots_ROS_Documentation/
- Onshape robotics examples: https://www.onshape.com/en/solutions/robotics
- Onshape OAuth: https://onshape-public.github.io/docs/auth/oauth/
- Onshape webhooks: https://onshape-public.github.io/docs/app-dev/webhook/
- SOLIDWORKS / Plus One Robotics: https://www.solidworks.com/customer-story/plus-one-robotics-expanding-and-accelerating-parcel-handling-robotics-development/
- SOLIDWORKS PDM API setup: https://help.solidworks.com/2026/english/api/pdmprowebapihelp/GettingStarted.html
- ABB developer interfaces: https://developercenter.robotstudio.com/
- FANUC official driver: https://github.com/FANUC-CORPORATION/fanuc_driver
- OPC UA robotics model: https://profiles.opcfoundation.org/document/63
- MCAP: https://www.foxglove.dev/product/mcap

Check current provider documentation and deployed versions again during each implementation stage.
