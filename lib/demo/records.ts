import type { CustomField } from '../local/custom.ts';
export type Value = string | number | boolean | Value[] | { [key: string]: Value };
export type Field = { state: 'known'; value: Value } | { state: 'unknown' | 'not-applicable'; reason: string };
export const fields = [
  ['hardware', 'Hardware', 'Gripper identity / revision'],
  ['software', 'Software', 'Git commit / dirty status'],
  ['firmware', 'Firmware', 'Gripper firmware'],
  ['model', 'Model', 'Policy model version'],
  ['lineage', 'Model', 'Training-data lineage'],
  ['calibration', 'Calibration', 'Camera calibration'],
  ['gripForce', 'Settings', 'Grip force (N)'],
  ['procedure', 'Test conditions', 'Procedure version'],
  ['object', 'Test conditions', 'Task / object'],
  ['conditions', 'Test conditions', 'Conditions with units'],
] as const;
export type FieldKey = typeof fields[number][0];
export type Provenance = { source: string; method: string; author: string; observedAt: string; recordedAt: string; evidence: string; available: boolean };
export type Snapshot = {
  id: string; revision: number; robotId: string; schemaVersion: 1 | 2;
  custom?: CustomField[];
  values: Record<FieldKey, Field>; provenance: Record<FieldKey, Provenance>;
  hardwareConfirmedAt: string;
};
export type Run = { id: string; robotId: string; snapshotId: string; snapshotRevision: number; at: string; outcome: 'success' | 'failure'; successfulPicks?: number; attemptedPicks?: number };
export type Records = { robots: { id: string; name: string; task: string }[]; snapshots: Snapshot[]; runs: Run[] };
export type Result = 'Changed' | 'Unchanged' | 'Unknown' | 'Not applicable';

// Object key order is irrelevant; array order and primitive types are meaningful.
export function canonical(value: Value): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
export function compareField(a: Field, b: Field): Result {
  if (a.state === 'unknown' || b.state === 'unknown') return 'Unknown';
  if (a.state === 'not-applicable' && b.state === 'not-applicable') return 'Not applicable';
  if (a.state !== 'known' || b.state !== 'known') return 'Changed';
  return canonical(a.value) === canonical(b.value) ? 'Unchanged' : 'Changed';
}
export function formatField(field: Field): string {
  if (field.state !== 'known') return `${field.state === 'unknown' ? 'Unknown' : 'Not applicable'} — ${field.reason}`;
  const value = field.value;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const keys = Object.keys(value).sort().join(',');
    if (keys === 'component,revision') return `${value.component} · revision ${value.revision}`;
    if (keys === 'commit,dirty') return `${value.commit} · ${value.dirty ? 'uncommitted changes' : 'clean'}`;
    if (keys === 'ambient_C,speed_m_s') return `${value.ambient_C} °C · ${value.speed_m_s} m/s`;
  }
  return typeof field.value === 'object' ? canonical(field.value) : String(field.value);
}
export function snapshotFor(records: Records, run: Run): Snapshot {
  const result = records.snapshots.find(s => s.id === run.snapshotId && s.revision === run.snapshotRevision && s.robotId === run.robotId);
  if (!result) throw new Error(`Run ${run.id}: exact snapshot revision is unavailable.`);
  return result;
}
export function compareRuns(records: Records, baseline: Run, target: Run) {
  const a = snapshotFor(records, baseline), b = snapshotFor(records, target);
  const rows = fields.map(([key, group, label]) => ({ key, group, label, before: a.values[key], after: b.values[key], result: compareField(a.values[key], b.values[key]) }));
  const warnings: string[] = [];
  if (baseline.robotId !== target.robotId) warnings.push('Different robots: this is not a same-robot baseline.');
  if (baseline.outcome !== 'success') warnings.push('The baseline was not successful.');
  if (baseline.id === target.id) warnings.push('The same run is selected on both sides.');
  if (Date.parse(baseline.at) >= Date.parse(target.at)) warnings.push('The baseline does not precede the selected run.');
  for (const row of rows.filter(r => r.group === 'Test conditions')) {
    if (row.result !== 'Unchanged') warnings.push(`${row.label}: ${row.result.toLowerCase()}; comparability is limited.`);
  }
  return { rows, warnings };
}
// A visible demo policy, not a validated customer-specific freshness requirement.
export const staleAfterHours = 24;
export function hardwareStale(snapshot: Snapshot, run: Run): boolean {
  return Date.parse(run.at) - Date.parse(snapshot.hardwareConfirmedAt) > staleAfterHours * 3600000;
}

