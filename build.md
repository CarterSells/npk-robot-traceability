# Robot engineering history — business and build source of truth

Status: founder-supplied direction; pre-validation; local Stages 2–5, Stage 6 private beta and Stage 7 investigations implemented. Stage 8 pilot preparation and measurements completed on 2026-10-20, including hosted synthetic verification. Public deployment, operational recovery and actual customer pilots remain outstanding. Engineer-dependent implementation prerequisites deferred on 2026-10-03; customer evidence remains unverified. See docs/build-progress.md for checks and publication blockers.

Audit, 2026-10-20: all ten original prompts were checked against this brief. Stage 9 release preparation and Stage 10's no-evidence validation plan are delivered; a completed public/customer launch and advanced capability are not claimed. See docs/base-prompts-audit-2026-10-20.md for fresh technical results and exact manual activation steps. This records verification, not a change to business direction or evidence gates.
Established: 2026-09-26. Schedule: an estimated 8–12 weeks from kickoff, not fixed deadlines.

## 1. The promise and the full idea

**See what changed between your robot’s last successful test and its latest failure.**

We are building a platform that connects the tools robotics engineers already use into a shared history of each robot’s hardware, software, AI models, training data, calibration, and settings. Linking that history to individual tests lets teams understand how a robot was configured, compare successful and failed runs, and identify recorded changes worth investigating. The intended benefits are less time reconstructing information, collaboration across disciplines, and the ability to recreate working configurations. These are intended outcomes, not measured claims.

The shared engineering record makes comparison possible; comparison gives teams a reason to maintain the record. The first product must deliver that loop before expanding into a broad platform.

Longer term, the platform may check documented compatibility constraints and help engineers test changes before deployment. Training-data lineage belongs in the vision: initially record an explicit dataset identity/version or evidence reference when relevant and available. Do not build dataset storage, training infrastructure, simulation, or deployment automation merely to complete the vision.

Differences do not prove causation. A comparison reports facts and uncertainty; an engineer investigates and confirms a resolution with evidence.

Positioning: **We help robotic manipulation teams record each test’s hardware, software, model, and calibration, then compare runs to see what changed.**

Founder direction, 2026-09-29: emphasize knowing recorded configuration changes and retaining the exact reference for the setup that worked. Show the working synthetic comparison on the homepage, including hardware revisions, firmware, calibration, policy-model and teleoperation dataset versions. Keep the manipulation-team focus. Use one prominent demo CTA, show the existing proposed four-week pilot as USD 1,000 (an unvalidated proposal, not an available checkout), and publish a factual security-status page. Testimonials and certifications require actual evidence and permission; none are supplied. Engineer-led recreation references do not imply automatic rollback or a proven ability to restore robot performance.

## 2. First customer and buying context

The initial hypothesis is small commercial teams developing robotic arms for picking, sorting, or machine tending.

| Dimension | Screening hypothesis |
| --- | --- |
| Team | Approximately 5–30 engineers |
| Equipment | 2–20 robots or test cells |
| Stack | ROS 2, Git, configuration files, camera calibration, possibly learned models |
| Changes | Frequent gripper, camera, software, model, or calibration changes |
| Pain | Engineers repeatedly reconstruct changes after a regression |
| Daily user | Robotics, integration, or test engineer |
| Buyer | CTO or engineering lead |
| Buying trigger | Failed customer demonstration, repeated regression, inconsistent units |

These ranges are not established market facts. Prioritize recurring pain and access to a buyer over company size. Keep mobile manipulation and integrators with repeated installations as adjacent niches for later. University labs can inform usability and introductions; commercial teams must validate willingness to pay.

## 3. Problem, workflow, and boundaries

Today’s working hypothesis is that relevant information is scattered across people, Git, robot configuration, component records, models, calibration files, and recordings. Existing tools may already solve parts or all of this for a prospect; discovery must establish the gap.

The first workflow is:

1. Identify the robot and test procedure.
2. Attach an immutable configuration snapshot to the run, with provenance and explicit missing information.
3. Record conditions, outcomes, units, and evidence references.
4. Compare a failed run with a selected successful baseline, warning when the tests are not comparable.
5. Investigate recorded changes, capture notes, and record an evidence-backed engineer resolution.
6. Refer back to and export the history; recreate a configuration through an engineer-controlled process.

The first release excludes autonomous diagnosis, automatic robot rollback or deployment, fleet control, simulation, model training, raw dataset/recording storage, broad integration catalogs, and AI-generated root-cause claims. It connects existing tools rather than trying to replace every engineering tool.

