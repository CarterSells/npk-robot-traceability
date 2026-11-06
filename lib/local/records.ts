import { canonical, fields, validateRecords } from '../demo/records.ts';
import type { Field, FieldKey, Provenance, Records, Run, Snapshot, Value } from '../demo/records.ts';
import { applyMapping, validateCustom, validateMapping } from './custom.ts';
import type { Mapping, SourceDocument } from './custom.ts';
import { validateInvestigations } from './investigations.ts';
import type { Investigation } from './investigations.ts';

export const MAX_BYTES = 2 * 1024 * 1024;
export type RecordKey = FieldKey | `custom:${string}`;
export type Correction = { snapshotId: string; revision: number; priorRevision: number; field: RecordKey; author: string; reason: string; recordedAt: string };
export type Bundle = { format: 'unify-local'; version: 1 | 2; synthetic: boolean; records: Records; corrections: Correction[]; mappings?: Mapping[]; investigations?: Investigation[] };
export const emptyBundle = (): Bundle => ({ format: 'unify-local', version: 1, synthetic: false, records: { robots: [], snapshots: [], runs: [] }, corrections: [] });
type Obj = Record<string, unknown>;
function fail(path: string, message: string): never { throw new Error(`${path}: ${message}`); }
function object(value: unknown, path: string, keys: readonly string[]): Obj {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'expected an object.');
  const item = value as Obj;
  for (const key of Object.keys(item)) if (!keys.includes(key)) fail(`${path}.${key}`, 'field is not allowed.');
  return item;
}
function text(value: unknown, path: string, max = 2048): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail(path, `expected nonempty text (maximum ${max} characters).`);
}
function id(value: unknown, path: string) { text(value, path, 120); if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value)) fail(path, 'use letters, digits, dots, underscores or hyphens.'); }
function date(value: unknown, path: string) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().replace('.000Z', 'Z') !== value) fail(path, 'use a real UTC date, YYYY-MM-DDTHH:mm:ssZ.');
}
function integer(value: unknown, path: string, min = 1) { if (!Number.isSafeInteger(value) || (value as number) < min) fail(path, `expected an integer of at least ${min}.`); }
function list(value: unknown, path: string): unknown[] { if (!Array.isArray(value) || value.length > 1000) fail(path, 'expected an array of at most 1,000 entries.'); return value; }
function bool(value: unknown, path: string) { if (typeof value !== 'boolean') fail(path, 'expected true or false.'); }

function field(value: unknown, key: FieldKey, path: string) {
  const f = object(value, path, ['state', 'value', 'reason']);
  if (f.state === 'unknown' || f.state === 'not-applicable') {
    if ('value' in f) fail(path, 'unknown/not-applicable fields cannot carry a value.');
    text(f.reason, `${path}.reason`); return;
  }
  if (f.state !== 'known') fail(`${path}.state`, 'choose known, unknown or not-applicable.');
  if ('reason' in f) fail(path, 'known fields carry a value, not a reason.');
  if (key === 'hardware') {
    const v = object(f.value, `${path}.value`, ['component', 'revision']);
    text(v.component, `${path}.value.component`, 120); text(v.revision, `${path}.value.revision`, 120);
  } else if (key === 'software') {
    const v = object(f.value, `${path}.value`, ['commit', 'dirty', 'buildDigest']);
    if (typeof v.commit !== 'string' || !/^[a-f0-9]{40}$/.test(v.commit)) fail(`${path}.value.commit`, 'expected a 40-character lowercase Git commit.');
    bool(v.dirty, `${path}.value.dirty`);
    if (v.buildDigest !== undefined) text(v.buildDigest, `${path}.value.buildDigest`, 256);
  } else if (key === 'conditions') {
    const v = object(f.value, `${path}.value`, ['speed_m_s', 'ambient_C', 'payload_kg']);
    if (!Object.keys(v).length) fail(`${path}.value`, 'record at least one supported condition, or use unknown.');
    for (const [name, number] of Object.entries(v)) if (typeof number !== 'number' || !Number.isFinite(number) || (name !== 'ambient_C' && number < 0)) fail(`${path}.value.${name}`, 'expected a finite measurement in the named unit.');
  } else if (key === 'gripForce') {
    if (typeof f.value !== 'number' || !Number.isFinite(f.value) || f.value < 0) fail(`${path}.value`, 'expected a nonnegative number in newtons.');
  } else text(f.value, `${path}.value`, 512);
}