export function validateRecords(records: Records): void {
  const fail = (message: string): never => { throw new Error(message); };
  const text = (v: unknown) => typeof v === 'string' && v.trim().length > 0;
  const date = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().replace('.000Z', 'Z') === v;
  const jsonValue = (v: unknown): boolean => typeof v === 'string' ? v.trim().length > 0 : typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v)) || (Array.isArray(v) ? v.length > 0 && v.every(jsonValue) : v !== null && typeof v === 'object' && Object.keys(v).length > 0 && Object.values(v).every(jsonValue));
  const robotIds = new Set<string>(), snapshots = new Set<string>(), runs = new Set<string>();
  for (const robot of records.robots) {
    if (!text(robot.id) || !text(robot.name) || !text(robot.task) || robotIds.has(robot.id)) fail('Invalid or duplicate robot.');
    robotIds.add(robot.id);
  }
  for (const s of records.snapshots) {
    const ref = JSON.stringify([s.id, s.revision]);
    if (!text(s.id) || !(s.schemaVersion === 1 || s.schemaVersion === 2 && Array.isArray(s.custom) && s.custom.length > 0) || !Number.isInteger(s.revision) || s.revision < 1 || !robotIds.has(s.robotId) || snapshots.has(ref)) fail('Invalid or duplicate snapshot revision.');
    snapshots.add(ref);
    if (!date(s.hardwareConfirmedAt)) fail(`${s.id}: invalid hardware confirmation.`);
    for (const [key] of fields) {
      const f = s.values[key], p = s.provenance[key];
      if (!f || !['known', 'unknown', 'not-applicable'].includes(f.state)) fail(`${s.id}: invalid ${key} state.`);
      if (f.state === 'known' ? !jsonValue(f.value) : !text(f.reason)) fail(`${s.id}: invalid ${key} value or reason.`);
      if (!p || !text(p.source) || !text(p.method) || !text(p.author) || !text(p.evidence) || typeof p.available !== 'boolean' || !date(p.observedAt) || !date(p.recordedAt) || Date.parse(p.observedAt) > Date.parse(p.recordedAt)) fail(`${s.id}: invalid ${key} provenance.`);
    }
    const software = s.values.software;
    if (software.state === 'known') {
      const v = software.value;
      if (!v || typeof v !== 'object' || Array.isArray(v) || typeof v.commit !== 'string' || !/^[a-f0-9]{40}$/.test(v.commit) || typeof v.dirty !== 'boolean') fail(`${s.id}: invalid Git metadata.`);
    }
  }
  for (const r of records.runs) {
    if (!text(r.id) || runs.has(r.id) || !robotIds.has(r.robotId) || !date(r.at) || !['success', 'failure'].includes(r.outcome)) fail('Invalid or duplicate run.');
    runs.add(r.id);
    const s = snapshotFor(records, r);
    if (!(s.schemaVersion === 2 && r.successfulPicks === undefined && r.attemptedPicks === undefined) && (typeof r.successfulPicks !== 'number' || typeof r.attemptedPicks !== 'number' || !Number.isSafeInteger(r.successfulPicks) || !Number.isSafeInteger(r.attemptedPicks) || r.attemptedPicks < 1 || r.successfulPicks < 0 || r.successfulPicks > r.attemptedPicks)) fail('Invalid pick counts.');
    if (s.custom?.some(f => Date.parse(f.provenance.observedAt) > Date.parse(r.at))) fail(`${r.id}: custom observation is after the run.`);
    if (Date.parse(s.hardwareConfirmedAt) > Date.parse(r.at)) fail(`${r.id}: hardware confirmation is after the run.`);
  }
}