## 4. Position and potential defensibility

“Everything in one place” is insufficient positioning. The founder’s competitive context identifies overlap with Foxglove device/recording/configuration metadata, Formant fleet/configuration workflows, and Viam configuration history/reversion. These are supplied research leads, not independently verified current feature claims; check primary sources before publishing a comparison or making a competitive decision.

The proposed advantage is dependable history connecting physical changes, digital versions, test conditions, and outcomes across existing tools. Interviews must establish whether this workflow is underserved.

| Potential advantage | How it develops | Evidence | Limitation |
| --- | --- | --- | --- |
| Accumulated history | Preserve snapshots, changes, investigations, resolutions | Teams reference months of history in decisions | Customers own records; support export |
| Reliable capture | Handle missing fields, offline robots, stale hardware, version formats | High coverage with low effort across customers | Connectors alone are easy to copy |
| Embedded testing workflow | Attach capture and comparison to normal tests | Usage without founder reminders | Integration needs repeated use |
| Niche trust and distribution | Earn supplier, integrator, and community referrals | Repeatable qualified introductions and renewals | A contact list is not a moat |
| Validated compatibility knowledge, later | Preserve confirmed combinations and scoped failure conditions | Future tests benefit with few false alerts | Cross-customer use needs rights and consent |

No moat or network effect is established at launch. Private histories primarily create value within each customer organization.

Founder-supplied Alloy observations on 2026-09-29 are unverified research leads, including funding, customers, log analysis, MCP, Iceberg, Parquet, and possible configuration-history gaps. Do not publish comparative superiority or integration claims from these observations. The intended configuration layer should complement existing tools; no Alloy integration is implemented or promised.

## 5. Customer development and outreach

One person leads development; another leads customer conversations. Both review evidence and gates together. Dates are estimates; advance when evidence supports it. The immediate business milestone is **two teams willing to share a real regression and test comparison**.

During days 1–14, identify 20 well-matched companies and a credible route into each. Ask former colleagues, classmates, professors, founders, suppliers’ applications engineers, integrators, consultants, incubators, and alumni networks for relevant introductions. Participate usefully in robotics communities and share a test-record template. MassRobotics’ startup directory, ROS-Industrial membership, and ROS local groups are research leads; directory membership is not a warm connection.

Keep the populated prospect tracker outside the repository and public assets. Its template fields are: connection route, introducer, company, role, evidence of fit, stage, next action, and date. Track introductions requested → introductions made → conversations → shared examples → pilots → paid customers. Do not invent contacts or evidence. Drafting messages does not authorize sending them.

Introduction request:

> We’re researching how manipulation teams track changes between successful and failed robot tests—especially gripper, camera, software, and calibration changes. Do you know an engineer who owns that troubleshooting? We’d appreciate a short introduction. We can help map one recent incident and share the resulting change-history template.

Forwardable message:

> [Names] are building a tool that connects robot configuration history to test results. They’re looking for manipulation engineers willing to walk through one recent regression in a 20-minute conversation. They’ll return a simple change timeline and identify where the record was incomplete.

After a genuine meeting:

> Good meeting you at [event]. Your point about [specific issue] connects to what we’re investigating. Would you walk us through one recent test where the robot’s behavior changed unexpectedly? We can help organize the configuration history afterward.

Follow up once after approximately five business days, then once the next week with something useful; stop unless they engage. Example first follow-up: “Following up on the introduction request below. If someone comes to mind who owns manipulation testing, we’d appreciate a connection.” Example final follow-up: “One last note: [link to an actual useful template]. If a recent regression would be useful to map, we’d be glad to help.” Replace placeholders with truthful details before any authorized sending.

Discovery asks:

- What happened the last time a successful test started failing?
- How did you reconstruct the configuration, what was missing, and who had it?
- How often does this happen, and how much engineer time went into reconstruction?
- What do current tools already handle?
- Can we work through a sanitized example together?
- Who decides whether to pay, and what concrete next step can we agree on?

Avoid relying on “Would you use this?” Start with a recent incident. Initial working gate: approximately eight relevant conversations, three teams with recurring pain, and two willing to test with actual records. If conversations produce no examples, revisit the problem or niche before expanding implementation.

## 6. Record and comparison contract

