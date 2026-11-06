import test from 'node:test';
import assert from 'node:assert/strict';
import { demoRecords } from '../lib/demo/fixtures.ts';
import { compareField, compareRuns, snapshotFor, validateRecords, hardwareStale } from '../lib/demo/records.ts';
const known = value => ({ state:'known', value });
const unknown = { state:'unknown', reason:'Not recorded' };
const na = { state:'not-applicable', reason:'No learned model' };
const run = id => demoRecords.runs.find(r => r.id === id);

test('unknown never establishes sameness; applicability is distinct', () => {
  for (const pair of [[unknown, unknown], [unknown, known(1)], [na, unknown]]) assert.equal(compareField(...pair), 'Unknown');
  assert.equal(compareField(na, na), 'Not applicable');
  assert.equal(compareField(na, known('v1')), 'Changed');
  assert.equal(compareField(known(false), known(false)), 'Unchanged');
  assert.equal(compareField(known(0), known('0')), 'Changed');
});
test('semantic comparison ignores nested object key order and preserves array order', () => {
  assert.equal(compareField(known({ a:1, b:{ c:2, d:3 } }), known({ b:{ d:3, c:2 }, a:1 })), 'Unchanged');
  assert.equal(compareField(known([1,2]), known([2,1])), 'Changed');
});
test('expected regression has six changes and one unknown, without input mutation', () => {
  const before = JSON.stringify(demoRecords);
  const result = compareRuns(demoRecords, run('run-042'), run('run-043'));
  assert.deepEqual(result.rows.filter(r => r.result === 'Changed').map(r => r.key), ['hardware','software','firmware','model','lineage','calibration']);
  assert.deepEqual(result.rows.filter(r => r.result === 'Unknown').map(r => r.key), ['gripForce']);
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(compareRuns(demoRecords, run('run-042'), run('run-043')), result);
  assert.equal(JSON.stringify(demoRecords), before);
  assert.ok(Object.isFrozen(demoRecords.snapshots[0].values));
});
test('mismatched, missing, future and cross-robot baselines produce warnings', () => {
  const mismatched = compareRuns(demoRecords, run('run-044'), run('run-043'));
  assert.equal(mismatched.warnings.length, 4);
  assert.ok(compareRuns(demoRecords, run('run-042'), run('run-045')).warnings.some(w => w.includes('unknown')));
  assert.ok(compareRuns(demoRecords, run('run-101'), run('run-043')).warnings.some(w => w.includes('Different robots')));
});
test('stale hardware is assessed at the run using the explicit demo policy', () => {
  assert.equal(hardwareStale(snapshotFor(demoRecords, run('run-045')), run('run-045')), true);
  assert.equal(hardwareStale(snapshotFor(demoRecords, run('run-043')), run('run-043')), false);
});
test('exact snapshot revision cannot silently resolve to another revision or robot', () => {
  const copy = structuredClone(demoRecords);
  copy.snapshots.push({ ...structuredClone(copy.snapshots[0]), revision:2 });
  assert.equal(snapshotFor(copy, copy.runs[0]).revision, 1);
  copy.runs[0].snapshotRevision = 3;
  assert.throws(() => validateRecords(copy), /exact snapshot/);
  copy.runs[0].snapshotRevision = 1;
  copy.runs[0].robotId = 'robot-02';
  assert.throws(() => validateRecords(copy), /exact snapshot/);
});
test('record validation rejects invalid fields, metadata, provenance, duplicate IDs and impossible dates', () => {
  validateRecords(demoRecords);
  const mutations = [
    d => { delete d.snapshots[0].values.model; },
    d => { d.snapshots[0].values.model = { state:'unknown', reason:'' }; },
    d => { d.snapshots[0].values.software.value.dirty = 'false'; },
    d => { d.snapshots[0].provenance.hardware.recordedAt = '2026-08-01T00:00:00Z'; },
    d => { d.runs[0].at = '2026-02-30T09:00:00Z'; },
    d => { d.runs[0].successfulPicks = 11; },
    d => { d.snapshots[0].schemaVersion = 2; },
    d => { d.runs.push(d.runs[0]); },
    d => { d.snapshots.push(d.snapshots[0]); },
  ];
  for (const mutate of mutations) { const copy = structuredClone(demoRecords); mutate(copy); assert.throws(() => validateRecords(copy)); }
});
