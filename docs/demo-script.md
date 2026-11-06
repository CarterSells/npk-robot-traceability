# Synthetic prototype walkthrough

Scope: Stage 3 plus the founder-requested homepage, working-setup reference, compatibility preview, proposed pricing, and security page. Authority: [build.md](../build.md). The founder deferred the real-incident prerequisite on 2026-09-29. Customer understanding and value remain unvalidated. All records, authors, constraints, and evidence identifiers are invented.

## Start locally

Use the commands in [README](../README.md). After a successful production build, `npm run preview` serves http://127.0.0.1:3000/. The direct prototype is http://127.0.0.1:3000/demo/. This is a local address, not a shareable public deployment. No data is uploaded or persisted; refresh resets selections.

## Five-minute walkthrough

1. From the concise homepage, open **Services → Run comparison** at `/services/run-comparison/`. Inspect successful run-042 against failed run-043. Six fields differ: gripper, Git metadata, firmware, policy model, dataset version, and calibration. Grip force remains unknown. This default pair is an illustration, not an automatic baseline suggestion. Change the target to the incomplete or different-procedure record and read the warnings. The configuration-layer explorer is on `/services/configuration-history/`.
2. Open the full working demo at `/demo/`. Inspect Robot 01's history. Run-043 is selected, with no baseline preselected. Choose run-042. Confirm six differences and one unknown; a difference is not a cause.
3. Open **Selected record** and a field. Inspect the exact snapshot revision, manually supplied source, author, observed/recorded times, and unavailable evidence reference. Hardware freshness is assessed at the run using an illustrative 24-hour policy, not a validated customer threshold.
4. Read **Working setup reference**. It identifies the baseline's exact revision and an engineer-led recreation checklist. Unknown grip force and unavailable artifacts mean this reference is incomplete. No deployable configuration or verified restoration is provided.
5. Select baseline run-044 for run-043. Inspect the later-baseline, procedure, object, and conditions warnings. Select run-045 for missing hardware/calibration/lineage/conditions and a stale manual confirmation. Robot 02 demonstrates not-applicable model/lineage; Robot 03 demonstrates no records. Selecting a robot or run clears the baseline.
6. Visit **Compatibility**. Run-043 matches an invented rule. Run-042 is **Not assessed**, not certified compatible; run-045 has **Insufficient information**. Inspect author, revision, hardware/procedure/object scope, and unavailable invented evidence. No real incompatibility or failure cause is established.
7. Visit **Security**. Current behavior, planned customer controls, and absent certifications are separate. The dedicated `/services/pilot/` page presents a USD 1,000 four-week proposal, not a checkout or validated price. No testimonials exist yet. Founder inquiries are on `/contact/`.

## Engineer feedback gate

Ask an engineer to identify a change, an unknown, a comparability limitation, and information needed before recreating the baseline. Record whether they understand this without a long explanation. Keep approved private feedback outside the repository; record only non-sensitive aggregate results in [build progress](build-progress.md). Automated tests do not satisfy this gate.

## Implementation boundaries

Fixtures are validated and recursively frozen at module load. Runs resolve their exact snapshot ID/revision and robot, never the latest revision. Comparison ignores object key order, preserves array order/types, and distinguishes unknown/not-applicable from unchanged. Tests cover invalid metadata, dates, provenance, duplicates and revision links. This public demo is synthetic. A separate development-only workspace implements local imports and append-only corrections; see [local records](local-records.md). The separate private beta now supports authenticated collector ingestion, hosted Supabase persistence, investigations and pilot measurements verified with synthetic records. This public demo remains separate. Real compatibility constraints, production deployment, managed recovery and customer validation remain outstanding. See [launch readiness](launch-readiness.md) for the release checklist and [the public walkthrough](../app/walkthrough/page.tsx) for current supported-input copy.