Founder direction, 2026-10-12: flexible robot-specific components and measurements are essential because engineers and companies do not share one fixed set of statistics. Extend the existing local workspace and collector alongside engineers' existing tools. Discover supported metadata fields for review, let engineers confirm labels/types/units and reuse approved mappings, and preserve custom data in snapshots, comparisons, corrections and exports. Begin with bounded JSON and CSV metadata; arbitrary binary/CAD/document understanding is not implied. Keep older records readable, distinguish missing fields and incompatible units, and do not silently capture unapproved new fields. Generic tests must not require fabricated pick counts. This expands the local record contract, not authorization for multi-company hosting or live shared accounts; existing privacy, provenance and evidence gates remain in force.

Each run references one exact immutable snapshot revision. The schema is versioned and validated, with comparison logic separate from UI.

File-to-test handoff, 2026-10-12: the founder requested that added files update the test workflow for differing robot parts and CAD metadata. Approved JSON/CSV imports and collector captures without results prepare a test draft with the exact new snapshot selected and custom fields displayed. The engineer supplies the actual result; saved tests retain their original references. CAD identities/revisions are metadata references, not parsed geometry. This remains the local file workflow; background directory watching and shared ingestion are not implemented.

| Record | Minimum information |
| --- | --- |
| Robot | Stable identifier |
| Hardware | Component identity, revision, operator author, last-confirmed time |
| Software | Git commit, dirty status, optional build digest |
| Model | Version or content hash; explicit not-applicable when appropriate |
| Training-data lineage | Relevant dataset identity/version or reference when available; explicit unknown/not-applicable otherwise; no raw upload |
| Calibration and settings | Versions/hashes and selected relevant values |
| Test | Procedure version, task/object, conditions, outcome, units |
| Evidence | Source, collection method, observed/captured time, recorded time, references |

Every captured domain field supports known, unknown, and not-applicable states. Required structural identifiers and schema metadata must still be valid; “unknown” is not a way to bypass record integrity. “Unchanged” is a comparison result, not a substitute for unknown. Two missing values must not imply verified sameness. Separate the time a change occurred from the time it was recorded.

Manual hardware reports remain visibly manual. Never infer physical changes from software files or claim an operator manifest was automatically verified. Show stale confirmations, unavailable evidence, and incomplete fields prominently.

Corrections create a new revision with author, reason, and a prior-revision reference. They never silently rewrite historical runs. Compare semantically and deterministically, ignoring irrelevant object-key ordering. Flag changes in procedure, object, or conditions that limit interpretation.

The promise does not justify choosing any latest success blindly. A suggested baseline requires sufficiently comparable procedure and conditions, an explanation, and engineer selection. Group changes into hardware, software, model, calibration, settings, and test conditions; expose relevant lineage and evidence. Investigation states are investigating, hypothesis, confirmed-by-engineer, and unresolved. Confirmation requires an evidence note or retest reference.

## 7. Architecture direction and data handling

Proposed stack: Next.js and TypeScript for the page/application, Supabase Postgres and Auth for the private beta, Python for capture. Preserve an existing suitable stack if one is introduced; document deviations and reasons. Start with synthetic JSON, then local imports, then collection, then authenticated hosting. No infrastructure is required for this documentation task.

The collector uses explicit paths and allowlisted fields. Capture Git metadata, model hashes, calibration hashes, selected settings, timestamps, and an operator-provided versioned hardware manifest. Preserve its author and confirmation time. Provide local output, validation, dry-run preview, a generic runner hook, explicit missing metadata, and an optional ROS 2 adapter with timeouts. The base tool works without ROS. Document Windows development and Linux robot usage.

Exclude secrets, credentials, raw model weights, source code, datasets, and recording files from uploads. Capture references and hashes rather than copying sensitive artifacts. No network upload until authenticated ingestion exists.

Before hosting real customer records, require organization-scoped accounts, memberships, robots, components, snapshots, runs, evidence references, correction events, and investigations. Enforce application authorization, row-level security, and relationship checks. Use invite-based owner/member/viewer roles. Keep privileged keys server-side; hash scoped revocable collector credentials. Support idempotency, bounded retries, offline queuing, payload/schema limits, export, deletion, and documented backup/restore.

Prove with two organizations that reads, writes, references, and exports cannot cross boundaries. Keep credentials and customer configuration out of logs and analytics. Separate synthetic demo routes and staging/production configuration. Do not claim production readiness before checks pass.

## 8. Evidence-led 8–12 week working plan

