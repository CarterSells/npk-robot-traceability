# Prediction readiness and offline candidates (B12)

Authority: [build.md](../build.md) sections 6–8 and 10; [B12](backend-master-prompts.md). Current technical evidence is in [build progress](build-progress.md). No capability has real-data validation or a serving model. This implementation supplies a conservative readiness policy, curated dataset contract, offline constant baselines and private candidate artifacts. It does not establish a deployed training/serving system.

## Capability and cohort contract

| Capability | Target | Required evidence before activation |
| --- | --- | --- |
| failure_risk | Confirmed failure at completion, binary 0/1 | Pre-run decision time; comparable success/failure labels; later holdout calibration, Brier score, precision/recall and rare-event uncertainty |
| duration | Measured completion duration in seconds | Defined completion semantics; representative completed jobs; later holdout absolute/RMS error and interval coverage |
| quality | Named task-specific measurement and unit | Engineer-defined metric and acceptance criteria; measured labels and task-defined error costs |
| maintenance | Named component outcome within a positive horizon | Exposure, follow-up/event times, maintenance interventions, right censoring, lead-time and false-alert criteria; separate reviewed survival protocol |

A cohort fixes procedure/version, reviewed robot/component configuration family, environment, provenance and reality. Curators must verify every selected row belongs to that cohort and project. The offline tool cannot independently prove a JSON file's claimed origin, permissions, installed hardware or timestamps. Preserve approved evidence references outside source control and reconcile them with immutable source records before evaluation. Do not infer installed hardware from CAD revisions. Split simulation and real datasets; `synthetic` is rejected. No tenant pooling is implemented or authorized. A single organization/project is explicit in each artifact; changing it changes its hash.

`collecting_data`, `insufficient_labels`, `evaluating`, `available`, `degraded` and `paused` are the state vocabulary. Empty curated datasets are collecting; missing eligible train/test labels are insufficient; computed baselines are evaluating. Candidate registry entries preserve that result or record paused/degraded with author, reason and optional prior-entry hash. **Available is not an implemented transition.** It requires independently reviewed evidence and a separate validated deployment. Small counts are enough to test arithmetic, never enough to establish readiness. No percentage or fixed-run unlock is presented.

`GET /api/client-readiness/{org}/{project}` checks the current authenticated project's access before returning the same conservative policy shown in the client portal. It exposes no private cohort identifiers, raw labels or internal counts. Each capability is unavailable/collecting_data with an explanation; eligible counts and cohort are null because no curated evaluation is connected. These are policy prerequisites, not a live census of stored runs. B11 reports retain their truthful unavailable model assessment. Offline registry states do not silently change portal policy.

## Reproducible curated input

The strict contract is implemented in `lib/beta/prediction-evaluation.ts`. Input contains only approved metadata and numeric labels, up to 10,000 rows/8 MiB for the CLI. Example structure (empty rows mean no evidence):

```json
{
 "schema_version":1,
 "org_id":"00000000-0000-4000-8000-000000000001",
 "project_id":"00000000-0000-4000-8000-000000000002",
 "cohort":{"procedure":"reviewed-procedure","procedure_version":"v1","configuration":"reviewed-configuration-family","environment":"reviewed-environment","provenance":"manual-reviewed","reality":"real"},
 "target":{"capability":"duration","metric":"duration","unit":"s","horizon_seconds":null},
 "feature_version":"cohort-only-v1","label_version":"measured-seconds-v1",
 "split_at":"2026-10-15T00:00:00.000Z","evaluated_at":"2026-11-01T00:00:00.000Z",
 "rows":[]
}
```

Each row has exactly `attempt_id`, `job_id`, `duplicate_group`, `robot_id`, `snapshot:{id,revision}`, `decision_at`, `context_recorded_at`, `label_available_at`, `label` and `censored`. IDs for attempts/jobs are UUIDs. `duplicate_group` is the curator-reviewed near-duplicate grouping, not a random new identifier for each repeated observation. Times use UTC milliseconds. Context must have been recorded by the pre-run decision; source evidence must independently establish this. A null label has null availability time, and censoring cannot be encoded as a negative or positive label. Reject invalid, nonfinite, oversized and target-inconsistent numbers. Corrections produce a new input/artifact hash; preserve the prior artifact and reason.