// Validate unknown JSON before allowing the trusted comparison engine to consume it.
export function validateBundle(input: unknown): asserts input is Bundle {
  const b = object(input, 'bundle', ['format', 'version', 'synthetic', 'records', 'corrections', 'mappings', 'investigations']);
  if (b.format !== 'unify-local' || ![1, 2].includes(b.version as number)) fail('bundle', 'expected format unify-local, version 1 or 2.');
  if (b.version === 1 && 'mappings' in b) fail('bundle', 'mappings require version 2.');
  if (b.mappings !== undefined) {
    const ids = new Set<string>();
    for (const mapping of list(b.mappings, 'mappings')) { validateMapping(mapping); if (ids.has(mapping.id)) fail('mappings', 'duplicate mapping ID.'); ids.add(mapping.id); }
  }
  bool(b.synthetic, 'bundle.synthetic');
  const r = object(b.records, 'records', ['robots', 'snapshots', 'runs']);
  list(r.robots, 'robots').forEach((value, i) => {
    const p = `robots[${i}]`, robot = object(value, p, ['id', 'name', 'task']);
    id(robot.id, `${p}.id`); text(robot.name, `${p}.name`, 120); text(robot.task, `${p}.task`, 512);
  });
  list(r.snapshots, 'snapshots').forEach((value, i) => {
    const p = `snapshots[${i}]`, s = object(value, p, ['id', 'revision', 'robotId', 'schemaVersion', 'values', 'provenance', 'hardwareConfirmedAt', 'custom']);
    id(s.id, `${p}.id`); id(s.robotId, `${p}.robotId`); integer(s.revision, `${p}.revision`);
    if (s.schemaVersion === 2 && b.version === 2) validateCustom(s.custom);
    else if (s.schemaVersion !== 1 || 'custom' in s) fail(`${p}.schemaVersion`, 'custom fields require snapshot and bundle version 2.');
    date(s.hardwareConfirmedAt, `${p}.hardwareConfirmedAt`);
    const values = object(s.values, `${p}.values`, fields.map(([k]) => k));
    const provenance = object(s.provenance, `${p}.provenance`, fields.map(([k]) => k));
    for (const [key] of fields) {
      field(values[key], key, `${p}.values.${key}`);
      const pp = `${p}.provenance.${key}`, v = object(provenance[key], pp, ['source', 'method', 'author', 'observedAt', 'recordedAt', 'evidence', 'available']);
      for (const name of ['source', 'method', 'author', 'evidence']) text(v[name], `${pp}.${name}`, 512);
      date(v.observedAt, `${pp}.observedAt`); date(v.recordedAt, `${pp}.recordedAt`); bool(v.available, `${pp}.available`);
      if (Date.parse(v.observedAt as string) > Date.parse(v.recordedAt as string)) fail(pp, 'observed time must not follow recorded time.');
    }
    const hp = provenance.hardware as Obj;
    if (!/manual/i.test(hp.method as string)) fail(`${p}.provenance.hardware.method`, 'hardware must be explicitly reported as manual.');
    if (s.hardwareConfirmedAt !== hp.observedAt) fail(`${p}.hardwareConfirmedAt`, 'must match the manual hardware observation time.');
  });
  list(r.runs, 'runs').forEach((value, i) => {
    const p = `runs[${i}]`, run = object(value, p, ['id', 'robotId', 'snapshotId', 'snapshotRevision', 'at', 'outcome', 'successfulPicks', 'attemptedPicks']);
    for (const key of ['id', 'robotId', 'snapshotId']) id(run[key], `${p}.${key}`);
    integer(run.snapshotRevision, `${p}.snapshotRevision`); date(run.at, `${p}.at`);
    if (run.successfulPicks !== undefined || run.attemptedPicks !== undefined || b.version === 1) { integer(run.successfulPicks, `${p}.successfulPicks`, 0); integer(run.attemptedPicks, `${p}.attemptedPicks`); }
    if (!['success', 'failure'].includes(run.outcome as string)) fail(`${p}.outcome`, 'choose success or failure.');
  });
  const corrections = list(b.corrections, 'corrections');
  corrections.forEach((value, i) => {
    const p = `corrections[${i}]`, c = object(value, p, ['snapshotId', 'revision', 'priorRevision', 'field', 'author', 'reason', 'recordedAt']);
    id(c.snapshotId, `${p}.snapshotId`); integer(c.revision, `${p}.revision`, 2); integer(c.priorRevision, `${p}.priorRevision`);
    text(c.author, `${p}.author`, 512); text(c.reason, `${p}.reason`); date(c.recordedAt, `${p}.recordedAt`);
    if (!fields.some(([key]) => key === c.field) && !(b.version === 2 && typeof c.field === 'string' && /^custom:[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(c.field))) fail(`${p}.field`, 'unknown domain field.');
  });
  const bundle = input as Bundle, records = bundle.records;
  validateRecords(records);
  if ('investigations' in b) {
    if (b.version !== 2) fail('investigations', 'require bundle version 2.');
    validateInvestigations(b.investigations, records);
  }
  const seen = new Set<string>();
  for (const c of bundle.corrections) {
    const key = `${c.snapshotId}:${c.revision}`;
    if (seen.has(key)) fail('corrections', 'duplicate correction revision.'); seen.add(key);
    const current = records.snapshots.find(s => s.id === c.snapshotId && s.revision === c.revision);
    const prior = records.snapshots.find(s => s.id === c.snapshotId && s.revision === c.priorRevision);
    if (!current || !prior || current.robotId !== prior.robotId || c.revision !== c.priorRevision + 1) fail('corrections', 'each correction needs its exact previous revision for the same robot.');
    if (current.schemaVersion !== prior.schemaVersion) fail('corrections', 'snapshot schema cannot change in a correction.');
    const p = provenanceFor(current, c.field);
    if (p.author !== c.author || p.recordedAt !== c.recordedAt || !/manual/i.test(p.method)) fail('corrections', 'author, recorded time and manual provenance must match the corrected field.');
    if (Date.parse(c.recordedAt) < Math.max(...[...Object.values(prior.provenance), ...(prior.custom ?? []).map(f => f.provenance)].map(v => Date.parse(v.recordedAt)))) fail('corrections', 'a correction cannot precede its prior revision.');
    for (const [fieldKey] of fields) if (fieldKey !== c.field && (canonical(current.values[fieldKey] as unknown as Value) !== canonical(prior.values[fieldKey] as unknown as Value) || canonical(current.provenance[fieldKey] as unknown as Value) !== canonical(prior.provenance[fieldKey] as unknown as Value))) fail('corrections', 'only the declared field may change in one correction.');
    if (c.field !== 'hardware' && current.hardwareConfirmedAt !== prior.hardwareConfirmedAt) fail('corrections', 'hardware confirmation requires a hardware correction.');
    const unchangedCustom = (s: Snapshot) => (s.custom ?? []).map(f => c.field === `custom:${f.id}` ? { ...f, value: null, provenance: null } : f);
    if (canonical(unchangedCustom(current) as unknown as Value) !== canonical(unchangedCustom(prior) as unknown as Value)) fail('corrections', 'custom definitions and undeclared fields must remain unchanged.');
  }
  for (const s of records.snapshots) if (s.revision > 1 && !seen.has(`${s.id}:${s.revision}`)) fail('snapshots', 'every revision after 1 requires a correction event and full history.');
}

export function parseBundle(json: string): Bundle {
  if (new TextEncoder().encode(json).length > MAX_BYTES) fail('file', 'maximum size is 2 MiB.');
  let input: unknown;
  try { input = JSON.parse(json); } catch { fail('file', 'invalid JSON. Check commas, quotes and brackets.'); }
  validateBundle(input);
  // Reject a compact input that cannot be exported within the same file limit.
  exportBundle(input); return input;
}
export function exportBundle(bundle: Bundle): string {
  validateBundle(bundle);
  const json = JSON.stringify(bundle, null, 2);
  if (new TextEncoder().encode(json).length > MAX_BYTES) fail('workspace', 'export exceeds the 2 MiB import limit.');
  return json;
}
// Collector handoffs append atomically; existing revisions are never overwritten.
export function appendCapture(bundle: Bundle, capture: Bundle): Bundle {
  validateBundle(bundle); validateBundle(capture);
  if (capture.investigations?.length || capture.records.robots.length !== 1 || capture.records.snapshots.length !== 1 || capture.records.runs.length > 1 || capture.corrections.length || capture.records.snapshots[0].revision !== 1) fail('capture', 'expected one robot, one revision-1 snapshot and at most one run; use Import JSON for a complete workspace.');
  const populated = bundle.records.robots.length > 0;
  if (populated && bundle.synthetic !== capture.synthetic) fail('capture', 'synthetic and real records cannot be combined. Export and clear the workspace first.');
  const next = structuredClone(bundle);
  next.synthetic = capture.synthetic;
  if (capture.version === 2) next.version = 2;
  function append<T>(items: T[], incoming: T, matches: (item: T) => boolean, label: string) {
    const existing = items.find(matches);
    if (existing) {
      if (canonical(existing as Value) !== canonical(incoming as Value)) fail('capture', `${label} conflicts with an existing record. Nothing was imported.`);
    } else items.push(structuredClone(incoming));
  }
  for (const robot of capture.records.robots) append(next.records.robots, robot, r => r.id === robot.id, 'Robot identity');
  for (const snapshot of capture.records.snapshots) append(next.records.snapshots, snapshot, s => s.id === snapshot.id && s.revision === snapshot.revision, 'Snapshot revision');
  for (const run of capture.records.runs) append(next.records.runs, run, r => r.id === run.id, 'Run identity');
  for (const mapping of capture.mappings ?? []) { next.mappings ??= []; append(next.mappings, mapping, m => m.id === mapping.id, 'Mapping identity'); }
  return finish(next);
}
function finish(bundle: Bundle): Bundle { exportBundle(bundle); return bundle; }
export function appendInvestigation(bundle: Bundle, entry: Investigation): Bundle {
  const next = structuredClone(bundle); next.version = 2;
  next.investigations ??= []; next.investigations.push(structuredClone(entry)); return finish(next);
}
export function addRobot(bundle: Bundle, robot: Records['robots'][number]): Bundle {
  const next = structuredClone(bundle); next.records.robots.push(robot); return finish(next);
}
export type HardwareInput = { id: string; robotId: string; component: string; revision: string; author: string; observedAt: string; evidence: string; available: boolean };
export function addHardware(bundle: Bundle, input: HardwareInput, now: string): Bundle {
  const next = structuredClone(bundle);
  const values = Object.fromEntries(fields.map(([key]) => [key, { state: 'unknown', reason: 'Not recorded for this configuration.' }])) as Snapshot['values'];
  values.hardware = { state: 'known', value: { component: input.component, revision: input.revision } };
  const provenance = Object.fromEntries(fields.map(([key]) => [key, {
    source: key === 'hardware' ? 'Operator hardware report' : 'Local record entry', method: key === 'hardware' ? 'Manual hardware report' : 'Manual missing-information declaration',
    author: input.author, observedAt: input.observedAt, recordedAt: now,
    evidence: key === 'hardware' ? input.evidence : 'No evidence supplied', available: key === 'hardware' && input.available,
  }])) as Snapshot['provenance'];
  next.records.snapshots.push({ id: input.id, revision: 1, robotId: input.robotId, schemaVersion: 1, hardwareConfirmedAt: input.observedAt, values, provenance });
  return finish(next);
}
export function fieldFor(snapshot: Snapshot, key: RecordKey): Field {
  if (!key.startsWith('custom:')) return snapshot.values[key as FieldKey];
  const field = snapshot.custom?.find(f => `custom:${f.id}` === key);
  if (!field) fail('correction', 'custom field is absent.');
  return field.value;
}
export function provenanceFor(snapshot: Snapshot, key: RecordKey): Provenance {
  if (!key.startsWith('custom:')) return snapshot.provenance[key as FieldKey];
  const field = snapshot.custom?.find(f => `custom:${f.id}` === key);
  if (!field) fail('correction', 'custom field is absent.');
  return field.provenance;
}
export function correctField(bundle: Bundle, snapshot: Snapshot, key: RecordKey, value: Field, provenance: Provenance, reason: string): Bundle {
  const next = structuredClone(bundle);
  const latest = next.records.snapshots.filter(s => s.id === snapshot.id).sort((a, b) => b.revision - a.revision)[0];
  if (!latest || latest.revision !== snapshot.revision || latest.robotId !== snapshot.robotId) fail('correction', 'select the latest revision before appending a correction.');
  const revised = structuredClone(latest); revised.revision++;
  if (key.startsWith('custom:')) {
    const field = revised.custom?.find(f => `custom:${f.id}` === key);
    if (!field) fail('correction', 'custom field is absent.');
    field.value = structuredClone(value); field.provenance = structuredClone(provenance);
  } else { revised.values[key as FieldKey] = structuredClone(value); revised.provenance[key as FieldKey] = structuredClone(provenance); }
  if (key === 'hardware') revised.hardwareConfirmedAt = provenance.observedAt;
  next.records.snapshots.push(revised);
  next.corrections.push({ snapshotId: revised.id, revision: revised.revision, priorRevision: latest.revision, field: key, author: provenance.author, reason, recordedAt: provenance.recordedAt });
  return finish(next);
}
export function addRun(bundle: Bundle, run: Run): Bundle {
  const next = structuredClone(bundle); next.records.runs.push(structuredClone(run)); return finish(next);
}

export function addMappedSnapshot(bundle: Bundle, input: { id: string; robotId: string; mapping: Mapping; document: SourceDocument; row: number; provenance: Provenance }): Bundle {
  validateBundle(bundle);
  const next = structuredClone(bundle); next.version = 2; next.mappings ??= [];
  const saved = next.mappings.find(m => m.id === input.mapping.id);
  if (saved && canonical(saved as unknown as Value) !== canonical(input.mapping as unknown as Value)) fail('mapping', 'saved mapping differs; use a new mapping ID.');
  if (!saved) next.mappings.push(structuredClone(input.mapping));
  const custom = applyMapping(input.mapping, input.document, input.row, input.provenance);
  const values = Object.fromEntries(fields.map(([key]) => [key, { state: 'unknown', reason: 'Not recorded by this custom metadata import.' }])) as Snapshot['values'];
  const provenance = Object.fromEntries(fields.map(([key]) => [key, { ...input.provenance, method: 'Manual missing-information declaration', evidence: 'No core-field evidence supplied', available: false }])) as Snapshot['provenance'];
  next.records.snapshots.push({ id: input.id, robotId: input.robotId, revision: 1, schemaVersion: 2, custom, values, provenance, hardwareConfirmedAt: input.provenance.observedAt });
  return finish(next);
}
