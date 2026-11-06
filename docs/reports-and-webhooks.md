# Approved JSON reports and delivery (B11)

Implements [B11](backend-master-prompts.md) under [build.md sections 6, 7 and 10](../build.md). Verification belongs in [build progress](build-progress.md). Reports describe selected recorded evidence, not automatic causal diagnoses. Client project grants remain the authorization boundary. A published report does not prove a webhook was received, a robot succeeded or a prediction is available.

## Review and publish

An owner/admin/engineer (including legacy member) can preview and explicitly publish up to 25 execution attempts from one client project. Select measurement names deliberately (up to ten); duration is included separately. The report period filters attempt record time, not an inferred physical execution period. Generic procedures require no fabricated pick counts. Missing measurements remain `unknown`/null with unknown units where absent. Quality measurements are included only when selected and actually recorded. Raw observation reasons, internal labels, evidence URLs, calibration/configuration contents and private notes are omitted. Exact job, attempt, robot and snapshot references remain.

Engineer conclusions are separate, explicitly approved text. Model assessments remain unavailable. Do not place secrets or raw customer artifacts in a conclusion or correction reason. No permanent public artifact links are generated; access to an external artifact requires its own authorization outside this report.

Use the human session API `POST /api/org/{org}/reports`:

```json
{
 "action":"preview",
 "selection":{
  "report_id":"PERSISTED_REPORT_UUID","project_id":"CLIENT_PROJECT_UUID","expected_revision":0,
  "period":{"start":"2026-11-01T00:00:00.000Z","end":"2026-11-02T00:00:00.000Z"},
  "attempt_ids":["EXACT_ATTEMPT_UUID"],"metrics":["duration","quality_score"],
  "conclusion":null,"correction_reason":null
 }
}
```

Review the returned `content`, `selection` and `cutoffs`. Publish using `{"action":"publish","selection":{...},"reviewed_cutoffs":{...},"approved":true}` with those exact reviewed values. The API rebuilds the projection and the database rechecks every evidence cutoff in the publication transaction. Changed evidence requires review again. Repeating identical publication inputs returns the existing revision without another outbox entry.

For a correction, keep report/project IDs, set `expected_revision` to the latest revision and give a nonempty `correction_reason`. The next immutable revision references its predecessor; the database retains the human publisher, reviewed selection and evidence cutoffs. Earlier published assessments stay historical. A report is a selected set, not proof of complete capture coverage.

The v1 [JSON Schema](api/report-v1.schema.json) and runtime validator define the format. Application validation additionally enforces prior-revision arithmetic, ordered reporting periods, measurement-count consistency and finite numbers. Schema version, report/revision IDs, client/project scope, generation time, exact references, measured outcomes, unit-qualified values, evidence completeness and separate conclusions are preserved.

## Portal and service access

The client portal's Published reports section and `GET /api/client-reports/{org}/{project}` expose the same immutable approved payloads with current session/project authorization. Downloads reauthorize the exact revision. Pages contain 25 revisions; online visible views refresh every 30 seconds and clear after offline/revoked access. This is a bounded polling interval, not a capacity SLA. Publication/endpoint administration is currently API-based; there is no new admin form.

An owner/admin with recent authentication can create a client service credential:

```json
{"action":"credential","project_id":"PROJECT_UUID","recipient":"CLIENT_USER_UUID","days":30}
```

The recipient must already have an explicit client grant to that project. The API returns a `tr_...` secret once; only its SHA-256 hash is stored. Expiry is 1–90 days. Retrieve `GET /api/v1/reports` with a bearer token, optional `after` cursor, or `report_id` plus exact `revision`; see [OpenAPI](api/openapi-v1.json). The server derives the project from the credential. Maximum 60 requests/minute, 100 issued credentials per organization. Current issuer permission and recipient grant are checked for every page. Revoke using `{"action":"revoke_credential","id":"UUID"}`. Rotation means issuing a replacement, updating the receiver and revoking the old credential; no service key is exposed.

## Webhook destinations and secrets

