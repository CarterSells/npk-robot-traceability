# Prompt 6: authenticated private beta

October 18 account update: [account access](account-access.md) adds registration, email-link handling, recovery/change and a no-sign-in demo. Provider activation and verified email delivery remain required. This supersedes the administrator-only password UI described in the original implementation notes below; organization access still requires membership.

Implements the Stage 6 software boundary in [build.md](../build.md), sections 6–8. The separate `beta/` Next.js server uses Supabase Auth and Postgres. The root application still builds a public static synthetic demo; `/workspace/` and `/local/` there remain development-only. No Supabase project, customer account, public beta deployment, or customer data was created by this implementation. See [build progress](build-progress.md) for executed checks and outstanding gates.

## Environments and setup

For the founder-selected existing hosted project and its applied migration history, see [hosted Supabase activation](hosted-supabase.md). Do not replay the migrations over that installed schema.

For a database on this computer, use the implemented [local Supabase setup](local-supabase.md): `npm run db:setup`, then `npm run dev:local`. It reuses the repository migrations and provisions synthetic development accounts without a cloud project.

For the public/local/private route map, environment precedence, current activation blockers and the exact live acceptance procedure, see [B1 persistence trace and staging verification](backend-activation.md).

1. Use a dedicated **staging** Supabase project with synthetic records. Keep production separate: different project, keys, database and hostname. Never use real records in browser tests or commit them. No credentials use `NEXT_PUBLIC_`.
2. For a new empty staging target, apply all four repository migrations in order: `202610130001_private_beta.sql`, `20261016040114_stage7_investigations.sql`, `20261016223410_restrict_membership_helper.sql`, then `20261020030024_stage8_pilot.sql`. They expect Supabase's Auth schema and roles. Do not replay them on the already installed hosted target or apply over an unrelated schema. Record filenames/checksums and reconcile remote versions using the hosted guide. Future changes require new migrations, not edits to applied files.
3. Follow [account access](account-access.md) for the current registration, confirmation and password-recovery flow. Activate email signup only with appropriate confirmation, redirect, mail and rate-limit settings; keep email confirmation enabled. Registration does not create an organization or membership. Administrator-provisioned synthetic accounts are available for testing while provider activation remains incomplete. Never fabricate email verification for a real person. No organization-invitation email is automatically sent by Tavrik; billing is not implemented.
4. Bootstrap an organization, membership and workspace in one administrator transaction. Use the actual verified owner's UUID from Auth. For example, replace the placeholders below in a private administrator session:

```sql
begin;
insert into public.organizations(id,name) values ('<new-organization-uuid>','<organization-name>');
insert into public.memberships(org_id,user_id,role)
values ('<new-organization-uuid>','<verified-auth-user-uuid>','owner');
insert into public.workspaces(org_id) values ('<new-organization-uuid>');
commit;
```

