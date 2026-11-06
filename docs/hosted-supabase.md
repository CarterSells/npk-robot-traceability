# Hosted Supabase activation

Start with the [operating guide and complete database inventory](operations-guide.md) for a walkthrough, completion map, troubleshooting and read-only inspection SQL.

The founder selected the existing hosted project on 2026-10-16 instead of installing Docker/WSL. Activation and real persistence checks completed on 2026-10-18. The local private-beta web application now uses hosted Postgres/Auth. This does not publicly deploy the web application or authorize customer hosting before the gates in [build.md](../build.md) sections 7–8 pass.

Project: **Vector Graph Database**, reference `wdwtscztkpqkejkovkob`.

- [Table editor](https://supabase.com/dashboard/project/wdwtscztkpqkejkovkob/editor)
- [API keys](https://supabase.com/dashboard/project/wdwtscztkpqkejkovkob/settings/api-keys)
- App after activation: http://127.0.0.1:3002

## Installed schema

Inspection found no public application tables, migration history or Auth users before installation. The connector applied the existing schema and a permission correction:

| Repository migration | Hosted migration version/name |
| --- | --- |
| `202610130001_private_beta.sql` | `20261016223334_unify_private_beta` |
| `20261016040114_stage7_investigations.sql` | `20261016223342_unify_stage7_investigations` |
| `20261016223410_restrict_membership_helper.sql` | `20261016223427_restrict_membership_helper` |
| `20261020030024_stage8_pilot.sql` | `20261020210031_stage8_pilot` |

The connector assigns migration versions. Do not blindly push the local migrations to this project: reconcile the recorded versions and compare SQL/checksums first, or duplicate CREATE statements will conflict. No reset or deletion was performed.

Live catalog checks confirmed 14 application tables, RLS on all 14, two views, and no anonymous/authenticated EXECUTE on the privileged write command. Hosted default privileges had granted anonymous execution of the membership helper directly; the additive correction revokes that grant while preserving authenticated RLS checks.

October 20 Stage 8 update: the additive pilot migration is installed, bringing the application to 17 tables with RLS. The three pilot tables allow owner-only reads; ordinary clients cannot call the privileged pilot command. Synthetic live checks passed for enrollment, snapshot/save/comparison events, collector success/retry/failure/revocation, review revisions, relogin/export and tenant/viewer denial. Synthetic A contains a labeled technical rehearsal, not a customer pilot. See the [pilot guide](pilot-guide.md).

The security advisor still reports the authenticated SECURITY DEFINER membership helper (intentional: it checks membership for `auth.uid()`) and three RLS tables without client policies (intentional server-only invitation, credential and receipt access). These notices are reviewed design choices, not an assertion that the full deployment is secure. See [helper advisory](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) and [policy advisory](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

## Use the connected app

Ignored `beta/.env.local` contains the hosted URL, matching legacy anon key, loopback app origin and founder-supplied modern secret key in the existing `SUPABASE_SERVICE_ROLE_KEY` variable. The existing adapter was verified with this combination against Auth and PostgREST; no application auth code change was necessary. Keys remain server-only. The environment file and synthetic login manifest have Windows ACLs restricted to the current account and SYSTEM. Do not print, share or commit them. Rotate the supplied secret through Supabase because it was entered into the conversation, and update the private file when rotated.

Open http://127.0.0.1:3002 and sign in using the `owner` entry in ignored `.cache/hosted-supabase-accounts.json`. Choose **UNIFY Synthetic A**. This is a generated test account, not the founder's Supabase dashboard login. The `other` account owns UNIFY Synthetic B; the `viewer` account can read/export A. All seeded records and browser-created robots are explicitly synthetic. Use **Save to organization** to persist drafts. To restart the server, run `npm run dev:beta` from the repository with its bundled Node directory on PATH if needed.

Three synthetic Auth accounts and two organization workspaces were provisioned without sending email. Existing workspaces and memberships are preserved on the activation harness's reruns. Public signup was disabled through the dashboard; the Auth settings endpoint confirmed `disable_signup=true`, with anonymous sign-in disabled. Account creation remains administrator-assisted.

Executed real-service checks: application-handler sign-in/save/sign-out/relogin/reload/export; identical retry deduplication; stale-save rejection; cross-organization API denial and RLS filtering across 13 relations; viewer write denial; stored runs/investigation revisions; zero broken exact run-to-snapshot references. Live collector ingestion, retry, cross-organization scope and revocation passed; the test credential was revoked. Actual Chrome automation against the running app passed add-robot/save/refresh/relogin persistence, viewer controls, mobile overflow and no browser page errors. Observed browser responses did not contain the server key. Screenshots and activation harnesses are under ignored `.cache/`. These are synthetic activation checks, not customer evidence or a managed restoration test.

Seven PostgreSQL/PGlite regression tests passed with the additive grant correction, including simulated recovery. The latest hosted advisor also reports disabled leaked-password protection; resolve password-policy/plan requirements before customer use. See [password-security guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). No paid upgrade was made.

Do not run `npm run dev:local` for this hosted configuration: that command deliberately requires the local Docker stack and refuses different configuration. The existing port-3001 workspace remains file/tab-memory based; export any draft before moving it into the beta. The beta imports approved records and requires **Save to organization**. Keep synthetic and real records separate.

Operational backup/recovery and remaining customer-hosting gates in [private beta](private-beta.md) still apply. A hosted database is not a publicly deployed web app. Current executed results are in [build progress](build-progress.md).