Stages are sequential implementation units with overlapping customer work. Finish and verify each stage before starting dependent work. A completed coding task does not satisfy a customer evidence gate. Calendar pressure cannot manufacture evidence. A future request may explicitly revise a gate; record the decision and uncertainty without calling it validated.

Founder direction, 2026-10-03: explicitly defer all engineer-dependent implementation prerequisites and build the most useful software while maintaining this source of truth. Engineer interviews, real-incident reconstruction, comprehension reviews, actual-run representation, pilot capture trials, and engineer workflow validation remain unverified evidence goals, but no longer block implementation. This supersedes the earlier Stage 3 restriction on progressing without a real-team review. The immediate authorized build is Stage 4's useful local record workflow, including manual robot/run entry so it works without a collector. Continue subsequent stages as requested and technically verified; this decision is not a claim of customer validation or blanket authorization to execute the entire roadmap. Privacy, authorization, isolation, ingestion, recovery, truthful claims, and engineer control of robot actions remain required. No simulated feedback may stand in for customer evidence, and human confirmation of an actual resolution remains an evidence requirement rather than an implementation prerequisite.

### Stage 1 — Scope and discovery materials (days 1–14)

Create `docs/product-scope.md`, `docs/customer-discovery.md`, `docs/outreach-messages.md`, and a blank private-tracker template. Derive them from this document rather than introducing another authority. Define customer, buyer, pain, assumptions, exclusions, and measurable pilot criteria. Maintain `docs/build-progress.md`. Customer lead starts introductions; no application features are required here.

Exit: clear scope and interview materials, with the discovery targets in section 5 tracked honestly. The page can proceed alongside conversations; broader product work is guided by shared incidents.

### Stage 2 — Initial outreach page (week 1)

Current headline (founder direction, 2026-09-29): **Know what changed. Keep the setup that worked.** Supporting copy connects grippers, firmware, calibration, policies and teleoperation dataset versions to each test, with an engineer-led reference for recreation. Primary CTA: **Explore the working demo.** Founder contact remains a secondary text link. This supersedes the original outreach-only headline and primary contact CTA.

Include the initial audience, three workflow steps, a clearly labeled synthetic before/after example, and proposed pilot scope. Clearly label planned capabilities. Configure an actual founder contact or scheduling URL; its absence is a precise launch blocker. Do not fake submission success or collect leads without working storage. No invented logos, testimonials, or savings.

Verify mobile accessibility, metadata, links, and production build; document local commands. Prepare a preview with available hosting. When supplied and authorized, publish using the domain/account and verify the live URL and CTA. Keep private routes and customer data outside the initial marketing release. Check current hosting terms/costs when choosing a provider; report missing credentials honestly.

### Stage 3 — Synthetic prototype (weeks 2–3)

Decision, 2026-09-29: the founder explicitly deferred the manually reconstructed real-incident prerequisite to allow Stage 3's synthetic-only prototype now. This permits local prototype work while Stage 2 publication remains outstanding. It does not establish customer evidence, satisfy the engineer-understanding gate below, or authorize customer hosting, Supabase integration, or later stages. Revisit the workflow with a real team before progressing to real-record work.

First manually reconstruct an incident with a team. Build a local robot list, history, run details, and two-run comparison using synthetic fixtures and the contract in section 6. Include a gripper replacement, calibration change, software change, and incomplete record. Mark all demo data synthetic. Test missing-versus-unchanged behavior and deterministic comparisons. Provide a short demo script.

Gate: an engineer understands the comparison without a long explanation and identifies missing information they need.

### Stage 4 — Local real-record representation (weeks 3–4)

Add local JSON import, useful validation errors, a short hardware-change form, revision-preserving corrections, and JSON export. Keep this stage local-only. Test sanitized imports, correction history, exact run revision links, export round trips, semantic comparisons, mismatched conditions, and unavailable evidence. Never commit customer records.

Gate: one team accurately represents two actual runs and their relevant changes.

Implementation decision, 2026-10-03: this engineer-dependent gate is deferred, not passed. Build a development-only loopback workspace with in-memory JSON imports, manual robot/hardware/run entry, append-only field corrections, comparison and JSON export. Keep the public synthetic demo separate and exclude the workspace from production static exports. Explicit file export is the persistence mechanism; private files belong outside the repository. No customer hosting or network upload is introduced.

### Stage 5 — Collector (weeks 4–5)

Implement section 7’s local Python collector. Test dirty repositories, missing files/metadata, deterministic hashes, sensitive-field exclusion, and optional adapter timeouts. Network upload remains deferred.

