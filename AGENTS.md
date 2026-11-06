# Repository instructions

## Mandatory context before implementation

Before planning or editing application code, schema, infrastructure, UI, integrations, or product copy, complete the following read-only preflight. Do not run builds, scaffolding, generators, dependency installs, migrations, or file-changing commands until the context has been read and the plan presented:

1. Read **all of [build.md](build.md)**, not just the relevant stage or a prior summary. Repeat on a new task or after context loss when the full brief is no longer available.
2. Read [docs/build-progress.md](docs/build-progress.md), applicable nested instructions, and relevant supporting documents. If the canonical brief or progress log is missing or unreadable, stop dependent implementation and report the missing context; do not invent it.
3. Inspect the current repository, working changes, dependencies, tests, and affected behavior. Preserve unrelated work. Do not assume Git or a stack exists.
4. State a concise understanding in the conversation: business promise, intended user, current stage, task’s contribution, relevant constraints, and evidence gate status. Cite concrete sections of `build.md` and identify assumptions.
5. Present a reviewable implementation plan and verification criteria before edits. Use the installed `plan-before-edit` skill when available. Its currently known path is `C:/Users/carte/.codex/skills/plan-before-edit/SKILL.md`; discover its current location if moved. If unavailable, follow the equivalent process in this file and disclose that limitation.

Read the full business brief for documentation and review tasks too. Scale investigation to the task. These instructions require context and a plan, not repeated approval for already authorized work. Ask only for genuinely blocking missing decisions. The roadmap is not authorization to execute all stages; perform the requested stage and preserve the evidence gates.

## Numbered backend prompts and pre-edit review

When the user says **Start prompt B1** (or B2 through B13), read [docs/backend-master-prompts.md](docs/backend-master-prompts.md), including its master context and the selected stage. Use [docs/build-progress.md](docs/build-progress.md) to resume completed/partial work rather than rebuilding it. These are conversation instructions, not shell commands. Execute only the requested stage; inspect prerequisite evidence and report blockers before dependent implementation. Do not automatically proceed to the next stage.

Before any edits, use `plan-before-edit` for the context inspection and plan above. Also read the installed `review-agent` skill and perform a separate read-only pre-edit review of the existing affected behavior and proposed plan for correctness, privacy, evidence semantics, dependencies and scope. Report concerns and resolve blocking ones before implementation. Label this as a pre-edit review; it cannot establish that unwritten changes pass review. The completed changes still require the separate read-only review below, targeted verification of fixes and an updated progress log. These steps do not add a repeated approval requirement to already authorized work.

## Product invariants

- Core promise: see recorded changes between a successful robot test and its latest failure. The shared record serves comparison and investigation.
- Start with commercial ROS 2 manipulation teams; broader platform ambitions do not expand the MVP automatically.
- Differences are not causes. Never present an automatic causal diagnosis or automatically deploy/roll back robot changes.
- Preserve immutable snapshot revisions and exact run references. Corrections append history with author, reason, and prior revision.
- Distinguish known, unknown, not-applicable, and the comparison result unchanged. Missing evidence never proves sameness.
- Preserve provenance and distinct observed/recorded times. Manual hardware reports must remain visibly manual; highlight stale confirmations.
- Baseline suggestions require comparable procedures/conditions and an explanation; preserve engineer choice.
- Treat customer claims, pricing, targets, competitor context, and moats as hypotheses until supported. Label synthetic demonstrations and planned capabilities.
- Keep real customer records, populated prospect trackers, credentials, and private evidence out of version control and public assets. Prefer storage outside the repository for prospect/customer research. Before any local private storage is introduced, configure exclusions and verify what is tracked; ignore rules do not remove already tracked data.
- Upload only approved metadata/references, never raw source, weights, datasets, recordings, or secrets. Maintain organization boundaries and field allowlists.
- No customer hosting before authorization, isolation, ingestion, and recovery gates pass. No launch claim without actual verification.
- Do not send outreach, charge customers, invent evidence, or imply available hosting/access. Drafts and plans do not authorize external communication.

## Review before declaring completion

Use the installed **review-agent** skill for a separate read-only review pass over the completed task. Its currently known path is `C:/Users/carte/.codex/skills/.system/review-agent/SKILL.md`; read the skill and follow its instructions. If moved, locate it. If unavailable, report that fact and perform the equivalent defect-first review without claiming the skill ran.

Review the full changed scope against this file and `build.md`, not merely syntax. Inspect the complete diff where Git exists; otherwise inspect the complete new/changed files and disclose the absence of a Git diff. Check concrete correctness, privacy, evidence semantics, scope, and maintainability issues. For documentation-only work, check consistency, links, omitted requirements, and unsupported claims; do not invent application test results.

The review pass is read-only. Report actionable findings by severity with file/line references, or “No findings.” End the review pass before making fixes; then perform targeted verification and review the corrections. Do not delegate unless explicitly authorized by the user or applicable instructions. Review does not replace tests or customer evidence gates.

## Completion and source-of-truth maintenance

Update `docs/build-progress.md` after every task with scope, delivered files/behavior, checks and results, review outcome, evidence status, blockers, and next action. Separate implemented, verified, and customer-validated states.

`build.md` owns business direction; supporting documents elaborate it without replacing it. Record material decisions and evidence-based changes there and in progress. Never silently rewrite direction to justify a feature. New explicit user direction can revise this brief; surface conflicts and record the change.

Final responses state what changed, what was checked, and material remaining limitations. Never claim these instructions technically prevent all future agents from skipping context: they are a required repository workflow, not an execution lock.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
