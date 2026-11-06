# Customer discovery guide

Status: Stage 1 interview materials, prepared 2026-09-26. No interviews or customer evidence have been supplied or verified.

Current-use note, October 20: the software now includes local capture/comparison and a hosted synthetic private beta. Use [build progress](build-progress.md) for implemented capabilities and outstanding launch gates. Engineer-dependent implementation prerequisites were deferred on October 3; discovery remains an unverified evidence goal, not a reason to describe implemented software as merely planned.

Authority: [build.md](../build.md), sections 2, 4–6, 8–9. Use with [product scope](product-scope.md), [outreach drafts](outreach-messages.md), and the [private tracker template](private-tracker-template.md). Keep delivery status in [build progress](build-progress.md).

## Objective and ownership

Find out whether commercial manipulation engineers repeatedly struggle to reconstruct changes between successful and failed tests, where current tools fall short, and whether a buyer will support a measured trial. The immediate milestone is two teams willing to share a real regression and test comparison.

Assign a customer-conversation lead and a development lead; both review evidence and gates. Names and kickoff date are not supplied. The days 1–14 window in the brief is relative to kickoff, not a deadline already in progress.

Identify 20 well-matched companies and a credible route to each. Prioritize introductions through colleagues, classmates, professors, founders, suppliers' applications engineers, integrators, consultants, incubators, and alumni. Directory membership alone is not a warm connection. Record fit as a hypothesis until confirmed by a relevant engineer.

## Prepare each conversation

- Select a robotics, integration, or test engineer who owns troubleshooting; learn who owns budget separately.
- Ask for a recent concrete regression and, only if authorized by the team, a sanitized example. A discussion can proceed without receiving files.
- Explain that this is research around implemented comparison/capture software whose customer value is unverified. Describe only capabilities verified in the current progress log; do not imply public customer access, unsupported integrations or measured savings.
- Agree what can be noted, shared, or retained; obtain permission before recording a conversation. Keep private notes outside this repository and public assets.
- Avoid collecting credentials, raw code, model weights, datasets, or recordings. Use approved references or descriptions and explicitly record unavailable evidence.

## Twenty-minute interview

| Time | Purpose | Questions |
| --- | --- | --- |
| 0–2 minutes | Establish responsibility and context | What do you test? What is your role when a run starts failing? |
| 2–8 minutes | Reconstruct a recent incident | Walk through the last time a successful test started failing. Which robot and procedure? What happened first? How did you reconstruct the configuration? |
| 8–12 minutes | Understand gaps and existing tools | What information was missing, where was it, and who had it? What do your existing tools already handle? Can you show or describe the reconstruction steps? |
| 12–16 minutes | Assess recurring cost | How often does this happen, over what period? How much engineer time went into reconstruction versus diagnosis or retesting? Are these measured timings or estimates? |
| 16–18 minutes | Establish buyer and constraints | Who decides whether to pay? What would have to improve? What data, installation, or access restrictions would apply? |
| 18–20 minutes | Agree a concrete next step | Can we map a sanitized example together? Who can provide the records, by when? Would you test a comparison of those actual runs? |

Follow the incident rather than forcing every question. Avoid leading with a demo or relying on “Would you use this?” A positive opinion is not a shared example, pilot commitment, or paid conversion. Ask about current alternatives without asserting unverified competitor limitations.

## Private interview note template

Copy this blank structure to an approved private location outside the repository before filling it in:

- Conversation ID/date, note author, participant role, company reference:
- Permission and limits on recording, retention, sharing, and follow-up:
- Robot/test workflow and fit with the initial niche:
- Recent incident and when it occurred:
- Reconstruction steps, tools, people, and missing information:
- Frequency and observation period; measured or estimated:
- Reconstruction time, total debugging time, sample count, assistance, and limitations:
- Existing tools that already solve the problem:
- Exact statements versus interviewer interpretation:
- Buyer, decision process, constraints, and willingness-to-pay evidence:
- Agreed next action, owner, date, and authorized contact route:
- Private evidence reference and current evidence status:
- Contradictions, unknowns, and reasons the hypothesis may be wrong:

## Two-run incident worksheet

Use only sanitized, permitted information in a private working copy. A manually reconstructed worksheet is discovery evidence, not an implemented product or automatically verified snapshot.

| Field | Successful run | Failed run |
| --- | --- | --- |
| Run reference and robot identifier | | |
| Run time and outcome, including units | | |
| Procedure/version, task/object, and conditions | | |
| Hardware component identities/revisions | | |
| Hardware reporter and last-confirmed time | | |
| Software commit, dirty status, optional build digest | | |
| Model version/hash, or explicit unknown/not-applicable | | |
| Dataset identity/version/reference, or explicit unknown/not-applicable | | |
| Calibration versions/hashes and selected settings | | |
| Source, collection method, observed time, and recorded time | | |
| Approved evidence references and access limitations | | |

For each relevant field use known, unknown, or not-applicable; never interpret two blanks as unchanged. Preserve manual reporting and stale confirmations visibly. Note why these runs are or are not comparable. The engineer chooses the baseline; the latest success alone is insufficient.

After mapping, record observed changes separately from hypotheses. Record what evidence would distinguish explanations. Only describe a resolution as confirmed-by-engineer when an evidence note or retest reference supports it; unresolved is a valid outcome. Preserve original notes and append dated corrections rather than rewriting what was originally reported.

Return a sanitized timeline or worksheet only through an authorized channel. Explain missing context without claiming an automatic diagnosis. Ask whether the engineer understands the comparison and what information is still needed.

## Discovery targets and evidence status

These are working targets from build.md section 5. Counts below mean evidence verified in this workspace, not a claim that no external activity has occurred. Actual external activity is unknown until supplied.

| Measure | Target | Verified here | Counting rule |
| --- | --- | --- | --- |
| Candidate companies with fit and a route | 20 | 0 supplied | Unique company with recorded fit rationale and credible connection route |
| Relevant conversations | Approximately 8 | 0 supplied | Completed conversation about the target workflow, with dated notes; record unique teams separately |
| Teams with recurring pain | 3 | 0 supplied | Distinct team with a recent incident plus recurrence/frequency evidence |
| Teams willing to test actual records | 2 | 0 supplied | Distinct team explicitly agrees to test and identifies actual records and a next action; receipt of records is tracked separately |
| Teams sharing a real regression and agreeing to comparison | 2; immediate milestone | 0 supplied | Actual permitted incident evidence received and comparison commitment recorded |

Keep the funnel separate: introductions requested → introductions made → conversations → shared examples → pilots → paid customers. Count real events, not messages drafted or assumptions. A pilot discussion is not a started pilot; willingness to pay is not payment.

## Review and decisions

After each conversation, update the private tracker and evidence notes. At a joint review, compare supporting and contradicting evidence, recurring gaps, access constraints, buyer response, and outstanding actions. Update public project progress only with non-sensitive aggregate status; omit identities, private links, and customer configuration.

If conversations yield no actual examples, revisit the problem or niche. Do not lower evidence standards merely to meet the estimated schedule. The founder deferred engineer-dependent implementation prerequisites on October 3; the implemented synthetic comparison is not evidence of a real incident. Manually reconstruct an actual permitted incident to assess value, and record that evidence separately from software completion.

Before offering a pilot, use the measurements in [product scope](product-scope.md): coverage with a known denominator, visible missing information, hardware-update time, reconstruction-time baseline, independent use, support effort, and buyer decision. Agree thresholds and responsibilities. Approximately $1,000 for four weeks is an unvalidated price hypothesis, not an accepted offer or authorization to charge.
