# Base prompts 1–10 — implementation audit and manual fixes

Audit began October 20, 2026; handoff completed October 21 (local). Authority: [build.md](../build.md). This audits the original ten prompts, not B1–B13. Technical verification uses synthetic data and does not establish customer value or production readiness.

## Overall result

The implemented core software has passed the checks recorded below. **All ten business stages are not fully complete:** public publication, real account email delivery, managed recovery, production operations and real pilot evidence remain outstanding. Prompt 10 correctly supplies a validation plan under its explicit no-evidence branch; it does not contain a justified advanced-feature implementation.

| Base prompt | Delivered behavior/material | Current status and remaining work |
| --- | --- | --- |
| 1 — Scope/discovery | Product scope, interview guide, unsent outreach drafts, blank private tracker | Materials complete; actual interviews, incidents and buyer evidence not supplied |
| 2 — Outreach site | Working public pages, actual founder mailto links, synthetic examples and proposed pilot | Build/local browser verification available; final public origin and publication missing |
| 3 — Comparison prototype | Exact run/snapshot comparison, unknowns, provenance, condition warnings, working-setup reference | Technically checked; real engineer comprehension/value unverified; compatibility remains invented |
| 4 — Local records | Manual robot/hardware/run entry, import/export, append-only corrections, custom metadata and test handoff | Implemented; tab-memory drafts require explicit JSON export; current size/collection bounds apply |
| 5 — Collector | Explicit Git/hash/settings/manual hardware capture, optional bounded ROS parameter, result handoff | Python and interoperability checks pass; physical robot/ROS trial remains unverified |
| 6 — Private beta | Auth, organizations/roles, explicit saves, audit, invitations, scoped ingestion/retries/revocation, export/deletion | Synthetic database/API and hosted checks pass; email activation, production operations and managed recovery remain incomplete |
| 7 — Investigations | Baseline selection, evidence-linked differences, notes/states, revision history and reports | Implemented and technically checked; a real engineer-confirmed resolution still needs actual evidence |
| 8 — Four-week pilot | Onboarding/measurement guide, owner dashboard, append-only reviews and export | Software and synthetic hosted checks pass; no real four-week customer pilot or paid outcome established |
| 9 — Launch | Walkthrough, supported inputs, security copy, proposed offer/contact, artifact inventory, release/rollback checklist and unsent drafts | Preparation complete; actual deployment, production workflow and rollback checks outstanding |
| 10 — Advanced capability | Six-candidate validation plan, measurements and decision criteria | Required no-evidence deliverable complete; no advanced capability selected/implemented |

## Verification evidence

