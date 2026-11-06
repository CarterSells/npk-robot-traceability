# Original Prompt 8: four-week pilot

November 1 scope update: use [current backend operations/onboarding](backend-operations.md) and [incremental history](incremental-history.md) for later B2–B12 capabilities and bounds. The 2 MiB/1,000-entry limit below describes the original bounded workflow; after B2 cutover it applies per import/editor batch, not total saved history. Reports are implemented and synthetic-tested; commands remain simulation-only, CAD provider acceptance is deferred and all predictions are unavailable. Customer-hosting gates remain open.

Source of truth: [build.md sections 8–9](../build.md). This guide prepares a measured pilot; it does not report customer participation, savings, willingness to pay or production readiness. B8 (CAD integrations) is a separate stage.

## Before enrolling

- Identify the engineer and buyer, one test workflow and up to five robots. Agree procedures, conditions, eligible runs, supported fields and who confirms physical changes.
- Complete the real-customer hosting gates in [private-beta.md](private-beta.md), including deployed isolation and managed recovery. Existing synthetic verification is not permission to host customer records.
- Owner prepares organization memberships, saves approved robot records and issues robot-scoped collector credentials. Members can save; viewers can compare; only owners can see pilot measurements.
- Engineer previews collector output and approves metadata fields. Keep raw source, models, recordings, datasets, credentials and private evidence out of uploads and notes. Customer owns hardware confirmation, procedure labels, eligible-run records and permission to share evidence.
- Verify snapshot → run → comparison → investigation → save → sign out/in → export with synthetic data. Confirm revoked access and collector credentials fail. The operator owns configuration, recovery, support and incident response.
- Agree baseline method, success criteria, price proposal, end date and review schedule privately. Do not commit populated worksheets or customer exports. Store exports in customer-approved private storage outside this repository.

Supported scope is the existing bounded metadata collector, explicit workspace saves, immutable snapshots, comparison and engineer investigations. The current 2 MiB / 1,000-entry collection limits still apply. No automatic diagnosis, hardware change verification, robot execution, CAD connector, model prediction or billing is added.

## Baseline worksheet (blank template)

Record one row per actual observation in approved private storage:

| Field | To record |
| --- | --- |
| Scope | Robot/procedure/conditions and eligible-run definition |
| Observation | Date and sanitized incident reference |
| Reconstruction | Active engineer minutes to identify relevant configuration changes, separately from debugging or repair |
| Method | Start/stop rule; pause waiting time; number of engineers and sample count |
| Assistance | Independent / founder-assisted / unknown; reminders and interventions |
| Capture | Independent runner expected eligible runs and matching unique captured runs, same scope and UTC interval |
| Limitations | Missing records, incomparable cases, estimates (kept separate from measured totals) |

Enter total observed minutes and sample count in the dashboard. Never substitute an estimate for a measured value. Compare baseline and pilot minutes per sample only when sampling methods and incidents are sufficiently comparable. This is observational evidence, not a causal savings claim.

Negotiate targets before enrollment: suggested 90% capture coverage **only with a known denominator**; visible missing information; observed hardware-entry time below a minute; an agreed reconstruction improvement; independent repeated use. Record actual targets in “Negotiated success criteria.” These are proposals, not achieved performance.

## Dashboard and weekly reviews

Open the database-backed beta, choose an organization as owner, then expand **Four-week pilot · owner dashboard**. Save a robot before enrollment. Choose today or a future UTC start date. The plan is immutable, one 28-day pilot per organization in this initial stage; no repeat-pilot lifecycle is implemented. Synthetic status comes from the saved workspace. Historical activity is not backfilled.

Review each week with the engineer and buyer:

1. Week 1: verify onboarding, missing evidence, independent denominator capture and the baseline protocol. Record setup support time.
2. Week 2: inspect capture gaps, retries, hardware-entry timing and actual comparisons. Separate reminders and assisted sessions from independent usage.
3. Week 3: repeat reconstruction measurements using the agreed method; inspect unresolved investigations and support burden. Ask the buyer about value and ongoing price; record their actual response.
4. Week 4: assess adoption, value, coverage, support effort and willingness to pay. Choose proposed paid continuation, revised scope/value/pricing, or stop. A positive demo response alone is not adoption.

