# Original Prompt 10 — advanced-capability validation

Authority: [build.md](../build.md), sections 1–7, Stage 10 and section 9. Prepared October 20, 2026. This is the original product roadmap's Prompt 10, not backend prompt B10.

## Decision and evidence available

**No advanced capability is selected for implementation.** Stage 10 explicitly directs a validation plan when evidence is absent. The October 3 deferral permits useful software work without engineer interviews; it does not turn synthetic tests into evidence that a particular advanced capability merits investment. This task follows Stage 10's no-evidence branch without changing that direction.

The [progress log](build-progress.md) records implemented local capture, comparison, investigations, hosted synthetic isolation/persistence and pilot measurements. The [pilot guide](pilot-guide.md) defines how to measure actual use. No verified repeated paid use, customer feature requests, measured customer benefit or support-cost evidence has been supplied here. External activity remains unknown until supplied; this is not a claim that no conversations have occurred elsewhere. A synthetic technical rehearsal and a proposed “continue paid” decision are not paid adoption.

Prompt 9 produced release materials; publication and private operating gates remain open in [launch readiness](launch-readiness.md). Research conversations can be planned independently. Any customer-hosted trial must first satisfy those operational gates. No outreach, trial enrollment, private storage, payment or robot action is initiated by this document.

## Candidate inventory

These are the candidates already named in the brief, not a ranked roadmap. Existing foundations do not establish demand for extensions.

| Candidate | Existing foundation | Evidence needed before selection | Smallest evaluation if justified |
| --- | --- | --- | --- |
| Git or recording-tool integration | Explicit Git metadata capture and approved evidence references | Multiple paying teams repeatedly request the same connection; dated workflow examples show what manual capture cannot solve | One read-only metadata handoff for that connection, with explicit field approval, exact revisions and revocation; no raw recordings or source upload |
| Richer hardware replacement history | Manual hardware reports, confirmation times and append-only snapshot corrections | Repeated swaps leave material context missing despite current records; engineers identify the precise missing relationship | One component's replacement timeline linked to existing revisions; manual provenance stays visible |
| Drift alerts | Engineer-selected baseline comparison and missing/stale evidence | Teams repeatedly struggle to align equivalent robots; they can define equivalence, an explicit baseline and useful notification timing | One opt-in comparison scope with baseline revision, deduplication and unknown-data handling; no robot changes |
| Compatibility rules | Invented rule in lib/demo/compatibility.ts; no real rule evidence | Repeatable confirmed constraints with procedure/conditions, author, revision, evidence and permission to use them | One scoped advisory rule with positive, negative and incomplete cases; no match remains not assessed, never safe |
| AI investigation summaries | Evidence-linked investigation notes, states and exported reports | Reliable records and engineer-reviewed cases demonstrate a repeatable summarization burden and measurable potential time benefit | One draft summary evaluated against the existing report; every factual claim cites exact evidence; hypotheses remain explicit; no automatic confirmation |
| Enterprise controls or private hosting | Organization roles and synthetic isolation checks | A qualified purchase depends on a specific control or hosting requirement, confirmed by the buyer and technical/security stakeholder | A written acceptance test for that requirement and smallest bounded implementation; ordinary required security/recovery work is not an optional paid feature |

## Validation sequence and ownership

Assign a customer-conversation lead and a development lead before beginning field work; names and dates are not supplied. They jointly own the selection decision. Use the existing [discovery guide](customer-discovery.md) and [blank private tracker](private-tracker-template.md), with current capability status from the progress log. Older discovery documents describe their preparation-time state; the canonical brief owns later deferrals and implementation status.

