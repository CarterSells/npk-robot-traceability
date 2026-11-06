# B5 machine identities and event ingestion

Implements [B5](backend-master-prompts.md) under [build.md](../build.md). This is approved metadata transport; no connector, physical job execution, prediction or customer hosting is enabled by it. B6 extends lifecycle semantics separately.

## Identity and permission contract

An owner/admin with a recent authenticated session creates a collector, gateway or external API-client identity in **Machine identities and ingestion**. First assign an existing robot to a project in the project panel. Each identity has exactly one immutable organization/project/robot scope. Issue another identity for another scope. Kinds describe the source; they do not confer extra permission. External API clients are organization-issued service identities, not human client memberships or access to future report APIs.

Choose `events:write` plus `receipts:read`, or receipt-only access. No machine can read internal records, administer membership, publish reports or execute a robot action. Human client project grants do not expose machine/event metadata. Server and database authorization check the current identity, credential, issuer's owner/admin permission and scope relationships on each request, including receipt lookup and duplicates. Removal/demotion of the issuer disables its identities; an administrator can revoke them and issue replacements. Legacy `uc_` collector tokens and their endpoint remain compatible and separate.

Tokens are random `um_` bearer secrets, shown once. Only SHA-256 hashes are stored in the existing credential table. Tokens expire in 1–90 days. Rotation retains the identity and source-sequence namespace, allows 0–60 minutes of overlap, and prevents a third live token until the preceding overlap ends or a token is revoked. Identity revocation revokes every token; individual token revocation preserves other valid tokens. Never give a robot a Supabase secret key.

Staging limits: 100 identities per organization; 1–600 authenticated storage operations per minute per identity, shared across receipt checks, new events and duplicate retries. Scope choices are bounded to 500 project/robot associations; credential display shows the latest 500 expiries. These are protective limits, not proven production capacity. Invalid envelopes rejected before storage and unauthenticated traffic require host-level request/rate limits before production. The writer preserves the existing organization lock order; this is not an unmeasured throughput claim.

## Versioned transport

- [OpenAPI 3.1 contract](api/openapi-v1.json)
- [JSON Schema for the event envelope](api/event-v1.schema.json)
- [TypeScript event builder](api/make-event.ts)
- [Python event builder](../collector/examples/make_event.py)

`POST /api/v1/events` accepts `run.recorded` schema version 1. Supply an event UUID, stable source identity, durable source sequence, run ID, observed UTC timestamp and one approved capture. The captured run must match the event and its exact revision-1 snapshot. Existing custom metadata, units, unknown/not-applicable values and manual hardware provenance use the existing capture validator. B6 adds `execution.recorded` for [lifecycle evidence](execution-evidence.md), using the same receipt and queue paths. Sequence allocation spans both types per identity. The envelope schema is structural; application validators also check full nested contracts and relationships. Raw source, recordings, datasets and weights are not accepted. Free text still needs human review.

The server derives tenant/project/robot scope from credentials, rejects unapproved envelope fields (including caller-supplied received time), and validates a maximum 2 MiB UTF-8 body. Database receipt time is separate from observation time. Future observations over five minutes ahead are flagged `clock_skew`; they are not silently rewritten. Old observations are allowed for offline delivery. Out-of-order source sequences are stored as received, not treated as causal ordering; a sequence may identify only one event per identity. B5 does not project running/completed states from these events.

Persist the complete event ID, sequence and serialized bytes before sending. Identical retries return the original receipt even after token rotation. Reusing an event ID with different UTF-8 bytes or a source sequence for another event returns 409. The event, immutable capture, project association, original submitter audit and receipt commit in one database transaction. A failure rolls them back together; no success banner is an acknowledgement of an uncommitted record. Event rows reference the existing run and audit records rather than duplicating capture payloads.

`GET /api/v1/events/<event-id>` returns only the current identity's receipt. Compare `body_hash` with SHA-256 of the original queued bytes before removing a local copy. A 404 means no receipt for this identity/event; submit the original event. A revoked or expired token cannot reconcile receipts. Apply the new rotated token to the same queue, preserving identity and bytes. 409 requires investigation; do not invent a new event ID merely to bypass conflicting history. 429 returns `Retry-After: 60`; 503 is retryable. A successful receipt is proof of metadata persistence, not proof a physical robot ran.

## Durable local queue

Use a separate private queue directory outside the repository for machine events. Configure Windows ACLs or POSIX permissions before storing private captures. Original captures remain outside the queue and are never deleted by flush. No background capture or upload is enabled.

```text
python collector/examples/make_event.py --capture <private-capture.json> --output <private-event.json> --identity <identity-uuid> --event-id <stable-event-uuid> --sequence <durable-integer> --reviewed
python collector/upload_queue.py --queue <private-event-queue> enqueue-event --event <private-event.json> --reviewed
python collector/upload_queue.py --queue <private-event-queue> flush-events --endpoint https://<private-beta-origin>/api/v1/events
```

Provide `UNIFY_MACHINE_TOKEN` through the process environment or a secret manager, never a command argument. The caller must allocate/persist sequences before constructing events; the examples do not guess the next sequence. Explicit IDs let a restarted runner reconstruct the same event. Do not reset the sequence when rotating a credential. On loss of the runner's sequence ledger, retain/reconcile old queued events and issue a new identity for future events rather than reusing old numbers.

The existing queue's atomic publication, OS lock, 1,000-entry/256 MiB limits, overflow retention and temporary-file recovery apply. See [queue durability limits](backend-resume-status.md). Flush first looks up a receipt, then sends exact bytes if missing. A lost acknowledgement can be reconciled on the next flush without another POST. Timeouts/retryable errors use up to three attempts, bounded jitter and 60 seconds on 429. Redirects are refused. Revocation, conflicting receipts or nonretryable rejection retain the queue. Files are deleted only after identity, event, sequence, body hash and committed version match. This retries transport, never physical execution. Windows tests do not establish Linux or power-loss recovery.

## Health, audit and activation

Owner/admin health shows last authenticated request, last committed event, accepted/duplicate/rejected storage counts, request limit and last storage error category. It is explicitly refreshed, with a refresh timestamp. No request may mean idle, offline, disconnected or another unknown condition; silence is not labeled device failure. Invalid envelopes and unauthenticated attempts are not included in these counters. Audit entries contain IDs, actions and times, not unrestricted capture bodies or secrets. Proxy/host body and authorization logging must remain disabled.

Apply the CLI-generated additive `20261024212230_b5_machine_events.sql` only after inspecting the target's migrations and preserving an application checkpoint. Existing applied migrations are unchanged. The new functions are service-only `SECURITY INVOKER`, tables have RLS, and credential hashes remain server-only. Set `BETA_MACHINES_ENABLED=true` only after synthetic verification. Rollback disables that flag and retains tables, immutable records and receipts; never roll back by dropping accepted history. Existing org export covers captures/audit through the incremental path; machine receipts/identity metadata require the database backup, not the local bundle export. Organization deletion cascades B5 data; recovery must reconcile credential revocation and deletions.

Current [Supabase function permissions guidance](https://supabase.com/docs/guides/database/functions) informed the service-only grants. The [October TLS notice](https://supabase.com/changelog/cbc-tls-ciphers-deprecated) concerns obsolete clients; supported Node/Python TLS is required. Actual verification and remaining operational gates are recorded in [build progress](build-progress.md).