Gate: a pilot engineer captures and inspects a snapshot using documented commands and can explain what was and was not captured.

Implementation, 2026-10-09: a dependency-free local Python collector reads explicit Git, artifact, settings and versioned manual hardware inputs. It previews metadata, writes new capture files, and attaches runner results to the pre-test snapshot without recollecting. An optional bounded ROS 2 read covers only grip_force in newtons. The workspace appends single captures atomically, preserving existing history and rejecting conflicts or synthetic/real mixing. See docs/collector.md for commands, limits and evidence semantics. Engineer capture trials and live ROS verification remain unverified; no authenticated upload or customer hosting is introduced.

### Stage 6 — Authenticated private beta (weeks 5–7)

Add migrations, persistence, authorization, invitations, scoped ingestion, recovery, and isolation described in section 7. Document environments, migrations, deployment, backup, restoration, export, and deletion. Preserve a separate labeled synthetic demo.

Gate: security/isolation, revocation, ingestion/retry, immutability, and recovery checks pass before customer records are hosted.

Implementation direction, 2026-10-13: the founder requested Prompt 6. Implement the private server separately under `beta/` so the existing public static export and local-only workspace remain distinct. Supabase Auth/Postgres, organization roles, append-only saves, invitation tokens, scoped collector ingestion, export/deletion and recovery documentation are added for staging verification. Initial accounts and organization bootstrap are administrator-assisted; subscription billing and automatic paid activation remain separate work under section 9. Local tests use synthetic data; no customer hosting or live Supabase verification is implied. See docs/private-beta.md and the progress log for exact checks and remaining operational gates.

Local activation direction, 2026-10-16: the founder requested a local Supabase stack for the existing application, preserving data and reusing current migrations and organization permissions. Implement local CLI/configuration, synthetic setup and persistence/isolation verification for the beta server. No paid project, remote deployment, database reset or deletion is authorized. Docker/WSL installation is an outstanding machine prerequisite; code/configuration completion does not establish a running database. See docs/local-supabase.md and progress for results. The root public showcase and file-only workspace remain separate from the database-backed beta.

Hosted activation direction, 2026-10-16: after confirming Docker/WSL is absent, the founder explicitly chose “Connect to my hosted Supabase project.” Use the existing connected project for synthetic activation of the implemented beta, preserve existing data, and verify live persistence and permissions. This supersedes the local-only target for this activation task; local tooling remains available. It does not authorize paid upgrades, customer hosting before operational gates, or completion claims based on schema installation alone. See progress for the selected project, applied migrations and remaining access prerequisites.

Hosted activation verification, 2026-10-18: the local beta now uses the founder-selected hosted Supabase project. Synthetic Auth, save/relogin/reload/export, tenant/viewer isolation, collector retry/revocation and actual browser persistence checks passed. Public signup is disabled. This supersedes earlier live-persistence blockers for this environment only; managed recovery, production hosting/security hardening and customer validation remain outstanding. The file-only workspace remains separate. See docs/hosted-supabase.md and progress for access and exact verification limits.

### Stage 7 — Investigations (weeks 6–8)

Implement baseline selection, grouped evidence-linked changes, missing/stale information, notes, resolution states, and exportable reports. Test baseline suitability, mismatched conditions, inaccessible evidence, and persistence from creation through resolution. Do not deploy changes to robots or label differences root causes automatically.

Gate: engineers can carry an investigation through an evidence-backed resolution or explicitly leave it unresolved.

Implementation direction, 2026-10-16: the founder explicitly requested original Prompt 7, not B7. Implement the investigation workflow on the current local/beta record model: engineer-selected baselines, grouped evidence, append-only notes/states and portable reports. This authorizes independent Stage 7 software work while B1 live staging remains blocked; it does not waive authorization/isolation/recovery requirements or implement B7's client portal/project permissions. Preserve the existing storage bounds pending separately requested B2. See docs/investigations.md and progress for actual checks and deployment limitations.

### Stage 8 — Measured four-week pilot (weeks 7–10)

Implementation direction, 2026-10-19: the founder requested original Prompt 8. Add an owner-only, organization-scoped pilot dashboard, opt-in activity measurements, append-only weekly reviews and an exportable summary alongside the four-week operating guide. Track only metadata about activity, preserve unknown measurements and separate founder assistance from independent use. The initial implementation supports one immutable 28-day plan per organization. This is software preparation, not authorization to run a customer pilot, send outreach, charge or claim customer value. See docs/pilot-guide.md and progress for verification and migration activation status.

