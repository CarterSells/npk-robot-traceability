# Original Prompt 9 — release readiness

November 1 backend update: [B13 operations and release evidence](backend-operations.md) extends this checklist with machine/command/report state, worker/signing-key recovery, current compatibility and exact open gates. B11 is synthetic staging verified; B12 supplies unavailable readiness and offline candidates. Final deployed load, managed recovery and provider acceptance remain outstanding.

Authority: [build.md](../build.md), sections 1–3 and Stage 9. Started October 20, 2026. **Release preparation, not a launch announcement.** Original Prompt 9 does not execute the later B9 robot gateway roadmap.

## What can be shown

The public static site contains invented records, deterministic comparison, a [walkthrough](../app/walkthrough/page.tsx), supported metadata inputs, a proposed USD 1,000 four-week pilot and actual founder contact links. No testimonials, measured savings, customers or paid conversions have been supplied. The pilot dashboard contains a synthetic technical rehearsal, not four weeks of customer evidence.

The private beta supports explicit organization saves, scoped ingestion, immutable revisions, investigations and pilot measurement. It runs on loopback with hosted Supabase. That is not a publicly available customer service. Preserve the separate public/static and private/server builds.

## Release gate register

| Gate | Evidence available | Still required |
| --- | --- | --- |
| Pilot/customer evidence | None; October 3 deferral permits implementation | Real adoption, value, support effort and buyer response; use synthetic claims only until then |
| Production build | Fresh public build/TypeScript passed October 20; beta build passed during Prompt 8 | Rebuild with the final target origin and regenerate the artifact digest |
| Authentication | Synthetic Auth, relogin and account-flow checks passed | Actual email delivery, production redirect/signup policies and intended-user verification |
| Organization isolation | Two-org API/RLS, viewer denial and exact references checked | Repeat on the final production deployment with separate synthetic staging |
| Collector ingestion/revocation | Real hosted synthetic success/retry/failure/revocation passed | Capture → upload through the final deployed endpoint, then revoked-token denial |
| Error monitoring | User-visible failures and fail-closed APIs exist | Host-specific redacted logs, exception alerts, responsible operator and an exercised alert |
| Recovery | PGlite recovery passed; managed runbook exists | Restore a provider backup into an isolated target, recover Auth and verify revoked credentials/deletions; measure actual RPO/RTO |
| Mobile accessibility | All 27 public browser tests reported passes, including changed pages at 320/768/1440px, axe, keyboard/reduced motion and links; walkthrough screenshots inspected | Repeat on final deployment; automated checks are not certification |
| Contact/CTA | Configured founder mailto links | Final live target checks; actual delivery only with explicit recipient authorization |
| Metadata/domain/TLS | No final SITE_URL | Select host/URL, rebuild canonical metadata, verify HTTPS and redirect behavior |
| Data handling | Public demo has no uploads/auth/customer data; beta metadata only | Production retention/logging policy, request limits and provider settings |
| Environment/demo isolation | Public export excludes local workspace; synthetic beta separate | Separate staging/production projects, keys and origins; no server keys or account manifests in assets |
| Rollback | Procedure below | Record previous deploy/version and rehearse host-specific rollback |

No public-product launch or customer hosting until required operational gates pass. A separately authorized static synthetic showcase can be published without enabling private customer ingestion, once its own host, origin, asset and live checks pass.

October 20 local candidate: `unify-static-d975c19bdbf31abf`, 94 public files; manifest at ignored `.cache/release/static-manifest.json`. The two manifest tests passed. `check:release` correctly fails because SITE_URL is absent. All 27 browser tests reported passes, but the Windows preview-server teardown did not finish normally; this is not a clean runner-exit claim. No live URL, host deployment identifier or host rollback verification exists.

## Build and identify the static candidate

Later October 20 audit: all 27 public browser tests completed with clean exit when test servers were controlled separately. Fresh static candidate: `unify-static-e0d04cfd94a662d5`, 94 files. Both builds and the additional local/beta/hosted checks passed; `SITE_URL` remains missing. See [the full audit and manual fixes](base-prompts-audit-2026-10-20.md). This supersedes the earlier candidate identity, not the outstanding publication gates.

Use Node 22.18+ (the bundled runtime is documented in README). After selecting the actual public HTTPS origin, set SITE_URL in the existing local configuration without copying server credentials into public variables. Do not invent a domain to make the release check pass.

```text
npm run check:release
npm run build
npx playwright test
node scripts/release-manifest.mjs
```

`check:release` checks contact/origin configuration only. It does not attest hosting, recovery or authorization. A missing origin must continue to fail. `release-manifest.mjs` hashes only the built `out/` tree, rejects symlinks/private route names, and writes an ignored manifest with a reproducible artifact ID. The ID identifies bytes, not release approval. Rebuild and regenerate it whenever public configuration or content changes.

Upload **only out/** to the selected static host. Never upload the repository, beta server, environment files, .cache, account manifests, collector captures or private records. Do not deploy the beta as a static export. Do not point a public signup flow at the synthetic staging organization.

## Final verification at the selected origin

1. Record URL, host deploy ID, artifact ID, date and operator. Confirm TLS, HTTPS redirects, canonical links and expected index/noindex metadata. No localhost canonical URLs.
2. Open Home → Services → walkthrough → demo. Choose run-042 against run-043, inspect six differences/one unknown and a condition mismatch. Confirm invented evidence labels and no causal claim.
3. Verify supported-input copy, proposed pricing, contact destinations, mobile/keyboard/reduced-motion access and no console errors. Ensure `/local/`, `/workspace/`, `/api/`, environment files and repository/private paths are unavailable on the static origin.
4. For an authorized private-product release, separately execute sign in → local synthetic capture → reviewed enqueue → upload → saved comparison → export → sign out → sign back in. Verify exact saved snapshot/run rows; then test a viewer, second organization, stale save and revoked collector. Record failures as blockers.
5. Exercise redacted error monitoring without including bodies, cookies, bearer tokens, emails or customer configuration in logs. Record alert receipt by the designated operator. Check request and upload limits at the actual proxy.
6. Complete the isolated managed recovery drill in [private-beta.md](private-beta.md), including Auth, revoked credentials, deletion reconciliation and measured recovery objectives. An application JSON export is not a backup.

## Rollback and incident handling

Before publication retain the previous static artifact, manifest and host deploy identifier. If live checks fail, restore that exact deployment and verify its URL, CTA and isolation again; do not label a failed candidate launched. A first publication has no previous public version: unpublish the candidate if needed and retain the evidence locally.

For a private release incident, stop ingestion/disable beta access, preserve evidence with secrets redacted, and restore the previous application version. Do not reset the database or rewrite historical snapshots. Use additive migration-specific rollback guidance, including the pilot trigger guidance in [pilot-guide.md](pilot-guide.md). Restore databases only into isolated targets under the recovery runbook. Record any observation gap honestly.

## Launch communication and measurements

See [unsent launch drafts](launch-message-draft.md). Replace placeholders only with actual facts and a verified public link. Start with authorized participants/introducers; do not send or post automatically. Seek one relevant introduction from engaged users, respecting community rules and a decline.

Use a private external tracker for qualified conversations → actual activation → paid conversion → retention. Record time window, numerator/denominator, assistance, source and unknowns. Page visits are not demand; synthetic tests are not activation; a proposed continuation is not payment. Use [pilot-guide.md](pilot-guide.md) for the measurement contract.