- Core Node tests: **37 passed**, including comparison semantics, immutable history, local/custom imports, Python handoffs, investigations, configuration and release inventory.
- Beta API/domain/PostgreSQL/PGlite/setup tests: **26 passed**, including two-organization RLS, viewer/owner restrictions, invitations, revocation, idempotency, stale saves, deletion, investigations, pilot history and simulated recovery.
- Python: **13 collector tests and 4 upload-queue tests passed**. The initial sandbox run could not access Git; the rerun with access to the existing installation passed. No Git installation is needed on this PC.
- Public and beta production builds: **passed with TypeScript**. The public export excludes `/local/` and `/workspace/`. Beta was rerun with protected environment access after the sandbox could not read its configuration.
- Browser verification: **27 public, 14 local-workspace and 10 beta tests passed**, all with clean runner exits. Test servers were controlled separately to avoid conflating test assertions with Windows web-server teardown. Installed Chrome was used; temporary configurations/output are ignored under `.cache/` and `test-results/`. Local collector and hosted viewer mobile screenshots were inspected.
- Fresh hosted Auth/API checks passed: synthetic save/correction activity, ingestion success/duplicate/failure/revocation, append-only review/conflict, relogin/export and owner/viewer/tenant denial. A labeled synthetic correction and review revisions were appended; the generated collector token was revoked.
- Fresh real-browser pilot checks passed: owner dashboard, persisted review/export, relogin, viewer hiding, axe and mobile overflow.
- Fresh real-browser workspace checks passed: sign-in, one labeled synthetic robot added/saved, refresh/relogin persistence, viewer controls, mobile overflow, no page errors and no server key in captured browser responses.
- Release check still fails correctly for missing `SITE_URL`. The fresh local build inventory is `unify-static-e0d04cfd94a662d5` (94 files), recorded in ignored `.cache/release/static-manifest.json`. Rebuild/regenerate with the final origin before publication.
- Hosted catalog: four expected migrations; **all 17 public tables have RLS**; `beta_command` and `pilot_command` cannot be executed by anon/authenticated roles; **zero broken run-to-snapshot references**.
- Auth settings read-only check: email provider enabled, **signup disabled**, email autoconfirm disabled (confirmation retained). SMTP delivery, redirect configuration and provider minimum password length are not established by that endpoint.
- Security advisor: leaked-password protection disabled; existing membership-helper warning and three no-policy server-only tables remain. These latter notices match the deliberate architecture and passing isolation tests; do not add permissive policies or remove the membership helper merely to clear warnings. See [helper notice](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) and [server-only policy notice](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

No managed restore, actual email inbox delivery, live ROS trial, real customer pilot or public deployment is claimed. Passing tests are bounded evidence, not proof of a bug-free product. No Git directory exists, so review uses complete files rather than a Git diff.

## Corrections made during this audit

The private-beta guide still instructed administrators to use the old account-only setup and said investigation staging was unverified. It now describes the current registration/recovery flow, distinguishes provider activation, and specifies all four migrations for a new empty environment while forbidding replay on the existing hosted schema. The discovery guide now reflects implemented software and the October 3 prerequisite deferral instead of reimposing the original Stage 3 gate. Historical test results remain dated.

The missing-Git test error was an execution-permission issue, not a product defect. The collector intentionally reports unavailable Git metadata as unknown; it must not claim a clean revision when Git is absent. Existing nonblocking Node module-type/color warnings do not affect the recorded results.

## Manual fixes, in order

### 1. Rotate the previously shared server secret

**Problem:** the hosted setup history records a server secret supplied through conversation; subsequent rotation is not evidenced.

**Fix:** in the selected project's [API keys](https://supabase.com/dashboard/project/wdwtscztkpqkejkovkob/settings/api-keys), create a replacement secret using the provider's rotation procedure. Update only `SUPABASE_SERVICE_ROLE_KEY` in private `beta/.env.local` and any authorized server secret store. Restart the beta, verify synthetic sign-in/save/export, then revoke the old secret. Never put it in a `NEXT_PUBLIC_` variable, chat, screenshot or public host asset. If already rotated, record that completion privately rather than rotating blindly. See [key rotation](https://supabase.com/docs/guides/api/api-keys).

**Done when:** the replacement works server-side, the old key is revoked, and browser responses/assets contain no server secret.

### 2. Activate email signup, confirmation and recovery

**Problem:** signup is currently disabled; real email delivery and founder verification are outstanding.

**Fix:** in [Auth settings](https://supabase.com/dashboard/project/wdwtscztkpqkejkovkob/auth/providers), enable email signup when ready to test the account flow, keep confirmation enabled, and set the provider minimum to **8** to match the app's existing requirement. In [URL configuration](https://supabase.com/dashboard/project/wdwtscztkpqkejkovkob/auth/url-configuration), use `http://127.0.0.1:3002` as this local environment's Site URL and allow exactly `http://127.0.0.1:3002/`. Preserve other legitimate redirects. For production use its actual HTTPS beta origin and matching exact redirect in the separate production project; don't substitute the public static site's URL.

Configure a verified sender and SMTP host/port/user/password in Supabase Auth's SMTP settings using your chosen email service. Enter credentials privately. Supabase's default mail service is restricted to project-team addresses and is not intended for production; see [SMTP setup](https://supabase.com/docs/guides/auth/auth-smtp). Exact redirect paths are recommended for production in [redirect configuration](https://supabase.com/docs/guides/auth/redirect-urls).

Run the beta, enter your email in the app and use **Resend confirmation email** for your existing account, then open the link on the PC running the local server. For a new authorized test account, use **Create account**, confirm the received link, sign out/in, then test **Forgot password** and a new-password sign-in. Do not mark a real email verified manually as a workaround. Enabling signup alone grants no organization role.

**Done when:** confirmation and reset messages actually arrive, links return to the intended app, the account signs in, and an account without membership cannot access organization records. No test email was sent by this audit.

### 3. Finish membership and password-policy setup

**Problem:** a valid login alone does not provide a workspace. Leaked-password protection is disabled.

**Fix:** use the existing synthetic owner for local testing. For an authorized team, an owner creates an email-bound member/viewer invitation under **Manage team and collector access** and shares its token through an authorized private channel; the verified recipient uses **Accept an invitation**. A new organization's owner/bootstrap is still administrator-assisted using [private-beta.md](private-beta.md); do not grant ownership by editing browser data. Keep customer organizations out of synthetic staging until operating gates pass.

Inspect password security in Supabase Auth. Enable leaked-password protection if supported by your chosen plan; it currently requires Pro or above, so decide the cost yourself before any upgrade. Record the chosen policy and verify it on the actual account flow. Do not enable additional reauthentication/current-password requirements without checking UI support. See [password security](https://supabase.com/docs/guides/auth/password-security).

**Done when:** intended owner/member/viewer roles work, a second organization is denied, and the password-policy decision is recorded and tested. The existing intentional RLS advisor notices need review, not permissive access changes.

### 4. Supply the public host and final URL

**Problem:** `SITE_URL` is missing; the static site has no verified public deployment.

**Fix:** choose the existing hosting account/project and exact HTTPS public origin. Set root `.env.local`'s `SITE_URL` to that origin, preserving the configured founder `CONTACT_URL`. From the repository run the commands below using the bundled runtime. Do not copy beta secrets into the public configuration.

```powershell
$env:PATH="$PWD/.tools/node-v24.21.0-win-x64;$env:PATH"
npm.cmd run check:release
# Continue only if the release check succeeds.
npm.cmd run build
# Continue only if the build succeeds.
node scripts/release-manifest.mjs
```

Deploy **only `out/`** to a static host. Verify HTTPS, canonical metadata, Home → walkthrough → demo, founder contact destinations and mobile access. Verify `/local/`, `/workspace/`, `/api/` and private/environment files are unavailable. Record the live URL, host deploy ID and newly generated artifact ID. Preserve/rehearse the previous deployment rollback; for a first failed publication, unpublish. Follow [launch readiness](launch-readiness.md). A static showcase deployment does not enable beta login or customer hosting.

**Done when:** the real public URL passes those checks. A localhost URL or local build does not complete publication.

### 5. Deploy the private server with separate production configuration

**Problem:** the web app currently runs on your PC; a hosted database alone does not make the application publicly accessible. Production environment, monitoring and gateway settings are not selected/verified.

**Fix:** choose a host capable of running the Next.js `beta/` server and a separate production database/Auth project, without reusing synthetic staging keys or accounts. Agree any costs before provisioning. Reconcile/apply all four migrations on an empty target; never blindly replay them on the existing hosted database. Configure the five server variables listed in `beta/.env.example`, with exact HTTPS `BETA_ORIGIN`, then build/start behind the host's HTTPS adapter or proxy. Do not expose `next dev` or upload the beta as a static site.

Set request size/time/rate limits, redacted error logs, an alert recipient/operator, and an agreed log/data retention policy. The app's body validator allows workspace bytes plus request overhead; exercise both a valid near-limit upload and rejection above the chosen proxy limit. Never log bodies, cookies, authorization headers or full customer configuration. Exercise a synthetic failure and verify an alert arrives. Test sign in → capture → reviewed upload → compare → save/export → sign out/in on the actual HTTPS target, plus viewer/second-organization/revoked-token denial. Complete recovery below before allowing customer records.

**Done when:** the actual deployment passes the workflow/isolation tests, limits and redacted alerts work, and rollback/operator/retention decisions are recorded. Exact provider controls depend on the host you select; none has been invented here.

### 6. Perform an isolated managed recovery drill

**Problem:** local PGlite recovery passes, but managed database/Auth recovery is not proven.

**Fix:** inspect the chosen project's backup capability and record schedule, retention, acceptable data loss and restore time. Configure a supported backup method for that plan; Supabase's [backup guide](https://supabase.com/docs/guides/platform/backups) distinguishes managed backups from free-tier logical dumps. Agree any paid changes first. Use a separate isolated restore target, never overwrite the only working project.

Follow [the recovery procedure](private-beta.md#export-deletion-backup-and-recovery): back up synthetic organizations and Auth consistently; restore schema/data/roles; verify all migrations, RLS, exact snapshot references and exports; sign in and repeat both organizations' allow/deny paths. Reconcile deletions since the backup. Revoke restored invitation/collector credentials, invalidate sessions and rotate/reissue secrets before exposing the restored service. Measure actual elapsed restoration time and lost data against your objectives. Keep backups and a deletion ledger encrypted/access-controlled outside this repository.

**Done when:** an operator records a successful restore and authorization/revocation/deletion reconciliation on the isolated target. JSON workspace export alone is insufficient. Do not click restore on the current project just to clear this checklist.

### 7. Validate the real capture workflow and customer value

**Problem:** synthetic checks cannot prove ROS behavior, engineering usefulness, a four-week pilot or willingness to pay.

**Fix:** assign a conversation lead and engineer. Use [discovery](customer-discovery.md) to obtain permission for an actual successful/failed run pair; keep private notes outside the repository. On the engineer's machine, preview explicit collector paths/fields before capture and verify unavailable metadata stays unknown. The optional ROS adapter supports only the documented numeric grip-force parameter; test it in the intended ROS environment if needed. Base capture works without ROS. Do not infer hardware changes from files.

Once customer-hosting gates pass, run the agreed four-week workflow using [pilot-guide.md](pilot-guide.md): record baseline method, independent eligible-run count, observations, assistance/support time and weekly reviews. Let an engineer confirm a resolution with evidence or leave it unresolved. Record the buyer's actual continue/revise/stop decision; no payment or savings is implied by the dashboard.

**Done when:** real observations and limitations exist for the agreed workflow. Revisit Prompt 10 using [the validation plan](advanced-capability-validation.md); select one advanced capability only when justified, or explicitly revise direction. No software toggle substitutes for this evidence.

## Limits that are not setup bugs

Local drafts are lost on refresh unless exported; beta drafts require **Save to organization**. Sessions deliberately expire without automatic refresh. Workspaces remain bounded to 2 MiB and 1,000 entries per record collection; pilot enrollment is one immutable 28-day plan per organization. Billing/automatic paid activation, Google OAuth, CAD geometry parsing, broad robot connections and predictive features are not delivered by the base prompts. Larger backend work belongs to separately requested B stages. Docker/WSL is optional for the chosen hosted path, not a prerequisite to use the current beta.
