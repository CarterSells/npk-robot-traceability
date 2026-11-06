# Product scope

Update, 2026-10-03: founder direction in build.md section 8 defers all engineer-dependent implementation prerequisites while retaining them as unverified evidence goals. Stage 4 now includes a development-only local record workspace with manual entry, imports, corrections, comparisons and exports; see [local usage](local-records.md). The historical delivery-order language below does not override that decision. Security, privacy, customer-hosting and truthful-claim requirements remain in force.

Status: Stage 1 planning material, prepared 2026-09-26. Product capabilities below are planned, not implemented or customer-validated.

Update, 2026-09-29: the canonical brief now records a founder-authorized synthetic Stage 3 build with the real-incident prerequisite deferred, plus a synthetic compatibility preview, working-setup reference, homepage comparison, and security/pricing updates. The original delivery-order text below is historical planning; these explicit exceptions and current delivery status are in build.md and build-progress.md. Customer gates remain unvalidated.

Authority: [build.md](../build.md), sections 1–4, 6–9. This document elaborates that brief; it does not replace it. Delivery and evidence status live in [build progress](build-progress.md).

## Promise and full vision

See what changed between your robot's last successful test and its latest failure.

Connect tools robotics engineers already use into a shared history of hardware, software, AI models, training-data lineage, calibration, and settings. Link that history to individual tests so engineers can reconstruct configurations, compare outcomes, and identify recorded changes worth investigating. Reduced reconstruction time, collaboration across disciplines, and recreating working configurations are intended benefits to validate.

The initial workflow serves commercial ROS 2 manipulation teams. The broader vision includes checks for known compatibility problems and tools for testing changes before deployment. Those capabilities require later evidence and are not implied by completion of the first release.

## Initial customer and buyer

| Dimension | Working hypothesis |
| --- | --- |
| Team | Commercial picking, sorting, or machine-tending team; roughly 5–30 engineers and 2–20 robots or cells |
| Environment | ROS 2, Git, configuration files, camera calibration, and sometimes learned models |
| Daily user | Robotics, integration, or test engineer reconstructing a regression |
| Buyer | CTO or engineering lead who owns the cost and can approve a pilot |
| Trigger | Failed customer demonstration, recurring regression, or inconsistent units |
| Pain | Relevant changes are scattered across people and tools, leaving incomplete test context |

Recurring pain and access to a buyer matter more than the size ranges. University labs can inform usability but do not substitute for commercial willingness-to-pay evidence. Mobile manipulation and integrators with repeated installations are adjacent opportunities, not automatic additions to the initial scope.

## Planned first workflow

1. Identify the robot, procedure version, task/object, and test conditions.
2. Attach an exact immutable configuration snapshot revision to each run.
3. Record outcomes, units, provenance, and evidence references; show missing information.
4. Let an engineer select a successful baseline. Explain any suggestion and warn about noncomparable procedures or conditions.
5. Compare recorded hardware, software, model, calibration, settings, and test-condition changes, exposing relevant training-data lineage.
6. Capture investigation notes and distinguish investigating, hypothesis, confirmed-by-engineer, and unresolved states. Confirmation needs an evidence note or retest reference.
7. Export and refer back to the history. Recreating a working configuration remains engineer-controlled.

A difference is a fact to investigate, not proof of a cause.

## Record and trust requirements

The detailed contract remains in build.md section 6. Future implementations must preserve:

| Domain | Required meaning |
| --- | --- |
| Robot and run | Stable identifiers, valid versioned schema, exact snapshot revision reference |
| Hardware | Component identity/revision, operator author, and last-confirmed time; visibly manual when manually reported |
| Software | Git commit, dirty status, and optional build digest |
| Model | Version or content hash; explicit not-applicable where appropriate |
| Training data | Dataset identity/version or evidence reference when relevant and available; no raw dataset storage |
| Calibration/settings | Versions/hashes and selected relevant values |
| Test | Procedure version, task/object, conditions, outcome, and units |
| Provenance | Source, collection method, observed/captured time, recorded time, and evidence references |

Domain fields distinguish known, unknown, and not-applicable. Unchanged is a comparison result: two missing values do not prove sameness. Structural identifiers and schema metadata must remain valid. Display stale confirmations and unavailable evidence. Corrections append a revision with author, reason, and prior-revision reference; historical runs retain their original reference. Compare semantically and deterministically, independent of irrelevant object-key order.

## Boundaries and delivery order

