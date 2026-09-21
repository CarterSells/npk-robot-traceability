# npk ventures — project handoff

Version control for the physical world: a multi-layer version-control and lineage platform for robotics.

## One-liner

Git tracks code. This tracks what changes do to the real world.

## Status as of Sep 17, 2026

Plan document is complete and circulating among the founding group (forwarded by Thomas Kelley, cc Carson Pine). No code written yet. This is a candidate startup direction being weighed against other ideas.

## The problem

Robot builders split their work across four disconnected tools with no shared history:

- Hardware: CAD/PCB in Onshape, SolidWorks, KiCad, Altium
- Software: firmware in GitHub
- Data: recordings in S3, Drive, Hugging Face
- Models: checkpoints in Weights & Biases or loose folders

Three failures follow: no lineage (can't trace which hardware revision trained which model), silent mismatches (a hardware change breaks firmware or invalidates data with no warning), and drift (physical robots diverge from the repo as parts get swapped in the field).

## Why now

Robot learning has moved from research labs into startups. Low-cost arms and open models have multiplied the number of teams building hardware. Fleets are growing, so rollback and incident history start to matter. Traceability requirements are also coming from regulators and insurers.

## Core insight

Software version control tracks files. Robotics needs version control that tracks cause and effect: what changed, what it touches downstream, and what happened when it ran on a real machine.

## Product architecture

Four pieces, per Rikhin Kavuru's breakdown:

1. **Web app** — the main product, and the repo host itself. Hardware companies store their repositories directly in the platform, not on GitHub. Review changes, visual diffs, lineage, fleet status. No install.
2. **CLI** — `commit`, `status`, and similar commands, for daily engineer workflow and CI pipelines.
3. **Robot agent** — runs on each robot (usually Linux), reports real physical state back to the platform.
4. **Plugins** — for CAD tools (Onshape, SolidWorks) and robotics software (ROS), so engineers don't leave their existing tools.

Three concepts hold the product together: one repo spans all four layers; the robot itself is the working tree (`status` shows which units have drifted from the repo); every change shows its downstream consequences before merge.

## MVP scope (months 0–4)

- Multi-layer repos with large-file support
- Automatic cross-layer lineage
- Consistency checks for a few common mismatch types
- On-robot agent for one platform (ROS 2 or LeRobot)
- Visual diffs for STEP files and KiCad

Demo target: a PR changes a motor mount, CI flags that firmware and two trained policies no longer match, and the dashboard shows which lab robots are still running the old config.

## Customers and go-to-market

First: robotics startups, 5–50 engineers, building their own hardware and training their own policies. Next: university robot-learning labs on free or discounted plans. Later: fleet operators and regulated industries (medical, industrial, defense).

GTM sequence: interview 20–30 robotics teams, recruit 3–5 design partners and ship weekly, open-source the CLI/repo format/embodiment hash to build trust, integrate with LeRobot and ROS, convert design partners to paid, then expand to fleet pricing.

## Business model

Free (public OSS) → per-seat team plans → per-robot fleet pricing → usage-based (storage, CI, physical test runs) → enterprise (self-hosting, audit, compliance). Fleet pricing is the long-term lever: revenue scales with deployed robots, not headcount, but it's a months-9-to-18 concern, not an MVP one.

## Competition and edge

AllSpice (electronics only), Onshape/Altium 365 (locked to their own tools), GitHub+DVC (no hardware understanding), Weights & Biases/Rerun (ML and data only), Formant/Foxglove (ops and viz, not design history), Tnkr (closest pitch, very early). The claimed edge: the only tool spanning all four layers plus the physical robots, with consequence-aware checks. This edge is real only if the cross-layer consistency checks work technically — that's the hardest bet in the whole plan.

## Moats (mostly future-state, not current)

- Commit-to-consequence dataset — only exists after real usage accumulates
- Failure knowledge graph — opt-in, anonymized, cross-team
- Embodiment hash — an open standard fingerprinting a robot's physical config
- On-robot agent — switching cost once installed
- Physical test runner network — two-sided marketplace, later-stage

Early on, the only real moats are the on-robot agent's switching cost and being first to ship the embodiment hash.

## Key risks

- Scope is broad — mitigate by shipping the wedge only and saying no to everything else
- CAD/PCB diffing is genuinely hard — start with open formats
- Tool fatigue — integrate with existing tools, don't replace them
- IP sensitivity around cross-customer learning — opt-in, anonymized, self-hosting available
- Physical testing is costly — start in simulation, add hardware with design partners

## Open questions for the next session

- How does this fit alongside NPK Ventures' current tracks (missed-call automation, HVAC/roofing inventory app)? Same company pivoting, or a separate venture under a similar name?
- Who's actually building this — is there a robotics or ML engineer on the team, or does that need to be recruited per the plan's own team section?
- What does founder allocation and decision-making look like across Carter, Carson, and Thomas if this becomes the primary bet?
