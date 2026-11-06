# Onshape connector v1

Governed by [build.md](../build.md), with evidence in [progress](build-progress.md). The connector is implemented; actual Onshape acceptance requires the account setup below. Synthetic provider responses do not establish provider compatibility.

## No-purchase setup

The founder has an Onshape account only. Onshape's [integration FAQ](https://www.onshape.com/en/app-integrations/faq) offers developer licenses on request at no cost. Request developer access through Onshape's developer onboarding before purchasing anything. This is not a promise of unrestricted free commercial CAD or unlimited API use. No request has been sent on the founder's behalf.

Register a cloud OAuth application in [My account / Developer](https://cad.onshape.com/help/Content/Plans/my_account_developer.htm). Supply an authorized HTTPS beta origin and register exactly `https://YOUR-BETA-ORIGIN/api/onshape-callback`. The current loopback development URL is not a cloud OAuth callback. Use an approved HTTPS development deployment; selecting or purchasing hosting is separate.

Set server-only `ONSHAPE_CLIENT_ID`, `ONSHAPE_CLIENT_SECRET`, `CONNECTOR_KEYS` (JSON mapping a key ID to a random 32-byte lowercase hex key), `CONNECTOR_ACTIVE_KEY`, and `BETA_ORIGIN`. Keep values in the deployment secret manager or ignored local environment, never the browser/repository/chat. Enable `BETA_CONNECTORS_ENABLED` only after installing the migration and checking permissions. The UI remains explicit about missing configuration.

Owner/admin creates a connection bound to one existing project, assigned robot and document. Authorize `OAuth2Read`; enable `OAuth2Write` only for separately approved create-version requests. We do not request delete, purchase or sharing scopes. Authenticate through [Onshape OAuth](https://onshape-public.github.io/docs/auth/oauth/); Google login does not grant CAD access.

## Versioned contract and supported actions

| Contract v1 operation | Behavior |
| --- | --- |
| Authenticate | One-use, ten-minute state bound to an encrypted HttpOnly browser cookie, actor and approved application session |
| Discover | Explicit authorized document; version pages of 25; no public-document crawling |
| Read/normalize | Pin workspace/version to microversion before reading its element; preview an exact reference |
| Import | Explicit approval copies a saved robot snapshot into a new immutable snapshot; runs and manual hardware confirmations remain unchanged |
| Subscribe/poll | Optional signed company webhooks are deduplicated hints; explicit version discovery reconciles missed notifications; workers poll queued exports |
| Reconcile | Verify a provider result against the original uncertain request; never resubmit an uncertain write automatically |
| Disconnect | Erase stored tokens, invalidate OAuth/lease revisions and reject undispatched jobs; also revoke the grant in Onshape if desired |
| Write | Create a version pinned to the explicitly approved workspace microversion |
| Async operation | STEP export from an exact Part Studio version; retain result IDs, never download/upload CAD bytes |

Implemented API paths use Onshape v10 document metadata/version endpoints and v11 Part Studio STEP export/translation status endpoints. Live account/product acceptance has not passed. Robot execution, simulation, geometry interpretation and installation verification are unsupported. Generic approved JSON/CSV metadata remains available through the [local record workflow](local-records.md) and [collector](collector.md) for other tools.

## Worker and recovery

Run `node --experimental-strip-types scripts/connector-worker.mjs --once` for one bounded step, or omit `--once` for a supervised process. Requires Node >=22.18, outbound HTTPS to the configured Supabase project, cad.onshape.com and oauth.onshape.com, server secrets and a process supervisor. A queue row does not execute itself. No hosted worker service has been selected or deployed.

The database grants connector tables/RPC only to service_role; API/worker commands recheck current organization permission. A two-minute connection lease serializes refresh. AES-256-GCM binds ciphertext to organization/connection. Add a new key to the keyring, change active key, and retain old keys until every stored connection has been rewrapped during access. Back up key material separately from encrypted database records; losing it requires reconnecting accounts.

GET calls have at most three attempts; writes are sent once. Crashed dispatch becomes unknown, never queued again. Pre-dispatch retries are bounded; active operations stop after 24 hours and require reconciliation. Queued approvals expire after one hour. Disconnect cannot undo a request already accepted by Onshape. For unknown create-version results, inspect Onshape for description `UNIFY operation REQUEST-ID`, then use the reconcile form. Translation reconciliation verifies the approved document/version/element; do not infer a result from a similar name.

Default guards: 20 connections per organization, 1,000 pending operations, one request/second per connection and a shared 2,000-attempt calendar-year budget. This conservative local budget is not the provider's quota or billing cycle. Inspect actual allocation before operation. [Official limits](https://onshape-public.github.io/docs/auth/limits/) currently distinguish private OAuth app-owner quotas from public App Store apps; no automatic upgrade or paid quota purchase is implemented.

Optional company webhook settings must supply configured signing keys in `ONSHAPE_WEBHOOK_KEYS` and target `/api/onshape-webhook?org=ORG-ID&connection=CONNECTION-ID`. Verify the raw-body timestamped HMAC using [documented signing settings](https://cad.onshape.com/help/Content/Plans/enterprise_settings_webhooks.htm). Reject stale/invalid signatures, deduplicate message IDs and reconcile through authorized API reads. Without signed company settings use explicit polling; do not upgrade merely for webhooks. Notifications do not automatically import unreviewed changes.

## Acceptance still required

With a synthetic authorized document: actual OAuth success/cancellation/replay, refresh/revocation, exact version import, denied write, approved create-version, STEP completion, lost-response reconciliation and missed-notification recovery. Verify real response shapes and account entitlements before enabling customer use. No raw CAD, customer records, production hosting or customer validation is established by local tests.
