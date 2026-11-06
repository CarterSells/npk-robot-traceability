# Controlled requests (B10)

Implements the simulation-only independent portion of [B10](backend-master-prompts.md), preserving [build.md sections 6, 7 and 10](../build.md). Current verification and activation belong in [build progress](build-progress.md). No robot motion adapter is implemented. The only new action is `simulation.check`: a bounded in-process software exercise of the command handshake, not a robot simulator, kinematic test, successful robot run or training evidence. Unsupported actions, scripts, arbitrary parameters and real-execution labels are rejected. Predictions never authorize commands.

## Authorization and evidence

Human owner/admin/engineer/operator roles can request; only owner/admin can approve, change command grants or manually reconcile an unknown simulation outcome. Legacy member means engineer. Internal viewers can read internal command metadata only. Client viewers have no command access. Approval is required for every request, including requests by administrators; self-approval is permitted for this simulation-only implementation. Human approval, grant changes and manual reconciliation require recent authentication when account lifecycle is enabled.

B5 ingestion credentials gain no command rights automatically. An owner/admin explicitly grants `dispatch_enabled` to an existing robot/project-scoped gateway or `request_enabled` to an API-client identity. Collectors cannot receive either permission. A service requester can target only a gateway in its own project and robot scope. Existing token rotation, expiry, revocation and per-identity rate limits apply; the request's original service credential must still be valid at dispatch/start. Rotating away that credential invalidates undispatched requests made with it. No service key is given to a gateway.

The server derives organization/project/robot scope from authenticated actors and the selected gateway. Immutable requests retain request UUID (also the durable execution ID), correlation UUID, requester, target, exact snapshot ID/revision, allowlisted parameters, expiry and `reality: simulation`. The database verifies all foreign relationships. Request UUID replay must match the original actor and exact specification. Reports use durable event UUIDs with payload equality checks. Append-only events preserve actor, observation time where supplied and distinct database receipt time. No snapshot or historical run is rewritten. Simulated command outcomes are separate from B6 run outcomes and are not automatically published or counted as real evidence.

