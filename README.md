# Tavrik robot configuration history

Product name updated from UNIFY on October 29, 2026. Legacy `unify-*` file formats, collector module paths, `UNIFY_*` environment variables, authentication cookies, API headers and provider-operation markers remain stable for compatibility. Existing saved organization names and historical release records retain their original labels. The repository folder and configured external accounts/domains are unchanged.

Latest verification: [base prompts 1–10 audit and exact manual fixes](docs/base-prompts-audit-2026-10-20.md). Core software passed 131 automated tests, both builds and hosted synthetic checks. Email activation, public/private deployment operations, managed recovery and real customer evidence remain outstanding; this is not a completed launch.

Prompt 10: the [advanced-capability validation plan](docs/advanced-capability-validation.md) maps the six candidates to required evidence, measurements and selection criteria. No advanced feature is selected: repeated paid use and customer-request evidence remain unverified. This follows original Stage 10's no-evidence branch.

Prompt 9 preparation: the public [synthetic walkthrough](app/walkthrough/page.tsx), current capability/data-handling copy, [release checklist](docs/launch-readiness.md), [unsent launch drafts](docs/launch-message-draft.md) and public artifact manifest are prepared. Public deployment is not complete; final hosting/origin, managed recovery and production operational gates remain outstanding. After building, `node scripts/release-manifest.mjs` identifies the static candidate without declaring it released.

Account setup: the beta now has [registration, password recovery/change and a no-sign-in demo](docs/account-access.md). Email-provider activation and actual delivery must be verified separately; see the latest progress entry.

Stage 8 update, October 20: the [four-week pilot guide and owner dashboard](docs/pilot-guide.md) now support opt-in activity measurement, weekly review revisions, support time and JSON summaries. The additive migration and synthetic live persistence/isolation checks are complete on the selected hosted target. This prepares a pilot; it does not establish customer adoption or value. Verify the dashboard with `npx playwright test --config playwright.pilot.config.ts` after `npm run build:beta` (uses installed Chrome).

**Current status, October 18:** the local beta at http://127.0.0.1:3002 connects to hosted Supabase; synthetic persistence/access checks passed. Start with the [operating guide](docs/operations-guide.md) for completed features, every application table, login/startup steps, walkthrough and bug checks. See the [dated audit](docs/bug-audit-2026-10-18.md). Older dated entries below describe their implementation-time state. Public deployment, managed recovery and customer validation remain outstanding.

Stage 6 development, 2026-10-13: a separate [private-beta server](docs/private-beta.md) supplies Supabase-backed authentication, organization roles, append-only saves, invitations, scoped collector ingestion and export/deletion. Run `npm run dev:beta` after configuring a dedicated staging project. It fails closed without configuration. Live Supabase integration and operational recovery remain hosting gates. Billing and self-service account activation are not implemented. The existing local workspace and public synthetic export retain their boundaries.

Custom metadata extension: [JSON/CSV field mappings](docs/custom-metadata.md) let engineers bring their own component measurements into the existing workspace and collector. Confirm fields and units once, reuse the mapping, then compare and correct custom fields alongside core records. Export retains mappings and exact snapshot history; this remains local, without shared hosting or automatic synchronization.

Stage 5 update, 2026-10-09: the [local Python collector](docs/collector.md) captures explicit Git metadata, artifact hashes, selected settings and manual hardware reports. Preview locally, capture before a test, attach its result, then use **Capture from your test setup → Add collector capture** in `/workspace/`. Captures append without replacing history. Python 3.10+ and Git are needed for collector verification; set `UNIFY_PYTHON` if needed. Run `python collector/test_collector.py` and `npm test`. No network ingestion or customer hosting is introduced; live ROS/engineer validation remains outstanding.

Product entry, 2026-10-05: during local use, choose **Open workspace** on the homepage or **Add your robot** on the example viewer. The main workspace is `/workspace/`; the existing `/local/` bookmark still works. Robot creation is visible on first entry and available through **Add robot** beside the page title. After creation, record hardware and test runs, compare them, and export JSON to retain the session. Both workspace routes remain excluded from public static output until customer-hosting controls exist. Example robots stay separately labeled synthetic.

Stage 4 update, 2026-10-03: the development-only [local record workspace](docs/local-records.md) adds JSON import/export, manual robot/hardware/run entry, append-only corrections and run comparison. Start `npm run dev` and open http://127.0.0.1:3000/local/. Records stay in tab memory until export; keep private files outside this repository. This route is excluded from the production static release. `npm run test:local` checks the workflow on port 3001. Engineer-dependent implementation gates are explicitly deferred in build.md; customer validation remains unverified.

