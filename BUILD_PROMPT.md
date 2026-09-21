Build the first working milestone of NPK Ventures: traceable robot releases and runs.


Before writing any application code, tests, configuration, or dependency files, read AGENTS.md, npk-ventures-handoff.md, and this entire BUILD_PROMPT.md. Follow the context-reading steps in AGENTS.md. Briefly report your understanding of the full idea and the first milestone before the first implementation edit. If any required context file is missing or unreadable, stop implementation and report it.


Work in this project folder so I can inspect the code in VS Code as it is written. After reading and reporting the context, inspect the available runtimes, implement the milestone, run it locally, verify the acceptance criteria, and document how I can try it. Do not stop at a plan. Ask only for information that prevents useful progress; make routine implementation decisions yourself.


## Customer problem and scope


Robotics teams use separate tools for hardware, firmware, datasets, and models. When performance changes, they struggle to reconstruct what configuration ran and what changed. This is a hypothesis to validate in discovery interviews, not a proven market claim.


The first product must answer: “Which hardware, code, dataset, model, and configuration were recorded for this robot run, and what changed since its last successful run?”


Use existing tool references. Do not build repository hosting, CAD plugins, CAD visual diffs, autonomous robot control, fleet deployment, cross-customer learning, billing, or automatic predictions about physical failures in this milestone. Do not send emails or Slack messages.


## Implementation approach


Prefer a small local Python application using SQLite, FastAPI, server-rendered HTML, and pytest, if Python is available. Use supported dependencies and a reproducible environment. If this stack is unavailable, explain the practical alternative before a major stack change. Keep one application and avoid microservices. Bind to localhost by default. This prototype is for synthetic local data; hosted customer use will require authentication, organization isolation, permissions, and security review.


Keep business logic reusable by the CLI and web application. Store metadata and external artifact references, not large datasets or checkpoints. Never download linked artifacts automatically. Links must permit only safe http/https schemes, and credentials must not appear in saved URLs or logs.


## Data model


- Project: permanent ID and name.
- Robot: permanent ID, project ID, name, and optional serial identifier.
- Artifact: permanent ID, project ID, type (hardware, firmware, dataset, model, configuration), human-readable label, source reference, immutable version identifier and/or content hash, and timestamp. Distinguish an unverified reference from a verified local file hash.
- Release: permanent ID, project ID, creator, timestamp, optional parent release, and exact artifact references. Require one artifact of each of the five types for this first milestone. Save the release and its references atomically.
- Run: permanent ID, robot ID, release ID, timestamp, outcome (success, failure, unknown), notes, and optional logs/recording reference.


Preserve historical release and artifact records: no API or CLI that changes or deletes their contents. Corrections create new records. Validate project boundaries and foreign keys. Describe this as application-level history preservation, not tamper-proof evidence: someone with database access can still modify SQLite.


## Features to implement


1. A versioned JSON release manifest with validation, plus a checked-in synthetic example. It specifies a project, the five artifact versions, creator, and optional parent release. Re-importing the same release manifest must not create ambiguous duplicate releases. Define and document the identity strategy.
2. CLI commands to initialize the local database, register a robot, register a release from a manifest, record a run, inspect a run with all its recorded artifacts, and compare two releases. Provide clear errors and useful exit codes.
3. A small local API for the same operations, with validated inputs and readable error responses.
4. A simple web page listing robots, their releases/runs, a run-detail page with all five artifact references, and a release comparison page. Escape displayed user content. Make it readable without a frontend framework.
5. A deterministic comparison that marks each artifact as unchanged or changed, and shows before/after identifiers. A changed hardware reference is an observation; it is not proof that a model is incompatible. Keep that distinction visible.
6. A repeatable synthetic demo: register hardware A/model A with a successful run, then hardware B/model A with a failed run. Keep the other artifacts unchanged. Show that hardware changed and the model did not. The failure outcome is entered demo data, not a causal conclusion.


## Acceptance criteria


- On a clean local setup, I can initialize the database, load the demo, start the application, and follow the README without editing source code.
- I can inspect either demo run and find its robot, recorded release, and all five exact artifact versions.
- Comparing the demo releases shows hardware changed and model, firmware, dataset, and configuration unchanged.
- Previous records remain intact when a new release is created; the application rejects attempts to overwrite a release.
- Invalid manifests, unknown references, cross-project references, unsafe link schemes, and duplicate imports are handled deliberately and documented.
- Data survives restarting the application.
- Focused tests cover manifest validation, database constraints, historical preservation, duplicate imports, run-to-release linkage, and comparison correctness. Actually run the tests and fix failures.
- Manually try the CLI and web workflow; report what passed and any unresolved limitations honestly.
- No external account, robot, customer files, or paid service is needed to demonstrate this milestone.


## Delivery and GitHub workflow


Write a concise README with actual setup commands, CLI examples, web start command, test command, demo walkthrough, and current limitations. Add a suitable .gitignore for environments, caches, local databases, secrets, and generated files. Do not add a license until I choose one. Do not publish this commercially sensitive project publicly.


Use the existing local Git repository. Do not overwrite unrelated work. Do not create a GitHub repository, configure a remote, commit, or push during the implementation milestone. When all acceptance criteria pass, present the working piece for my review with the changed files, validation results, and exact commands to try it. Wait for my explicit approval that it behaves exactly how I want it before committing or pushing.


After I explicitly approve publication, confirm the GitHub owner and repository name if they are unknown, use a private repository unless I explicitly request public visibility, inspect the staged diff for secrets and unintended files, create the approved commit, and push to the verified destination. Report the repository URL and commit. If authentication or tooling is unavailable, explain the specific blocker without claiming the push succeeded.


Later discovery results will choose one integration and one explicit compatibility rule. Preserve room for those additions, but finish this milestone first.