Before configuration, an operator must put exact approved receiver hostnames in `REPORT_WEBHOOK_HOSTS`. Empty means no destinations. URLs require HTTPS, default port 443, no userinfo/query/fragment and a DNS hostname rather than a literal IP. Every resolved address must be public IPv4; IPv6-only or mixed IPv4/IPv6 destinations are intentionally unsupported initially. Private, loopback, link-local, carrier-grade NAT, documentation, benchmark and reserved ranges are rejected. DNS is revalidated before each send and the chosen address is pinned in the connection's DNS callback while normal hostname certificate verification remains enabled. Redirects are never followed. DNS has a three-second deadline; HTTP has a five-second total deadline, bounded headers and a 16 KiB response limit. Node's [HTTPS request](https://nodejs.org/docs/latest-v24.x/api/https.html#httpsrequesturl-options-callback) and [DNS lookup](https://nodejs.org/docs/latest-v24.x/api/dns.html#dnspromiseslookuphostname-options) interfaces provide the transport primitives. Deployment still needs matching egress/firewall restrictions and a trusted resolver; application checks do not replace network policy.

Create `{"action":"endpoint","project_id":"PROJECT_UUID","recipient":"CLIENT_USER_UUID","url":"https://APPROVED-HOST/reports"}`. The endpoint is bound to that recipient's current project grant. The response reveals a random signing secret once. The server stores it encrypted with the existing AES-GCM key ring (`CONNECTOR_KEYS`, `CONNECTOR_ACTIVE_KEY`), bound to organization and endpoint. Keep encryption keys in the deployment secret manager and include them in separately secured recovery procedures. Endpoint lists omit encrypted/plaintext secrets.

Rotate using `{"action":"rotate","id":"ENDPOINT_UUID","overlap_minutes":30}`. New and previous signatures are sent during a 0–60 minute overlap; the receiver can accept either known key. Repeated rotation during an overlap is refused. Revoke with `{"action":"revoke_endpoint","id":"ENDPOINT_UUID"}`. Keep secrets out of URLs, logs and source control. Ten endpoints per organization is a staging bound.

## Transactional outbox and worker

Publication and one delivery per currently authorized endpoint commit in the same database transaction. New endpoints do not automatically receive old reports. Events are `report.published` or `report.corrected`, with a stable event UUID per report revision and an envelope `{schema_version,event_id,event_type,report}`. No delivery worker starts merely because a row was queued.

Run the Node 24 worker explicitly:

```sh
node --experimental-strip-types scripts/report-worker.mjs --once
```

Without `--once`, it polls every five seconds. Hosted workers receive database credentials, encryption keys and the destination allowlist through the secret manager. A long-running process with outbound HTTPS/DNS, bounded concurrency and monitoring is required; hosting/provider selection remains an operational decision. The web request does not execute the long-running delivery loop.

Each worker claim has a one-minute lease. Expired leases may be reclaimed; report delivery is at-least-once, not exactly-once. The same event ID/body is retained across retries and controlled replay. Receiver authorization, endpoint status and issuer permission are rechecked immediately before dispatch. Failed requests, timeouts, redirects and non-2xx responses retry exponentially (10 seconds initially, capped at one hour), with a dead-letter state after eight claims. A crash can consume a claim without a confirmed send. Workers log generic step status only; delivery tables retain status codes, counts, timestamps and manual replay actor, without report bodies or secrets in operational logs.

`GET /api/org/{org}/reports` returns bounded credential/endpoint/delivery metadata to administrators. A dead delivery can be explicitly replayed with `{"action":"replay","id":"DELIVERY_UUID"}` after diagnosing the failure; current authorization is checked again and the event ID stays unchanged. Revoked deliveries cannot be replayed through this operation. Status describes the last confirmed attempt; network ambiguity may mean the receiver already accepted an event.

Headers: `X-Tavrik-Event-Id`, `X-Tavrik-Timestamp` (Unix seconds), and `X-Tavrik-Signature` (comma-separated lowercase HMAC-SHA256 signatures). Sign the UTF-8 bytes of `v1.TIMESTAMP.EVENT_ID.` followed by the exact request body. Reject timestamps more than five minutes away, verify signatures using constant-time comparison, verify envelope/header event IDs match and durably deduplicate event IDs before acknowledging. The example receiver also rejects the same event ID with a different body hash.

## Example receiver and operating limits

`scripts/report-receiver.py` is a loopback-only local example with a durable SQLite inbox. Preconfigure a private directory outside the repository with restrictive ACLs. Set `TAVRIK_REPORT_SIGNING_SECRETS` to a private JSON array of one or two 64-character hexadecimal keys, then run `python scripts/report-receiver.py --directory /private/tavrik/report-inbox`. It accepts `/reports` on port 8099 and stores approved report bodies before returning 200. Downstream processing must also deduplicate. This sample has no production HTTPS ingress, identity administration, retention or monitoring; it is not a public receiver deployment. The production sender intentionally refuses loopback destinations. Tests inject an authorized local receiver transport without weakening production URL rules.

The current v2 history archive does not include report/outbox tables. Retrieve published revisions through the report API and preserve the relational publication/delivery/credential/encrypted-secret state in managed backups. No silent retention deletion is introduced. Test restore with signing keys and deleted-recipient reconciliation before customer hosting. Disable `BETA_REPORTS_ENABLED` and stop workers to pause publication/delivery while preserving history; an already-sent request cannot be recalled.

Activation requires the additive B11 migration and verified synthetic checks. Real receiver ownership, actual internet HTTPS delivery, deployed network policy, worker scheduling, load/cost envelope, managed recovery and customer acceptance remain distinct gates. No customer endpoint, outreach or billing is authorized by these examples.