Current requester, approver, machine creator, grant issuer, credential and project/robot access are rechecked at dispatch and immediately before the simulated start. All new tables use RLS with no direct anonymous/authenticated grants. Only the server invokes the restricted `SECURITY INVOKER` functions. This follows [Supabase function-security guidance](https://supabase.com/docs/guides/database/functions#security-definer-vs-invoker).

## States and cancellation

| State | Meaning |
| --- | --- |
| requested | Durable request awaiting explicit approval |
| approved | Approved, still subject to current authorization and expiry |
| dispatched | Delivered to the assigned gateway; no completion implied |
| acknowledged | Accepted locally; not yet executed |
| executing | Durable local execution latch committed; start authorized |
| completed | Explicit simulated outcome: succeeded, failed or cancelled |
| rejected | Denied before execution, or manually verified not started |
| expired | Deadline elapsed before dispatch |
| unknown | Dispatch/start may have happened; completion is unverified |

Expiry is at most one hour after request creation and applies to approval/start. After possible dispatch, deadline expiry becomes unknown, never stopped. Listing returns both stored and effective state; detail/dispatch calls append the deadline transition. There is no background expiry scheduler or live-status SLA.

`cancel` before dispatch rejects the pending request. After dispatch it records `cancel_requested_at` without claiming a stop. The built-in simulation checks that flag between its bounded steps and reports `completed`/`cancelled` with `stop_confirmed: true` only after it stops its own loop. This has no physical safety meaning. A disconnected gateway cannot confirm cancellation. Local controller safety, operator mode and authority would remain authoritative for any future physical adapter; there is no cloud emergency-stop guarantee.

## API operations

Human sessions use `GET/POST /api/org/{org}/commands` with the existing HttpOnly session and same-origin protection. GET lists 25 requests in UUID order (`after` cursor); `?id=UUID` returns the immutable request, status and complete bounded event history. API-client/gateway credentials use `POST /api/v1/commands` with `Authorization: Bearer um_...`; they cannot use human approval/grant/resolve operations.

Bodies reject extra or missing fields. Examples below contain placeholders, not runnable credentials:

```json
{"action":"grant","machine_id":"GATEWAY_UUID","request_enabled":false,"dispatch_enabled":true}
```

```json
{
  "action":"request","id":"PERSISTED_COMMAND_UUID","correlation_id":"CORRELATION_UUID",
  "gateway_id":"GATEWAY_UUID","snapshot_id":"SAVED_SNAPSHOT_ID","snapshot_revision":1,
  "expires_at":"FUTURE_UTC_TIMESTAMP_WITH_MILLISECONDS",
  "kind":"simulation.check","parameters":{"checks":2},"reality":"simulation"
}
```

Other operations: `{"action":"approve","id":"UUID"}`, `{"action":"cancel","id":"UUID"}`, `{"action":"get","id":"UUID"}`, and `{"action":"list","after":null}`. Machines additionally use `dispatch` and `report`; the Python runner constructs validated report events. Reports carry event UUID, state, explicit nullable outcome, reason (240 characters), observed UTC time and stop confirmation. Transport retries reuse the same event and bytes; a request must never be assigned a new ID merely because its acknowledgement was lost.

For an unknown command, inspect the local journal and simulator evidence before an administrator submits `{"action":"resolve","id":"UUID","outcome":"not-started","evidence":"Verified local evidence reference and explanation"}`. Allowed outcomes are `not-started`, `succeeded`, `failed`, `cancelled`. This appends visibly manual simulation reconciliation and never redispatches. Use only approved metadata/references, never secrets or raw logs. After reconciliation stop replaying old contradictory journal reports; retain them as evidence. A genuinely new execution requires a separately reviewed new request.

The API is the B10 control surface; no command-management UI is added. Command detail JSON provides bounded audit retrieval. The existing v2 history archive does not yet include command tables; preserve them in database backups and retrieve command details separately. This is not a recovery-gate waiver.

## Simulation runner

Run `python collector/command_runner.py --help`. The base Python environment needs no ROS or robot SDK. The runner has no dynamic adapter loading, service client, shell command or motion publisher. Its CLI permits HTTPS only, refuses redirects and never prints tokens or unrestricted provider errors. One invocation handles one named request; a queue row does not execute itself.

Before use, configure a private directory outside the repository with owner-only ACLs (0700 on Linux). Set `UNIFY_MACHINE_TOKEN` through the private environment. Keep the journal, its SQLite sidecar files and operator context private. Windows mode bits do not replace ACL configuration. Supply an operator-owned JSON context containing exactly:

```json
{
  "gateway_id":"GATEWAY_UUID","robot_id":"ROBOT_ID",
  "snapshot_id":"SAVED_SNAPSHOT_ID","snapshot_revision":1,
  "reality":"simulation","execution_authority":true,"interlocks_ok":true,
  "operator_mode":"simulation","observed_at":"CURRENT_UTC_TIMESTAMP"
}
```

These booleans model local simulation checks; they are not live hardware observations or certified interlocks. The context is reloaded before acceptance/start and between steps; it must be no more than 30 seconds old, not future-dated, and match the exact requested configuration. An invalid or stale context denies execution.

```sh
python collector/command_runner.py --journal /private/tavrik/commands --endpoint https://YOUR-BETA-HOST/api/v1/commands --command-id COMMAND_UUID --gateway-id GATEWAY_UUID --context /private/tavrik/simulation-context.json --reviewed-simulation
```

The runner serializes access with an OS lock and commits SQLite with `synchronous=FULL`. It commits a start latch before asking for start authorization and before simulated work. Restart after that latch reports unknown and never relaunches. Lost acceptance acknowledgement may be reconciled before the first start; lost completion acknowledgement retries the stored completion report. A missing journal for an already dispatched request also fails closed. Preserve the endpoint/identity binding and exact request bytes. Disk/permission errors stop the step. Windows tests do not establish Linux/power-loss durability.

Limits: 1,000 journal records, 1,000 unresolved server requests per organization, a 90-event threshold for new gateway reports (including internal events in the count), 1–10 simulated steps and 25-row API pages. No silent deletion/eviction is implemented. On capacity exhaustion, stop new requests, reconcile outstanding commands, back up and inspect the journal, and retain the old journal. A replacement journal must never be used to retry an old dispatched ID. Set retention/archival policy only after recovery testing.

## Existing connector writes and activation

B8's separate `integration_jobs` workflow already supports explicitly approved Onshape create-version and STEP-export jobs. It records human actor, operation ID, exact microversion parameters, one-hour expiry, worker dispatch, current integration authorization, provider result and unknown outcomes. Its worker rechecks the current CAD version before writing and reconciles uncertain operations without automatic write replay. CAD operations do not execute robots. See [Onshape integration](onshape-integration.md). Live provider acceptance remains deferred; B10 does not bypass it or invent a generic connector action.

Apply the additive CLI-generated B10 migration only to an inspected target, then verify synthetic requests before setting `BETA_COMMANDS_ENABLED=true`. Disable that flag to stop new API traffic; preserve request/event/journal history and reconcile uncertain work. Do not roll back by deleting the tables or clearing journals. A disabled cloud API cannot stop a physical controller.

Remaining external acceptance: real ROS/controller/driver inventory, approved robot simulator tests, supervised physical integration, Linux crash/power-loss recovery, full workload retention, deployed HTTPS gateway transport, managed backup/restore and customer validation. Physical execution must remain unavailable until a separately implemented, reviewed and supervised adapter passes those gates.