Activation, 2026-10-20: resumed the existing implementation and installed the missing additive pilot migration on the selected hosted synthetic target. Actual Auth/database checks verified metadata activity, collector retries/failures, review history, relogin/export and owner/tenant isolation. Future weeks remain unobserved rather than measured zero. These are synthetic technical checks; real adoption, buyer response, willingness to pay and managed recovery remain unverified.

Create an onboarding checklist, supported scope, customer responsibilities, baseline worksheet, weekly review agenda, negotiated success criteria, pricing hypothesis, and end-of-pilot decision. Add a simple internal dashboard, support-time tracking, and exportable results summary.

Instrument first snapshot, first comparison, weekly active organizations, and successful/failed ingestion without configuration contents. Coverage is known only when the test runner supplies the expected eligible-run count; otherwise show unknown. Separate measured results from estimates and founder assistance from independent usage. Do not fabricate results, send messages, or charge customers as part of implementation.

Gate: evaluate real adoption, value, support effort, buyer response, and willingness to pay using section 9.

### Stage 9 — Product launch (weeks 9–12)

Preparation, 2026-10-20: the founder requested original Prompt 9. Added a public synthetic walkthrough and supported-input description, corrected capability/data-handling copy, prepared a release gate register and rollback procedure, and drafted unsent launch messages. The static candidate passed its production build and browser assertions. No host/final origin is supplied; public deployment, managed recovery and production operational checks remain outstanding. This is release preparation, not a completed launch or customer validation. See docs/launch-readiness.md and progress for artifact identity and precise checks. No later stage is authorized by this preparation.

Review completed pilot evidence; describe only working capabilities. Publish a walkthrough, supported inputs, pilot offer, actual founder contact, and approved customer evidence if available. A labeled synthetic demo is acceptable when customer evidence cannot be shared.

Checklist: production build, authentication, organization isolation, collector revocation, error monitoring, tested backup restoration, mobile accessibility, CTA, metadata, domain/TLS, actual data handling, separate environments, demo isolation, and rollback steps. Use supplied hosting/domain configuration for the agreed release. Verify sign in → capture → upload → compare → export → sign out. Report live URL, release version, checks, and precise blockers/limitations.

Draft but do not send a personal launch message to interviewees and introducers. Launch first to participants; seek one relevant introduction from engaged users. Share only in communities where participation and posting rules support it. Track qualified conversations, activation, paid conversion, and retention; page visits alone do not establish demand.

### Stage 10 — One justified advanced capability (after repeated paid use)

Validation preparation, 2026-10-20: on the founder's request to begin original Prompt 10, reviewed the available progress and pilot evidence. No verified repeated paid use or customer-request evidence is supplied here. Followed this stage's explicit no-evidence branch with docs/advanced-capability-validation.md: candidate inventory, measurement protocol, selection/stop criteria and a blank private decision record. No advanced capability was selected or implemented; this does not change the October 3 implementation deferral or pass customer/hosting gates.

Scope exception, 2026-09-29: the founder requested a compatibility page immediately during Stage 3. Build a synthetic-only registry preview with explicit scope, author, version, evidence limitations, and known-bad example combinations. No-match means not assessed, never safe. Actual compatibility rules still require repeatable evidence, and customer-facing automated compatibility enforcement remains gated. This exception does not authorize robot deployment, real customer ingestion, or other advanced capabilities.

Review actual requests, usage, feedback, support effort, frequency, value, cost, and evidence strength. If evidence is absent, write a validation plan. Otherwise build the smallest useful version of one capability:

| Capability | Required evidence/guardrail |
| --- | --- |
| Git/recording-tool integrations | Multiple paying teams repeatedly request the same connection |
| Richer hardware replacement history | Swaps repeatedly explain missing context; basic manual changes already exist |
| Drift alerts | Customers struggle to align equivalent robots; require explicit baseline and deduplication |
| Compatibility rules | Repeatable confirmed constraints; require scope, evidence, author, version |
| AI investigation summaries | Reliable records and measurable time savings; cite evidence, separate facts/hypotheses, enforce isolation, evaluate reviewed cases |
| Enterprise controls/private hosting | A qualified purchase depends on them |

Measure adoption and false positives where applicable. Document evidence needed for further investment. No causation inference solely from a difference.

## 9. Pilot offer, pricing, and success