Stage 1 delivers scope, interviews, outreach drafts, and a blank tracker only. Stage 2 is the initial outreach page and can proceed alongside discovery. Stage 3 follows a manually reconstructed customer incident and uses labeled synthetic fixtures. Stages 4–7 progressively introduce local real-record imports, a local collector, authenticated hosting, and investigation workflows. Stages 8–9 measure a pilot and prepare launch; Stage 10 considers one justified advanced capability after repeated paid use. Refer to build.md section 8 for each exact gate.

The first release excludes autonomous diagnosis, automatic rollback/deployment to robots, fleet control, simulation, model training, raw dataset/recording storage, broad integration catalogs, and AI-generated root-cause claims. Proposed architecture is Next.js/TypeScript, Supabase Postgres/Auth, and a Python collector; Stage 1 neither installs nor validates that stack.

Capture only allowlisted metadata, hashes, and approved references. Do not upload source code, weights, datasets, recordings, credentials, or secrets. Collection begins locally; authenticated ingestion precedes uploads. Real customer hosting requires authorization, organization isolation, ingestion/revocation, immutability, and recovery checks. Planned hosting is not available access.

## Assumptions to test

| Assumption | Evidence to seek | Response if unsupported |
| --- | --- | --- |
| Reconstruction is recurring and costly | Recent incidents, frequency, reconstruction timings, missing information | Revisit pain or niche before expanding |
| Existing tools leave a meaningful gap | Engineer demonstrates current reconstruction and its limitations | Narrow to an actual gap or reconsider the proposition |
| Engineers can supply usable records | Sanitized successful/failed run pair with provenance and explicit unknowns | Identify capture gaps before promising automation |
| Capture fits normal testing | Engineer can capture and inspect a snapshot with little assistance | Revise workflow before adding features |
| Comparisons aid investigation | Engineer understands differences and requests relevant missing context | Improve record semantics and comparison usability |
| A buyer values the outcome | Concrete pilot decision, buyer participation, later paid continuation | Revisit urgency, buyer, scope, or pricing |

All remain unvalidated. No competitive advantage, time saving, customer adoption, or willingness to pay is established.

## Measurable pilot criteria

Proposed offer: one test workflow for up to five robots over four weeks. Before a pilot, agree on the engineer, buyer, supported inputs, responsibilities, measurement method, and success thresholds. These are negotiable targets from build.md section 9, not current performance.

| Criterion | Target or agreement needed | Measurement |
| --- | --- | --- |
| Snapshot coverage | At least 90% of eligible runs | Eligible runs with a valid attached snapshot / expected eligible runs from the test runner; report unknown if the denominator is unavailable |
| Missing information | Missing required domain information is visible | Review agreed required fields against captured runs; count and describe hidden omissions |
| Hardware update effort | Under one minute | Time representative operator updates; retain sample count, observed timings, and assistance |
| Reconstruction time | Material reduction; negotiate threshold before starting | Time reconstruction separately from total debugging, comparing a recorded customer baseline with comparable pilot incidents |
| Independent use | Use without repeated founder reminders; agree cadence | Record activity and assistance separately, including founder reminders |
| Commercial outcome | Explicit continue-paid, revise, or stop decision | Record buyer response, support effort, measured value, and willingness to pay |

For each measure retain baseline method, observed versus estimated status, sample counts, limitations, and founder support time. Do not infer coverage from ingestion successes alone or claim product savings from incomparable incidents. Approximately $1,000 for the four-week pilot is a pricing hypothesis; ongoing subscription pricing is unvalidated. A free design partnership needs an end date and otherwise unavailable access/feedback. This document authorizes neither charging nor customer outreach.

## Stage 1 acceptance and handoff

- Scope, customer/buyer, pain, assumptions, exclusions, and measurable pilot criteria are documented.
- [Customer discovery](customer-discovery.md) and [outreach drafts](outreach-messages.md) are ready for human use.
- The [private tracker template](private-tracker-template.md) remains blank; populated copies belong outside the repository and public assets.
- Discovery targets are tracked honestly: 20 candidate companies, approximately eight relevant conversations, three teams with recurring pain, and two willing to test with actual records. No verified evidence has been supplied.
- Completing these documents does not complete customer discovery. Customer lead assignment, kickoff, introductions, and evidence collection remain human next actions.
- The outreach page can be requested next; actual founder contact is needed for a functioning CTA, and hosting/domain access is needed for a relevant publication step.