Review form values are owner-reported observations. Leave unknowns blank; zero means observed zero. Use support minutes for active founder work (setup, troubleshooting, reminders and reviews), excluding waiting time; describe categories in the evidence note. Count sessions consistently and record how assistance was determined. Add measurement method, buyer response, limitations and correction reason. Weekly values are totals to date for that week, not increments. Saving appends a revision; the dashboard uses the latest. Export retains all revisions. Future weeks cannot receive a review. Partial weeks must be labeled in the note.

Export refreshes authorization and downloads versioned JSON containing the plan, review history, activity and limitations. It contains no robot configuration payload. It may contain private business notes: share deliberately. Exports are not full database backups.

## What activity means

- **Snapshot saved:** a save transaction introduced at least one snapshot revision. First timestamp is first observed since enrollment, not first lifetime snapshot. The count is save transactions, not number of snapshots.
- **Comparison:** the UI displayed an existing saved run against an earlier successful run of the same robot. Count deduplicates pair/user/UTC day. It does not establish comparable conditions, usefulness, comprehension or independent adoption.
- **Weekly active organization:** 1 for this organization when a human workspace save or comparison was observed in that pilot week; otherwise 0 observed in a started week. Future or unenrolled weeks export `null` and display “Not yet observed.” This is not a cross-tenant dashboard. Collector-only activity is separate. Missing tracking cannot prove inactivity.
- **Ingestion success:** a committed collector save. Idempotent retries do not add success events. **Failure:** a failed attempt after valid scoped credential lookup; retries may add failures. Invalid credentials, malformed/oversized JSON before attribution and outages are not comprehensively observable. The failure response preserves the original error and reports `X-UNIFY-Pilot-Tracking: unavailable` when recording failed.
- Automatic events carry organization, kind, server time and a deduplication key, without configuration contents. Assistance is unknown for automatic activity. Manual weekly session counts do not relabel raw events.
- Coverage is calculated only from the matching captured count and independent expected eligible-run count supplied by the runner and reconciled by the engineer. The application cannot discover missed runs. A zero denominator yields no percentage. Ingestion attempts are never substituted for unique captured runs.

## Price and end decision

Approximately USD 1,000 for four weeks is an unvalidated negotiable hypothesis. Record any proposed ongoing price and buyer response in the private review note. A free design partnership needs a defined end date and otherwise unavailable feedback/access. “Continue paid” records a proposal only; outreach, contracting, charging and subscription activation require separate authorization. If there is use without willingness to pay, revisit urgency, buyer, scope and price. If there is demo enthusiasm without use, investigate workflow fit before expanding features.

## Migration and operation

New additive migration: `supabase/migrations/20261020030024_stage8_pilot.sql`. It adds three owner-readable RLS tables, trusted-server RPC and an audit trigger; it does not rewrite existing records or backfill analytics. Existing migrations must already be present. Environment variables remain those in [private-beta.md](private-beta.md); no new secrets or browser keys.

For local development after Docker is available, from the project root:

```powershell
$env:PATH="$PWD/.tools/node-v24.21.0-win-x64;$env:PATH"
npm.cmd run db:start
npm.cmd run dev:local
```

Local Studio: http://127.0.0.1:54323 ; beta: http://127.0.0.1:3002 . `db:start` applies pending local migrations without resetting data. For the already configured hosted target, `npm.cmd run dev:beta` starts the app. **The Stage 8 migration was applied and synthetically live-verified on October 20**, recorded remotely as `20261020210031_stage8_pilot`. Compare the remote migration inventory to [hosted-supabase.md](hosted-supabase.md); remote versions differ from local filenames. Do not blindly run `db push` or replay the base schema. Other environments still require the migration and their own verification.

Verify in synthetic staging: enroll owner, save a new snapshot, compare saved runs, exercise collector success/retry/failure, append and correct a weekly review, sign out/in and export. Confirm second-organization and viewer denial on all pilot tables/API; revoked membership must deny fresh export. Verify existing save paths still work. This migration participates in save transactions: a trigger failure rolls back the save rather than acknowledging an unpersisted record.

Rollback: retain the three pilot tables and their data; disable the pilot UI/route deployment, then disable `record_pilot_activity` on `public.audit_events` if it causes a regression. Restore the previous application release. Disabling tracking creates an observation gap; disclose dates and do not backfill inferred usage. Do not reset or drop data as a rollback. Managed restore and actual customer validation remain separate gates.