Founder preference, 2026-10-12: retain the public synthetic demo and a request-demo/call sales path, with subscription payment granting access to the private working product. Minimize routine founder/team effort through automated account/workspace activation and guided onboarding. This is desired commercial/access direction, not an implemented paywall, confirmed subscription price, authorization to charge customers or permission to host customer records before Stage 6 controls pass. Detailed billing provider, grace/retention policies and self-service eligibility remain design decisions; the proposed pilot below remains a pricing hypothesis.

Offer hypothesis: “We’ll connect one test workflow for up to five robots, record configuration snapshots, and help your engineers compare regressions over four weeks.” Agree on the engineer, buyer, setup responsibilities, supported inputs, and success criteria before starting.

Negotiable targets, not existing performance:

- At least 90% of eligible runs receive a snapshot, when the denominator is known.
- Missing required information is visible.
- Recording a hardware change takes under one minute.
- Reconstruction time falls materially against a recorded customer baseline; negotiate the threshold.
- Engineers use the workflow without repeated founder reminders.

Measure reconstruction time separately from total debugging time. Record baseline method, observed timings, sample counts, assistance, support time, and limitations. A fixed-fee four-week pilot of approximately $1,000 is a pricing hypothesis. Discuss a potential ongoing subscription before starting; no ongoing price has been validated. A free design partnership needs a defined end date and otherwise unavailable access/feedback.

At the end, decide whether to continue paid, revise scope/value/pricing, or stop. If teams like demos but do not use the product, investigate workflow fit before adding features. If they use it but will not pay, revisit urgency, buyer, scope, and pricing.

## 10. Current truth, decisions, and maintenance

Integration sequencing, 2026-10-30: the founder explicitly deferred completing Onshape OAuth/API activation until an HTTPS beta deployment is ready and requested resuming independent backend prompts. The existing Onshape connector remains implemented with simulated-provider checks only; account ownership and draft OAuth settings do not establish a live integration. Continue independent stages in dependency order, recording ROS/hardware, provider, recovery and deployment acceptance separately. This supersedes the temporary request to pause implementation until Onshape is connected; customer-hosting and physical-execution gates remain unchanged.

Brand direction, 2026-10-29: the founder selected Tavrik to replace UNIFY across product branding and maintained documentation after reviewing existing-name search findings. This supersedes the October 5 instruction to retain the former identity. Use Tavrik in visible copy, metadata and new download names. Preserve legacy protocol/format identifiers, credentials, provider-operation markers and historical records for compatibility; this is not a data migration, domain acquisition, provider-console rename or public release. No trademark or domain clearance is claimed. Product scope and evidence gates are unchanged.

Backend continuation direction, 2026-10-24: the founder explicitly requested finishing B5, then proceeding through B6 and subsequent numbered backend prompts in dependency order. This authorizes their implementation and technical verification without a separate request for each stage; it does not bypass stage prerequisites or authorize invented provider credentials, paid services, external messages, customer data hosting, unsupervised physical execution or public release without the required target/access and evidence gates. Complete independent work and record exact external blockers when integrations, recovery environments or supervised hardware are unavailable. Keep predictions unavailable until their real-data evaluation gates pass. See docs/backend-master-prompts.md and docs/build-progress.md for scope and actual results.

Account-access direction, 2026-10-18: the founder requested user-friendly account creation, user-chosen passwords and easy sign-in alongside a no-sign-in demo. Implement email registration/confirmation, recovery/change and clear invitation onboarding in the existing beta. This supersedes administrator-only password setup as the intended flow. Registration must not grant organization access automatically; preserve verified-email ownership, invitations, tenant isolation and customer-hosting gates. Provider signup/redirect/email-delivery configuration and actual user verification remain distinct from implemented screens. No billing, Google OAuth, paid email service or public deployment is implied.

Planning direction, 2026-10-15: the founder requested a staged backend expansion after Prompt 6: Google authentication; developer organizations with teams serving multiple clients; restricted client login plus JSON report API and automatic webhooks; CAD and physical-robot integrations supporting reads, explicit writes and controlled job requests; and separately evaluated risk, duration, quality and maintenance predictions that remain unavailable without suitable real data. Physical robots are the priority; AI-agent support is a later extension. This revises earlier fleet-control/model-training/broad-connector exclusions for the proposed staged roadmap, not for an immediate implementation or launch. Preserve local controller safety authority, explicit permissions, immutable evidence and advisory predictions. The current task is inspection and a prompt pack, not execution of these future stages. Initial integration choices are research-informed hypotheses (generic API, ROS 2, Universal Robots, Onshape, then SOLIDWORKS/PDM), not market-share or working-integration claims. First verify the existing beta's live persistence; replacing bounded whole-workspace storage is necessary before adopting the larger proposed run-volume target. See the October 15 progress entry for inspected configuration and the delivered plan location.