5. Copy `beta/.env.example` to ignored `beta/.env.local`. Set `BETA_ENABLED=true`, `BETA_ORIGIN` to the exact origin (no trailing slash), and `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. The adapter supports the legacy anon/service-role pair; hosted activation also verified a legacy anon key with a modern secret key in `SUPABASE_SERVICE_ROLE_KEY`. All are read only on the server. With absent configuration or `BETA_ENABLED=false`, every API request returns 503 without contacting Supabase. Preserve existing configuration rather than overwriting it.
6. With Node 22.18+, run `npm ci`, then `npm run dev:beta` on loopback port 3002. The normal local workspace stays on its existing port. For production use `npm run build:beta` followed by `npm run start:beta` behind an HTTPS reverse proxy, or deploy the `beta/` server using a compatible Next.js server host. The start command binds loopback; configure the hosting adapter deliberately. Do not publish the development server. Set the exact HTTPS `BETA_ORIGIN`, force TLS, apply gateway request/time/rate limits, and verify no request/response body or authorization/cookie headers enter proxy logs or analytics.

The app sends passwords only to Supabase Auth over HTTPS (loopback HTTP is allowed for a local Supabase service). Successful sign-in stores only a short-lived access token in an HttpOnly, SameSite=Strict cookie, Secure on HTTPS, maximum one hour. There is no browser refresh token. At expiry sign in again; export an unsaved draft before refreshing or signing out. The server checks the user through Auth for each authenticated request and checks current membership, including again inside write transactions. Revoking membership immediately stops further reads/writes; already downloaded records cannot be recalled. Supabase JWTs may remain valid until expiry, so treat membership and credential revocation separately from sign-out.

## Team workflow

Original Prompt 8 adds an owner-only [four-week pilot dashboard](pilot-guide.md), opt-in metadata activity, weekly review revisions and separate summary export. Its additive migration is installed on the selected hosted synthetic target; other environments must apply it before using the dashboard. Pilot notes are private business records. Customer hosting and managed recovery gates below still apply.

Choose an organization after sign-in. Owners and members can create/import robot metadata, record tests, append corrections and compare exact revisions using the existing workspace. **Save to organization** persists the current draft; drafts are not autosaved. Reload fetches the current saved version. Switching, reloading and sign-out warn about drafts. **Export JSON** exports the draft, while **Export saved records** exports the database copy. An import in the beta app appends records; it never replaces saved history. Historical identities with different payloads are rejected. Missing data, original observation/recording times, manual evidence, custom fields and exact test references retain their local-contract meaning.

Viewers can read, compare and export but cannot persist changes. Owners manage invitations, roles and collector credentials. Invitations are bound to a verified account email, expire after seven days, are single-use and can be revoked. Create a token, copy it once and deliver it through an authorized private channel; the recipient signs into their provisioned account and uses **Accept an invitation**. Only a SHA-256 hash is stored. The final owner cannot be removed/demoted; promote another member first. Collector credentials expire after 90 days and are bound to one organization and one existing robot. Revocation, expiry or loss of their creator's write membership stops uploads. Token lists omit hashes and raw tokens.

Existing imported author names remain reported provenance. Each immutable record's `submitted_version` references the exact `audit_events.workspace_version` for its organization, identifying the authenticated submitting user or scoped collector ID and database recording time. This does not authenticate the historical author or prove physical hardware was inspected. Audit rows contain action names, IDs and timestamps, not configuration payloads or tokens. Organization members can read them through RLS. Original Prompt 7 adds an [investigation editor and immutable revision history](investigations.md), requiring its separate additive migration after Stage 6. Hosted synthetic persistence has been verified on the selected target; managed recovery and customer workflow validation remain outstanding.

## Persistence and authorization

`workspaces` is a bounded current bundle with a monotonically increasing save version. `robots`, `snapshots`, `runs`, `corrections` and `mappings` also retain immutable relational payloads and organization-qualified foreign keys. `components` and `evidence_references` are security-invoker views of the exact snapshot payload, including custom fields; no evidence URL is fetched. App validation reuses `lib/local/records.ts` and custom mappings. Each workspace remains limited to 2 MiB and 1,000 entries per record collection; this beta is not an unbounded history service.

All exposed tables have RLS. Members receive SELECT only; sensitive invitation/collector/receipt tables have no authenticated SELECT grant. Anonymous users receive no record access. Application writes use the server's privileged credential solely through `beta_command`, which is executable only by `service_role`; it checks the verified actor's current role, organization and collector scope, locks the organization, checks optimistic version and preserves existing records. Immutable tables reject UPDATE; regular clients have no DELETE grant. Privileged database administrators remain trusted and can change data. The service key is therefore a powerful secret, not a substitute for RLS or API checks. Never expose it, use it in client requests, or call the privileged command with an unverified user ID. The complete domain schema is validated in the trusted TypeScript API; SQL separately enforces relationships, retained payloads, roles, scope and atomicity. Bypassing the API with an administrator key bypasses domain validation.

Saves accept a unique request ID plus a server-derived payload hash. Identical retries return the original version; reuse for another payload fails. Stale versions produce 409 without overwriting data. Export the draft, reload, then append the export to merge disjoint additions. Conflicting identities need an explicit correction or a genuinely new ID. Browser retries keep the same ID while the draft is unchanged. Ingestion retries use the queued capture hash as ID and re-read the current workspace. Receipt and audit tables grow per accepted save; monitor and define retention before a larger deployment. No production scale or performance claim is established.

## Collector upload queue

The existing collector still captures locally and never uploads on `capture` or `attach-run`. Uploading is a separate explicit command using the new `collector/upload_queue.py`. Only inspected, allowlisted metadata captures belong in the queue. Free text can still contain secrets; validation is not a universal secret detector.

Store queues and original captures **outside the repository** in a private user directory. Queue creation requests restrictive POSIX permissions; on Windows, configure/check the directory ACL for the intended user, because `chmod` does not implement a private Windows ACL. No private local storage was populated during implementation.

```text
python collector/upload_queue.py --queue /private/unify-queue enqueue --capture /private/capture.json --reviewed
python collector/upload_queue.py --queue /private/unify-queue flush --endpoint https://<beta-host>/api/ingest/<organization-uuid>
```

On Windows use an external absolute path such as `C:\Users\<user>\AppData\Local\Tavrik\queue`. Set `UNIFY_COLLECTOR_TOKEN` in the process environment using your secret manager; do not paste it into a command argument, source file or log. The endpoint must be HTTPS without URL credentials, query or fragment. Redirects are refused. Each request has a 15-second timeout, at most three attempts, and bounded jittered backoff (0.5–1 then 1–2 seconds) for network errors, 408, 429 and server errors. Other errors retain the queue and stop, including revocation and conflicts. Retry a 409 on a later flush after checking the workspace. Enqueue deduplicates captures, caps the queue at 1,000 entries or 256 MiB including abandoned pending writes, and does not contact a server. Complete entries are file-synced and atomically renamed under an exclusive OS queue lock; flush verifies their content hashes. Overflow retains existing entries. See [the B5 queue checkpoint](backend-resume-status.md) for concurrency, interrupted-write recovery and platform durability limits. A queue copy is removed only after an acknowledged version/duplicate response; the original capture remains. There is no background daemon, directory watcher, raw-artifact upload or robot action.

## Export, deletion, backup and recovery

Organization exports are the existing portable JSON contract (including corrections and custom mappings). They do not contain memberships, audit history, invitation/collector credentials or Supabase Auth users, and are **not** a complete disaster-recovery backup. Owners can delete an organization only after typing its ID and confirming; records, memberships, invitations, credentials, receipts and audit rows cascade within that organization. Auth accounts remain because they may belong to another organization. Account deletion and provider-backup expiry require an administrator workflow and an agreed retention policy. No retention duration is claimed until configured with the hosting provider.

Before enabling customer records:

1. Configure provider backups/PITR as appropriate for the chosen plan; record the actual schedule, retention, recovery objectives and responsible operator. Use the [Supabase backup guide](https://supabase.com/docs/guides/platform/backups) for the deployed plan. Keep external logical dumps encrypted and access-controlled outside the repository. Capture Auth data and application tables consistently; an app-bundle export alone is insufficient.
2. In staging, create two synthetic organizations, owners/viewers, issued and revoked credentials, a corrected snapshot and tests still referencing its prior revision. Save expected row counts and exported record hashes privately.
3. Produce a provider backup or a supported Postgres dump. Restore into a separate isolated staging project/database, never over the only copy. Restore required Auth identities and schema/roles using the provider's documented procedure. Verify migration version, functions, grants, RLS and foreign keys as well as payloads.
4. Re-run sign-in → import/capture → upload → compare → export → sign-out; verify both organizations' allow/deny paths, viewer restrictions, credential revocation and exact revision preservation. Measure restore duration and data loss against the agreed objectives. Record actual results and operator/date.
5. Treat restored credentials/invitations as potentially resurrected: revoke all restored outstanding invitation/collector tokens, reissue approved credentials, rotate server secrets and invalidate provider sessions before exposing the restored service. Do not reconnect collectors until authorization and isolation checks pass. Reconcile deletions after the backup point from the organization's separately controlled deletion ledger.

The automated PGlite test exercises a PostgreSQL data-directory backup/restore, including RLS, with synthetic records. It does not validate Supabase Auth recovery, managed backups, DNS/TLS, provider logging, or deployed performance. A successful local test does not pass the operational restoration gate. Rollback: disable `BETA_ENABLED`, stop ingestion, preserve a backup and roll back the application release; do not drop the schema or rewrite historical records to roll back application code. Restore a database only through the isolated drill above.

## Verification and release gates

```text
npm test
npm run test:beta
python collector/test_collector.py
python collector/test_upload_queue.py
npm run build:beta
npm run build
npx playwright test --config playwright.beta.config.ts
npm run test:local
npm run test:browser
```

PGlite runs the actual migration with minimal simulated Supabase Auth tables/roles. API tests stub upstream HTTP; beta browser tests mock service responses except the real fail-closed check. None is a live Supabase integration test. Run the deployed synthetic matrix described above before authorizing customer hosting. Keep the public synthetic demo on a different origin and never seed a customer workspace with demo records. No payments, subscription activation, automatic customer onboarding, customer validation, or production readiness are delivered by this stage.

Implementation references: [Supabase Auth](https://supabase.com/docs/guides/auth), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Auth REST API](https://supabase.github.io/auth/), [sessions](https://supabase.com/docs/guides/auth/sessions), [PGlite API](https://pglite.dev/docs/api), plus the installed Next.js route/authentication guides. Provider configuration and current plan terms must be checked when choosing/authorizing the actual deployment.