Rows sort deterministically by decision time/attempt ID before hashing. Feature/label definitions, exact snapshot references, cohort, scope, times and labels enter the dataset hash. The saved artifact includes this normalized manifest, training/test attempt IDs, exclusions, algorithm version, baseline parameters, evaluation metrics and offline prediction records. Predictions retain decision time, model version, input snapshot, cohort applicability, realized label and explicit uncertainty. They are retrospective offline calculations, not proof that a prediction existed before a historical run.

Train on decisions before `split_at` with labels already available before that cutoff; test on decisions at/after it with labels available by `evaluated_at`. Exclude groups crossing the boundary by job ID or curated duplicate group. Exclude missing/censored labels. Curators must group all linked repeats consistently; independent-robot transfer is not evaluated or claimed. A future transfer claim needs robot-level holdouts. Do not select thresholds, cohort boundaries or acceptance criteria after seeing the holdout.

## Baselines and interpretation

Risk uses training failure prevalence. It reports holdout Brier score, one-bin predicted/observed calibration, precision/recall at the documented 0.5 baseline threshold, and average precision (prevalence for tied constant scores). Both classes must occur in training and holdout; no confirmed failures can keep risk unavailable. Brier score alone is not proof of calibration. Duration and quality use a training median, MAE/RMSE and measured coverage/width of the empirical training 10th–90th percentile range. That range is not a calibrated prediction interval. No minimum sample count or metric automatically passes acceptance. Maintenance deliberately produces no estimate; its required exposure/event/censoring design is absent from the current baseline contract.

Method references: scikit-learn's [time-based split](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.TimeSeriesSplit), [leakage guidance](https://github.com/scikit-learn/scikit-learn/blob/main/doc/common_pitfalls.rst), [calibration guidance](https://github.com/scikit-learn/scikit-learn/blob/main/doc/modules/calibration.rst) and [metrics definitions](https://scikit-learn.org/stable/modules/model_evaluation.html). The implementation is dependency-free TypeScript, not a claim to use scikit-learn or its cross-validation implementation.

## Private artifact workflow

Preconfigure input and output storage outside the repository with appropriate ACLs and approved retention. No private storage or customer dataset is created by this task. Run:

```sh
node --experimental-strip-types scripts/evaluate-predictions.mjs /private/curated.json /private/evaluations reviewer-id
```

The CLI refuses repository paths (including resolved symlinks), oversized inputs and existing output names. It writes one exclusive, flushed content-addressed JSON artifact containing dataset/evaluation/candidate-registry metadata. POSIX mode is 0600; Windows relies on preconfigured directory ACLs. File permissions do not make this a multi-user authorization service or managed immutable store. Keep manifests, labels, predictions and registry files private; no automatic network upload, provider call or robot action occurs. Rerunning the normalized input reproduces model/metric results; the registry entry records a fresh audit timestamp. Existing artifacts are never overwritten by the tool. Candidate state entries can be generated through `registryEntry`; durable reviewed transition/serving integration remains unimplemented.

## Remaining activation and monitoring gates

Before any shadow/advisory deployment: obtain authorized real data, source reconciliation and dataset rights; preregister cohort/target/acceptance thresholds; independently review leakage and later-data evaluation; assess uncertainty/rare failures; implement audited registry activation and rollback, timestamped live prediction records, scoped API access, missing-feature abstention, cohort/drift monitoring and realized-outcome reconciliation. A paused/degraded model must abstain. Define monitoring windows and alert/rollback owners from actual workload. Simulation evaluation cannot validate real deployment. Maintenance additionally needs event-time/censoring evaluation and task-appropriate lead-time/false-alert evidence. No prediction may become an automatic control command. These open gates are not completed by the offline tests.
