# Local Supabase development

This setup connects the existing private beta to local Supabase Postgres/Auth/PostgREST. The public showcase remains synthetic, and the root `/workspace/` remains the existing tab-memory/file workflow. Use the beta at port 3002 for database-backed records. Business scope remains [build.md](../build.md) sections 6–8; this is local development, not a hosted release.

Implementation status: CLI/configuration/scripts are installed, but actual local stack startup, account seeding and Auth/PostgREST persistence are blocked until Docker/WSL is installed. No running Studio or database connection is claimed yet.

Later on 2026-10-16 the founder selected [hosted Supabase activation](hosted-supabase.md) instead. Docker/WSL is unnecessary for running the app against that hosted database. The additive `20261016223410_restrict_membership_helper.sql` migration also applies to future local starts; the setup's pending-migration command includes it.

## Prerequisites and start

Use Node 22.18 or newer. Supabase CLI 2.121.0 is pinned in package.json and package-lock.json. On this workstation the bundled Node directory can be added to the current PowerShell PATH:

```powershell
cd C:\Users\carte\Desktop\npk-unify
$env:PATH="$PWD/.tools/node-v24.21.0-win-x64;$env:PATH"
npm ci
npm run db:setup
npm run dev:local
```

Docker Desktop with a running Linux engine is required. At implementation time neither Docker Desktop nor WSL was installed. In **Administrator PowerShell**, run `wsl --install`, restart Windows if requested, then install [Docker Desktop for Windows](https://docs.docker.com/desktop/setup/install/windows-install/) and enable its WSL 2 backend. Open Docker Desktop, complete its setup and wait for the engine to run. Reopen PowerShell and verify `docker info --format '{{.OSType}}'` prints `linux`. OS installation/restart is the remaining user step; these repository commands do not install OS components.

`db:setup` starts the stack and seeds two synthetic organizations. Initial startup downloads images and can take several minutes. Later `npm run db:start` resumes the same persistent Docker volumes, applies only pending **local** migrations, and checks/writes beta configuration. The named Docker network binds published ports to 127.0.0.1. Scripts refuse remote/TCP Docker contexts and accept only local Unix sockets or Windows named pipes. No reset, remote push, cloud project, paid service or data deletion is part of these commands.

| Service | URL |
| --- | --- |
| Private application | http://127.0.0.1:3002 |
| Supabase API | http://127.0.0.1:54321 |
| Local Studio | http://127.0.0.1:54323 |
| Local email viewer | http://127.0.0.1:54324 |
| Postgres | 127.0.0.1:54322 |

Studio is available only after the stack starts. Check `npm run db:status`; stop with `npm run db:stop` (volumes retained). Never use reset, remove-volume or `stop --no-backup` commands for this workflow. Keep Docker volumes and private backups when uninstalling Docker.

## Configuration and existing data

The setup captures keys from this project's local CLI status and creates ignored `beta/.env.local` with `BETA_ENABLED=true`, `BETA_ORIGIN=http://127.0.0.1:3002`, `SUPABASE_URL=http://127.0.0.1:54321`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`. It requires the legacy JWT keys supported by the existing adapter. Values are never printed or committed, and no variable uses `NEXT_PUBLIC_`. Existing different environment files are preserved and cause a clear stop: back them up privately, reconcile manually, then retry `npm run db:env`. There is no force-overwrite option.

`dev:local` explicitly supplies the verified local values to the beta process, preventing inherited remote environment variables from taking precedence. `npm run dev:beta` remains available for separately managed environments; check its process variables and Next.js env precedence before using it. Root contact/site configuration is untouched.

The two existing versioned migrations are reused unchanged: `202610130001_private_beta.sql` and `20261016040114_stage7_investigations.sql`. Their primary/unique indexes, tenant-qualified foreign keys, immutable payload checks, audit linkage and RLS implement the actual owner/member/viewer model. No new relationship tables or embedding/vector feature is needed. Storage, Realtime, Edge Functions and analytics are disabled because these application flows do not use them. No pgvector extension is introduced.

For an existing local volume, inspect migration history before resolving any schema conflict; do not reset it or mark migrations applied without checking the schema. Initialization does not replay migrations over an unknown schema. Pending migrations fail on conflicting objects and need administrator inspection. The seed does not import arbitrary local/customer files. To retain a root-workspace draft, export its JSON, sign into a suitable beta organization, import the file, then **Save to organization**. Synthetic seed organizations cannot mix synthetic and real records; provision a separate empty organization for real data under the existing privacy gates.

## Synthetic accounts and verification

`npm run db:seed` provisions random `@example.invalid` accounts via local Auth's administrator API; it never emails real people. Owner A and viewer belong to Synthetic local A; owner B belongs only to Synthetic local B. Public and anonymous signup are disabled; authorization remains in protected membership rows, not user-editable metadata. The seed uses the existing validated save handler with real Auth/PostgREST calls to store sample robots, snapshots, runs and an investigation. It preserves nonempty workspaces and existing roles on rerun, and does not restore a removed membership in an existing organization.

Generated account emails/passwords and organization IDs are in ignored `.cache/local-supabase-accounts.json`. Open that file locally to sign in; it is not printed by the script. Keep it private, retain it to resume seeds, and do not share or commit it. File mode 0600 is requested; Windows users should restrict the file/directory ACL to their account because POSIX mode is not a Windows ACL guarantee. The fixture contains only invented data and does not count as customer evidence. Auth passwords are never hard-coded in migrations.

```powershell
npm run test:beta
npm run db:verify
```

The first command runs API mocks and PostgreSQL/PGlite migration, reference, immutable-history and isolation checks. The second requires the real local stack and seed; it uses the application's server handler with real network requests, signs in, appends an unresolved synthetic investigation, saves, signs out/in, reloads and exports the same bundle. It checks actual relational run payloads, investigation rows, exact snapshot joins, tenant RLS and viewer write denial. It preserves all records, adding one investigation per run; the existing 1,000-revision/2 MiB limits still apply. It does not test the browser rendering or managed recovery. An unavailable stack is a failure, never a mocked success.

In the browser, sign in with owner A, choose Synthetic local A, add/import a robot or inspect the seeded runs, open Compare → Investigate this run, append a note and **Save to organization**. Reload and sign in again to inspect persistence. Viewers may read/export and cannot save. The public showcase intentionally does not display organization records.

Current executed results and blockers are in [build progress](build-progress.md). Configuration success alone does not prove database connectivity. No cloud deployment or operational recovery claim follows from local tests.

References: [Supabase local development](https://supabase.com/docs/guides/local-development), [CLI reference](https://supabase.com/docs/reference/cli/introduction), and the installed Next.js environment-variable guide. CLI commands/options were checked against the pinned version's help.
