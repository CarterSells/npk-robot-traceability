# Backend resume checkpoint — October 24, 2026

November 2 completion audit: [B1–B13 accounting and fresh verification](backend-completion-audit-2026-11-02.md) distinguishes missing software from external acceptance. Onshape is not the only outstanding item: B12 backend readiness/registry/serving is incomplete, B10 has no physical adapter, and B13 operational acceptance remains open. Resume independent implementation from that checklist; deployment alone does not complete it.

November 1 continuation: B8 exists with simulated-provider acceptance; real Onshape is deferred until HTTPS deployment. B9 read-only gateway is mock-verified, with hardware acceptance open. B10 simulation-only requests and B11 reports/API/outbox are implemented and hosted-synthetic verified. B12 readiness/offline evaluation foundations are implemented; deployed registry/serving and validated models remain unavailable. B13 independent operating/release preparation is in [backend operations](backend-operations.md); deployment, full load, managed restore and real provider/receiver/hardware gates remain open. See the latest [progress entries](build-progress.md) before resuming; do not rebuild completed stages from the older inventory.

Scope: resume the backend sequence in [the prompt pack](backend-master-prompts.md), governed by [build.md](../build.md). On October 24 the founder authorized finishing B5 and continuing B6 and subsequent prompts in order. This checkpoint distinguishes implementation from acceptance and does not authorize customer hosting.

| Prompt | Current state | Remaining work |
| --- | --- | --- |
| B1 | Completed synthetic hosted persistence and isolation checks, October 18–21 | Production recovery and customer hosting remain separate gates |
| B2 | Incremental history implemented and activated; local benchmark and hosted/browser checks recorded | Full proposed load envelope and managed recovery remain unverified |
| B3 | Account lifecycle implemented; hosted email/password session checks passed | Configure Google provider and verify real Google success, cancellation and deliberate linking; email delivery activation remains separate |
| B4 | Roles, teams, clients and project grants implemented; database/API isolation verified; real client mobile browser checked October 24 | No customer validation; expanded portal/reporting belongs to later stages |
| B5 | Machine identities, durable events, receipt reconciliation and health UI implemented; local, hosted synthetic and browser checks passed | Linux/power-loss durability, full workload retention and production operations remain unverified; see [contract and limits](machine-ingestion.md) |
| B6 | Lifecycle, machine/human ingestion, v2 archive and timeline implemented and synthetic hosted/browser verified | Full workload, recovery and real hardware/customer evidence remain open; see [contract](execution-evidence.md) |

B4 browser verification exposed a stale project-list response resetting the project selection after summaries loaded. The client component now ignores superseded requests and invalidates requests on unmount. This changes presentation state, not database authorization.

## B5 queue increment

`collector/upload_queue.py` retains the existing approved-capture wire format and scoped collector tokens. It now publishes a fully written, file-synced temporary entry with an atomic rename; uses an OS-managed exclusive queue lock; verifies the canonical content hash before upload; and applies bounded retry jitter. Existing final entries remain compatible.

The default queue limits are 1,000 entries and 256 MiB of capture/pending-file content, whichever is reached first. They are protective defaults, not a verified 24-hour retention capacity. Overflow rejects the new enqueue and preserves existing records and the original capture. Only one enqueue/flush can hold the queue lock; another process fails promptly and can retry after the active operation ends. Do not delete the lock file to override an active process. Use a private local filesystem, not a shared/network queue.

Each default legacy flush uses at most three attempts per entry, with delays of 0.5–1 second then 1–2 seconds. Revoked credentials, conflicts and redirects stop without deleting unacknowledged entries. Legacy version/duplicate acknowledgements remain compatible; the separate machine-event queue now reconciles event receipts as documented in [machine ingestion](machine-ingestion.md). Retrying transport does not execute a robot job.

Handled write failures remove only their unpublished temporary file. A process killed during writing may leave `.pending-*` files; flush ignores them and capacity accounting includes them. Preserve the original capture, stop queue processes, inspect the abandoned file, and re-enqueue the original before deliberately removing the abandoned temporary file. No automatic eviction or private-data cleanup is performed.

Windows tests cover publish failure, overflow, hash mismatch, lock contention/release, retry bounds, acknowledgement-only removal, revocation and redirects. POSIX uses `flock` and directory fsync but has not been run on Linux in this task. Windows file fsync plus rename does not establish a power-loss durability guarantee; hardware/filesystem recovery testing remains outstanding. Private directory ACLs remain the operator's responsibility. No real customer captures were introduced.

## October 27 continuation

B7 investigations/client portal is implemented and synthetic staging verified, including authorized publication notifications, reconnect fallback, redaction, revocation, pagination and browser checks. See [client portal](client-portal.md) and [progress](build-progress.md). The existing B7 migration was already applied; do not replay it.

Next: B8 integration framework and Onshape, then B9-B13 in dependency order under the founder's renewed explicit request. Use the no-cost developer route; the founder has an Onshape account but no developer license/OAuth application yet. Provider live acceptance, Google setup, supervised hardware, production recovery and customer evidence remain distinct from implemented software.