1. **Collect an actual problem, before proposing a feature.** The conversation lead records a recent incident, current workaround, frequency over a stated interval, affected role and what existing tools already solve. Ask what decision was delayed by missing context and whether current Tavrik functionality already covers it. Record direct statements separately from interpretation. Seek contradicting examples too.
2. **Establish recurrence and commercial context.** Review distinct teams, repeated uses/requests, buyer involvement and verified paid status separately. Keep source/date and verification method. One team making five requests is one team. A demo view, free trial, proposal or payment intent is not verified paid use. Do not process payment as part of research.
3. **Measure the current workflow.** Agree comparable tasks and start/stop rules before observation. Measure reconstruction or summary effort separately from debugging and retesting. Record sample counts, independent versus assisted sessions, missing evidence, setup/support minutes and estimates separately from measured observations. Use the pilot's independent eligible-run denominator where capture coverage is relevant; ingestion attempts are not a substitute.
4. **Define a bounded candidate evaluation.** The development lead records the smallest proposed behavior, dependencies, supported metadata, permission model, build/maintenance/support cost estimates and uncertainty. Agree success criteria and false-positive tolerance with the engineer before reviewing results. Any prototype requiring code, external access or customer data needs its own scoped implementation request and preflight; this plan is not authorization to execute all candidates.
5. **Evaluate against the current workflow.** Use approved cases with exact run/snapshot references. Keep evaluation cases separate from examples used to design a rule or prompt. Record outcomes, omissions, unsupported claims, usefulness, review time and support burden. Where feasible, vary task order to expose learning effects. Small observational samples do not establish causation or general reliability.
6. **Choose one, defer or stop.** Both leads review supporting and contradicting evidence. Select at most one candidate that meets its brief-specific evidence requirement, addresses a recurring gap and has an acceptable cost/permission/test plan. Unknown evidence cannot count as a passed criterion. If none qualifies, improve the core workflow or continue discovery; do not choose a feature to fill the roadmap. Record the next evidence question, owner and review trigger.

Review after each real pilot's end decision or when a new recurring request is substantiated. There is no invented calendar deadline or claim that a review has happened.

## Measurement and acceptance contract

Agree numerical targets privately before any evaluation; no universal acceptance threshold or existing result is asserted here. Keep the following definitions consistent across baseline and candidate:

| Measure | Counting rule and interpretation |
| --- | --- |
| Independent adoption | Unique authorized teams/users completing the agreed task, and repeat use over a stated period; report reminders and assisted use separately |
| Effort/value | Observed active minutes per comparable task, sample count and method; retain distributions and outliers, not only an average; record buyer interpretation separately |
| Alert/rule false positives | Engineer-reviewed incorrect alerts divided by reviewed alerts, with unreviewed alerts separately unknown; no reviewed alerts means no rate |
| Missed cases | Independently labeled relevant cases that were missed, divided by labeled relevant cases; absence of reports does not establish no misses |
| Summary quality | Unsupported factual claims, omitted material evidence, citation correctness and engineer correction time on held-out cases; do not present generated hypotheses as confirmed causes |
| Operating cost | Observed support/setup time, estimated implementation/maintenance effort and any actual provider costs, each labeled and dated; no fabricated price or savings |
| Commercial evidence | Buyer requirement/decision and verified payment/use references recorded separately; intent and willingness to pay remain distinct from payment |

Technical acceptance for any later implementation must cover exact historical references, immutable corrections, known/unknown/not-applicable handling, manual/stale provenance, authorization and tenant isolation where applicable, export fidelity and failure behavior. Integrations additionally need replay/idempotency, revocation and bounded input checks. Alerts need baseline changes, duplicate suppression and incomplete-evidence cases. Compatibility needs scope mismatch and unavailable evidence. Summaries need inaccessible evidence, conflicting notes and malicious instructions in source material. No feature can automatically deploy, roll back or diagnose a robot based only on differences.

Stop or revise an evaluation if the current product already solves the gap, independent use does not recur, benefit disappears after accounting for assistance, review burden exceeds benefit, required evidence/permissions are unavailable, or a safety/privacy invariant cannot be met. A failed experiment is recorded honestly rather than changing acceptance criteria afterward.

## Blank decision record — populate only in approved private storage

Copy this structure outside the repository before adding customer information. No private storage is created here. Store only permitted metadata/references, restrict access and record retention/sharing consent. Keep credentials, raw code, weights, datasets and recordings out. Publish only approved non-sensitive aggregate findings in the progress log; do not commit private evidence links or identifiable business notes.

- Review date, customer-conversation lead, development lead:
- Candidate and precise recurring problem:
- Existing workflow/alternative and why it is insufficient:
- Distinct teams, request dates, repeat-use period and verified paid-use evidence:
- Supporting evidence, contradictions and permissions (private references):
- Comparable task/baseline, sample count and observation method:
- Independent/assisted/unknown use and setup/support effort:
- Pre-agreed success criteria, false-positive tolerance and stop conditions:
- Smallest proposed scope, exclusions, dependencies and technical checks:
- Implementation/maintenance/support cost, method and uncertainty:
- Evaluation results, omissions, false positives/misses and limitations:
- Buyer response and commercial evidence, separate from product telemetry:
- Decision: select one / defer / stop, rationale and reviewers:
- Next evidence question or scoped implementation request, owner and review trigger:
- Corrections: date, author, reason and prior decision reference:

Keep original decisions and append corrections. A blank record means not assessed. Completion of this plan establishes preparation only; it does not pass customer validation, launch readiness or an advanced-feature acceptance gate.
