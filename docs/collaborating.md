# Working together on Tavrik

Private repository: https://github.com/CarterSells/npk-robot-traceability

Read [the business brief](../build.md), [repository instructions](../AGENTS.md), and [build progress](build-progress.md) before changing the project. The [November 2 audit](backend-completion-audit-2026-11-02.md) is dated evidence, not a guarantee for newer work. The handoff preserves the current local files, including candidate-registry and worker-health work that is newer than that audit; their presence does not establish completed acceptance.

## First setup

Install Git, Node.js 22.18 or newer, and Python 3.10 or newer for collector work. Then:

```sh
git clone https://github.com/CarterSells/npk-robot-traceability.git
cd npk-robot-traceability
npm ci
```

Copy `.env.example` to `.env.local` using your editor or file manager, then run `npm run dev`. Open http://127.0.0.1:3000/workspace/ for the local file-based workspace. Export records before closing it. Generate framework types by starting development or building before running the standalone type check on a fresh clone.

The separate beta runs with `npm run dev:beta` on port 3002. Copy `beta/.env.example` to `beta/.env.local` and follow [private beta setup](private-beta.md) and [local database setup](local-supabase.md). Credentials are deliberately absent from GitHub. Obtain authorized development access privately; do not paste secrets into issues, commits, or chat. Do not replay migrations against the existing hosted project: consult [its migration mapping](hosted-supabase.md) and the latest progress first.

## Shared workflow

Start from current `main`, create a branch such as `feature/short-description`, make a focused change, and push that branch. Open a pull request for the other founder to review before merging. Pull the latest changes before starting new work. Never force-push shared history to resolve a conflict.

Useful checks are `npm test`, `npm run test:beta`, `npm run build`, and `npm run build:beta`. Collector tests and browser prerequisites are documented in [README](../README.md) and [the collector guide](collector.md). Run checks relevant to the change and record actual results, including failures, in the progress log.

Keep `.env.local`, credentials, populated prospect lists, customer records, exports, and private evidence out of commits. Dependencies and generated output are re-created locally. GitHub source access does not grant database access or establish customer-hosting, provider, recovery, prediction, or hardware acceptance.

The owner can grant a collaborator access in the repository's Settings > Collaborators. The collaborator must accept any invitation before cloning a private repository. Their username and access have not yet been verified during this handoff.