Stage 5 update, 2026-10-09: the local collector and workspace capture handoff are now implemented as described above. This supersedes the collector-unimplemented statement in the dated October 3 accounting below. Subsequent shared hosting and ingestion remain gated on Stage 6 controls; customer validation remains absent.

About navigation update, 2026-10-06: the founder requested mission, goal and founder contact together under About in the top navigation. About now contains those three sections and direct configured contact links. Homepage/footer founder links point to /about/#founders; /contact/ remains a supported URL. This reorganizes website content without changing business scope or evidence status.

Website direction, 2026-10-06: the founder requested a spacious luxury redesign with cinematic scroll motion and real Home, Services, Sectors, About, and Contact URLs. Keep Home a five-section gateway with a compact engine-derived synthetic comparison; move the full interactive comparison, configuration exploration, and proposed pricing to dedicated service pages. This supersedes the earlier homepage-heavy presentation requirement, not the comparison promise. Services describe the implemented local workflows and explicitly proposed pilot, not an invented consultancy catalog. Sectors focuses on intended commercial robotic manipulation applications; no established deployments or broader industry claims are implied. About uses only supplied business and people information. Contact retains configured founder destinations without simulated submission. Preserve local workspace entry, synthetic labels, reduced-motion access, and all privacy, hosting, and customer-evidence gates.

Product-entry direction, 2026-10-05: the founder clarified that this is the real product and robot creation must be accessible from the interface they use. Prioritize the working record workspace in local navigation and the main CTA, give the example viewer a direct path to add robots, and make creation visible without a hidden sidebar disclosure. `/workspace/` is the main local product entry; `/local/` remains a supported bookmark. This supersedes the demo-first CTA for local use. The public static output continues to contain only synthetic examples until hosting controls are implemented and verified. Sample records remain labeled synthetic; current file-export persistence and missing cloud/robot connections must remain accurately described. This task fixes access to Stage 4 functionality, not the entire remaining roadmap.

Visual direction, 2026-10-05: the founder requested a simpler Resend-inspired presentation while preserving all existing functions. Use a restrained dark palette, clear spacing and focused workspace views. Keep UNIFY's identity, record semantics, synthetic/evidence labels and release boundaries. This changes presentation, not product scope or customer-validation status.

As of 2026-10-03, Stage 1 materials, the local Stage 2 homepage, Stage 3 synthetic comparison prototype, and Stage 4 local record workspace are implemented. The homepage uses the actual comparison engine. The prototype includes robot/run history, exact snapshot references, provenance, comparison warnings, a working-setup reference/checklist, and a synthetic compatibility registry. The development-only workspace adds bounded JSON import/export, manual robot/hardware/run entry and append-only field corrections while preserving historical run references. Records remain in tab memory until explicit file export; no private records were supplied or committed. A security page separates current behavior from planned controls; proposed pricing is USD 1,000 for four weeks. No customer accounts, Supabase connection, network ingestion, collector, persistent investigations, or robot deployment exist. The founder deferred all engineer-dependent implementation prerequisites on 2026-10-03; customer evidence remains unverified, and privacy/security/hosting requirements remain in force. No verified customers, interviews, shared incidents, pilots, paid conversions, savings, certifications, integrations, or public deployments are recorded. Both supplied founder emails remain configured. Netlify sign-in was previously observed, but publication did not complete; the final public origin remains unset. See docs/build-progress.md for actual checks and blockers, and docs/local-records.md for usage and format limits.

This file is the canonical business brief. `AGENTS.md` governs how agents apply it. `docs/build-progress.md` records what actually happened, evidence gates, validation, and next steps. Supporting scope and implementation documents must link here and remain consistent.

Read this document in full before building. For each task, explain its connection to the promise, current stage, applicable evidence, boundaries, and verification. Distinguish planned, implemented, verified, and customer-validated states. Update progress after every task. Update this brief when the founder’s direction or credible evidence changes the business assumptions; record the date, reason, and source without including private records. Do not silently turn a hypothesis into fact or expand scope to match implementation convenience.