The public Stages 2–3 surface of [the business brief](build.md) includes a five-section homepage with an engine-derived synthetic comparison, dedicated business pages, a run-history demo, an invented compatibility registry, and a factual security page. Detailed comparison controls live at `/services/run-comparison/`. Customer validation remains open. There is no robot ingestion, customer account, Supabase connection, lead storage, or automatic robot change.

Marketing routes: `/` (concise homepage), `/services/`, `/services/configuration-history/`, `/services/run-comparison/` (interactive comparison), `/services/pilot/` (proposed pricing), `/sectors/`, `/sectors/robotic-manipulation/`, `/about/`, and `/contact/`. Supporting routes: `/demo/` (history, comparison and working-setup reference), `/compatibility/` (synthetic constraints), `/security/` (current versus planned controls). Follow the [five-minute demo script](docs/demo-script.md). All route data is public synthetic material. The compatibility registry is not a real safety assessment.

The marketing design uses scoped tokens in `app/marketing.css`, shared components in `app/marketing-shell.tsx`, and progressive native browser animation in `app/marketing-motion.tsx`. Georgia and Arial require no font downloads. The configuration illustration uses CSS with reserved space; no photography, third-party image requests, or autoplay video is required. Content is visible without animation scripts. Reduced motion cancels animations and visual drift; mobile uses a static illustration and ordinary scrolling.

## Local development

Use Node.js 22.18 or newer and npm (tests use native TypeScript stripping). This workspace also has an ignored portable Node installation; on Windows, add it for the current session if Node is not on PATH:

```powershell
$env:PATH="$PWD/.tools/node-v24.21.0-win-x64;$env:PATH"
npm.cmd ci --cache .cache/npm
npm.cmd run dev
```

With a normal Node installation, `npm` works on Windows, macOS, and Linux. Development and preview bind only to 127.0.0.1. Open http://127.0.0.1:3000.

```sh
npm test
npm run build
npm run typecheck
npx playwright install chromium
npm run test:browser
npm run preview
```

The production build exports only public page assets to `out/`, with trailing-slash routes for static directory hosting. The preview serves that directory, not repository files. Stop it with Ctrl+C. Browser tests use the production export and expect the two founder recipients from `.env.example` with SITE_URL unset. Copy `.env.example` to `.env.local` before building the test preview. Screenshots and test reports are ignored.

This workspace's verification browser is installed in `.cache/ms-playwright`. To reuse it, set `$env:PLAYWRIGHT_BROWSERS_PATH="$PWD/.cache/ms-playwright"` in PowerShell (or `export PLAYWRIGHT_BROWSERS_PATH="$PWD/.cache/ms-playwright"` in a POSIX shell) before the browser-install and browser-test commands. Otherwise Playwright uses its normal per-user browser directory.

## Contact and publication

Copy `.env.example` to ignored `.env.local`. Set `CONTACT_URL` to one or more comma-separated founder `mailto:` addresses or an HTTPS scheduling link, and `SITE_URL` to the final HTTPS origin. These values are public, never credentials. Configuration is incorporated at build time; changing it requires a rebuild.

```sh
npm run check:release
npm run build
npm run preview
```

Without contact configuration, the contact section explicitly says it cannot accept inquiries. Missing release configuration sets `noindex, nofollow`. The primary button opens the synthetic demo; contact uses text links. No form simulates success. The release configuration check fails until both values exist; passing it does not verify ownership or authorize publication. Demo and compatibility routes remain non-indexable even with release configuration.

The founder supplied cartercness4@gmail.com and 2thomaskelley@gmail.com on 2026-09-27. Founder contact links open an email to both; separate address links are also displayed. No email is sent automatically. A Netlify sign-in was previously observed, but browser tooling blocked upload and no deployment completed. The final public origin remains unset. Before resuming publication, check the selected host's current terms and pricing. For an authorized static host, upload **only `out/`**, configure HTTPS and the public origin, rebuild as needed, then verify the live title, canonical URL, mobile layout, all navigation links, and contact destination. Confirm email delivery or a booking destination with the owner without unsolicited test messages. Retain the previous export to roll back a release. Do not upload this repository, `.env.local`, documentation, or private records.

The underlying installation follows [Next.js official installation guidance](https://nextjs.org/docs/app/getting-started/installation). Exact dependency versions are recorded in `package-lock.json`.

See [build progress](docs/build-progress.md) for checks actually completed and outstanding evidence gates. Completing this page does not authorize later application stages or establish customer validation.
