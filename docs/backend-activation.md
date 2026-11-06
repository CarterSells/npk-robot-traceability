# B1: persistence trace and staging verification

Current environment update, 2026-10-18: the selected hosted project is configured and synthetic live persistence/isolation checks passed. See [hosted activation](hosted-supabase.md) for exact results, migration mapping and remaining recovery gates, and the [operating guide](operations-guide.md) for usage. The October 15 inspection/blocker below is historical, not the current connection status.

Scope: activate the existing private beta described in [the business brief](../build.md), sections 6–8 and 10. Later backend stages are separate work. This document is a procedure, not evidence that live staging works.

## Where records go

| Entry | Source and persistence |
| --- | --- |
| Public `/demo/` | `app/demo/workspace.tsx` imports `lib/demo/fixtures.ts`. Bundled synthetic records only; no organization database read. |
| Root development `/workspace/` and `/local/` | `app/local/workspace.tsx` holds drafts in React state. Export JSON downloads a file to the browser's chosen download location. No automatic repository or database write. |
| `http://127.0.0.1:3002/` | Separate `beta/` server, started from the repository with `npm run dev:beta`. Sign in, select an organization, import/create, then explicitly Save to organization. |

The local workspace has a Private beta link. Start the separate server before using it. Export a local draft before navigating away, import the approved JSON into the beta, then save. There is no automatic synchronization with the showcase or between browser tabs.

In the beta, `beta/app/page.tsx` loads `/api/org/<id>/workspace` and sends `/api/org/<id>/save`. The catch-all route delegates to `lib/beta/server.ts`. It verifies the user through Supabase Auth, reads current membership under the user's token, validates the bundle and calls `/rest/v1/rpc/beta_command` using the server credential. SQL rechecks membership and relationships, locks the workspace, checks version/idempotency, and atomically writes the bundle plus immutable `robots`, `snapshots`, `runs`, `corrections`, `mappings` and audit/receipt records. Each snapshot/run payload keeps its exact revision references. `submitted_version` links to the authenticated submitter's audit event. These records reside in the configured Supabase PostgreSQL project, not in the local project folder.

The UI reloads the workspace after a save before replacing the draft. Errors retain the draft and retry identity. The saved version and last successful organization save use database `version`/`updated_at`; the timestamp is not a connectivity monitor or a claim that the draft was saved. Explicit export remains available. Whole-workspace bounds remain 2 MiB and 1,000 entries per collection pending B2.

## Environment source and safe setup

The Next command selects `beta/` as its application directory. Environment precedence is process variables, `beta/.env.development.local`, `beta/.env.local`, `beta/.env.development`, then `beta/.env` for development; production substitutes `production`. The root `.env.local` is not the beta's env file. Do not print secret values while inspecting precedence.

On October 15 inspection, all five required process variables were absent, all four development beta env files were absent, and root `.env.local` contained only `CONTACT_URL` and `SITE_URL` names. No target Supabase project could be identified. This does not rule out another deployment. `.gitignore` excludes beta env files except `.env.example`; no `.git` directory was present, so tracked-state inspection was unavailable. No private local storage was created.

Before live work, supply an explicitly designated synthetic staging project name/reference, administrator access through the authorized setup, and its server-only configuration. Follow [private-beta setup](private-beta.md). Required variables: `BETA_ENABLED=true`, exact `BETA_ORIGIN`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Keep keys in ignored `beta/.env.local` or a secret manager, never in chat/public assets. Hosted activation subsequently verified a legacy anon key paired with a modern server secret in SUPABASE_SERVICE_ROLE_KEY; see hosted-supabase.md. Local Docker setup has separate key validation.

Compare the configured URL's project reference with the staging dashboard before any provisioning. Inspect migration history plus existing tables, functions, constraints, grants and RLS. Compare against `supabase/migrations/202610130001_private_beta.sql`; record its SHA-256 and the applied state privately. A SQL-editor application may not have a migration-history row. An existing table alone does not prove the migration is complete. Never replay the migration over an unknown or partially matching schema. Resolve discrepancies before writing.

Provision synthetic verified accounts and organizations using the administrator-assisted process in the private-beta guide. Use two organizations with different owners and a viewer in the first. Do not fabricate verification for real people or send invitation mail. Detailed project/configuration diagnostics belong in administrator tooling and this runbook, not the anonymous UI. `/api/status` only reports configuration and `connectivity: not_checked`; HTTP 200 there proves neither Auth reachability nor an applied migration.

## Live acceptance procedure (original October 15 record follows)

Record operator/date, staging project reference, deployed commit or file manifest, migration checksum/state, synthetic IDs, expected and actual results in private operator evidence. Do not store tokens, passwords or customer payloads in this repository.

1. Sign in as owner A. Create/import a synthetic robot and snapshot; record a run referencing its exact snapshot ID/revision. Save, note the returned version, reload, sign out, sign back in and read/export the same records.
2. Through an authorized read-only SQL session, inspect `workspaces.version/bundle/updated_at`, the corresponding `robots`, `snapshots`, `runs`, and `corrections` payloads, `submitted_version`, and matching `audit_events.workspace_version/actor_id`. Compare canonical JSON content and counts, not a success banner alone. Confirm the run still references revision 1 after appending a correction to revision 2.
3. Repeat for organization B. Using each user's session through both application API and direct PostgREST, attempt cross-organization reads, writes and exports. Check denied requests produce no new rows. Attempt foreign robot/snapshot references and confirm atomic rejection.
4. Sign in as A's viewer: allow reads/comparison/export of A, deny writes and all B access. Revoke membership and verify subsequent reads/exports/writes are denied. Test invitation and collector revocation as documented.
5. Test a failed save and a lost response: the draft remains exportable and retrying unchanged input uses the same request ID without duplicate records. Test stale-version conflicts without overwriting history.
6. Record each result as passed, failed or blocked with evidence. Local PGlite, mocked HTTP and mocked browser checks are separate evidence; they cannot pass this matrix. Managed backup/Auth recovery and deployed isolation remain required before customer hosting.

Historical October 15 result: blocked because no synthetic staging project was configured at that time.

Current result, October 21: **B1 synthetic staging acceptance passed**, using the founder-selected project `wdwtscztkpqkejkovkob`. The October 18 activation and October 20–21 audit verified real Auth/PostgREST and browser save/reload/relogin/export, exact run references after corrections, two-organization/viewer isolation, and collector retry/revocation. The audit also verified all 17 tables have RLS and privileged command functions are inaccessible to anonymous/authenticated callers. See [the audit and manual-action guide](base-prompts-audit-2026-10-20.md) for checks and limitations. B2 implementation may proceed; no customer hosting, managed recovery, Google login or production readiness is implied.
