import test from 'node:test';
import assert from 'node:assert/strict';
import { demoRecords } from '../lib/demo/fixtures.ts';
import { compareRuns, snapshotFor } from '../lib/demo/records.ts';
import { addRobot, addHardware, addRun, correctField, emptyBundle, parseBundle, exportBundle, validateBundle, MAX_BYTES } from '../lib/local/records.ts';

const example = () => parseBundle(JSON.stringify({ format:'unify-local', version:1, synthetic:true, records:demoRecords, corrections:[] }));
const timestamp = '2026-10-03T12:00:00Z';
const correction = (b, key = 'calibration') => {
  const s = b.records.snapshots.find(s => s.id === 'snap-043' && s.revision === Math.max(...b.records.snapshots.filter(s => s.id === 'snap-043').map(s => s.revision)));
  return correctField(b, s, key, { state:'known', value:'camera-cal-09' }, { ...s.provenance[key], method:'Manual metadata correction', author:'Synthetic tester', recordedAt:timestamp }, 'Correct transcription');
};
test('untrusted JSON validates structure, allowlists, sizes and field paths without echoing values', () => {
  assert.throws(() => parseBundle('{'), /invalid JSON/);
  assert.throws(() => parseBundle(' '.repeat(MAX_BYTES + 1)), /maximum size/);
  for (const input of [null, [], {}, { format:'unify-local', version:1, synthetic:false, records:null, corrections:[] }]) assert.throws(() => validateBundle(input));
  const mutations = [
    b => { b.records.snapshots[0].values.model = { state:'unknown', reason:'Missing', value:'secret' }; },
    b => { b.records.snapshots[0].values.hardware.value.secret = 'DO-NOT-ECHO'; },
    b => { b.records.snapshots[0].values.conditions.value.token = 'DO-NOT-ECHO'; },
    b => { b.records.snapshots[0].provenance.hardware.method = 'Automatic'; },
    b => { b.records.snapshots[0].hardwareConfirmedAt = '2026-09-01T08:00:00Z'; },
    b => { b.records.snapshots[0].values.model.value = { arbitrary:'data' }; },
    b => { b.records.snapshots[0].values.gripForce = { state:'known', value:-1 }; },
    b => { b.records.snapshots[0].provenance.model.observedAt = '2026-02-30T09:00:00Z'; },
    b => { b.records.snapshots[0].values.software.value.dirty = 'false'; },
    b => { b.records.robots[0].id = '../private'; },
    b => { b.records.runs[0].snapshotRevision = 999; },
    b => { b.records.runs[0].robotId = 'robot-02'; },
    b => { b.records.runs[0].successfulPicks = 100; },
    b => { b.version = 3; },
  ];
  for (const change of mutations) { const b = example(); change(b); assert.throws(() => validateBundle(b), e => !e.message.includes('DO-NOT-ECHO')); }
  const b = example(); b.records.snapshots[0].values.model = { state:'known', value:'' };
  assert.throws(() => validateBundle(b), /snapshots\[0\].values.model.value/);
});
test('corrections append history and never rebind historical runs; export round-trips exactly', () => {
  const before = example(), original = JSON.stringify(before), next = correction(before);
  assert.equal(JSON.stringify(before), original);
  assert.equal(next.records.snapshots.length, before.records.snapshots.length + 1);
  const failed = next.records.runs.find(r => r.id === 'run-043');
  assert.equal(snapshotFor(next.records, failed).revision, 1);
  assert.equal(snapshotFor(next.records, failed).values.calibration.value, 'camera-cal-08');
  assert.deepEqual(parseBundle(exportBundle(next)), next);
  assert.equal(next.corrections[0].priorRevision, 1);
  assert.equal(next.corrections[0].reason, 'Correct transcription');
  assert.throws(() => correctField(next, before.records.snapshots[1], 'model', { state:'unknown', reason:'Missing' }, next.records.snapshots[1].provenance.model, 'Correction'), /latest revision/);
});
test('compact imports cannot create a workspace too large to export', () => {
  const b = example(); b.records.runs = [];
  const template = b.records.snapshots[0];
  b.records.snapshots = [];
  while (Buffer.byteLength(JSON.stringify(b, null, 2)) <= MAX_BYTES) {
    b.records.snapshots.push({ ...structuredClone(template), id:`size-test-${b.records.snapshots.length}` });
  }
  const compact = JSON.stringify(b);
  assert.ok(Buffer.byteLength(compact) < MAX_BYTES);
  assert.throws(() => parseBundle(compact), /export exceeds/);
});
test('import rejects broken, forged and incomplete correction chains', () => {
  const mutations = [
    b => { b.corrections = []; },
    b => { b.corrections[0].priorRevision = 5; },
    b => { b.corrections.push(b.corrections[0]); },
    b => { b.corrections[0].author = 'Someone else'; },
    b => { b.records.snapshots.at(-1).values.model = { state:'known', value:'changed too' }; },
    b => { b.records.snapshots.at(-1).provenance.model.author = 'changed too'; },
    b => { b.records.snapshots = b.records.snapshots.filter(s => s.id !== 'snap-043' || s.revision !== 1); },
    b => { b.corrections[0].recordedAt = '2026-08-01T00:00:00Z'; b.records.snapshots.at(-1).provenance.calibration.recordedAt = b.corrections[0].recordedAt; },
  ];
  for (const mutate of mutations) { const b = correction(example()); mutate(b); assert.throws(() => validateBundle(b)); }
});
test('manual robot to hardware to run works without sample data or a collector', () => {
  const start = emptyBundle();
  const robot = addRobot(start, { id:'arm-1', name:'Test arm', task:'Picking' });
  const hw = addHardware(robot, { id:'setup-1', robotId:'arm-1', component:'G-1', revision:'A', author:'Synthetic tester', observedAt:timestamp, evidence:'No evidence supplied', available:false }, timestamp);
  assert.equal(hw.records.snapshots[0].values.model.state, 'unknown');
  assert.equal(hw.records.snapshots[0].provenance.hardware.method, 'Manual hardware report');
  const run = { id:'run-1', robotId:'arm-1', snapshotId:'setup-1', snapshotRevision:1, at:timestamp, outcome:'success', successfulPicks:10, attemptedPicks:10 };
  const result = addRun(hw, run);
  assert.deepEqual(parseBundle(exportBundle(result)), result);
  assert.deepEqual(start, emptyBundle());
  assert.throws(() => addRun(result, run), /duplicate/);
  assert.throws(() => addHardware(robot, { id:'setup-1', robotId:'arm-1', component:'G-1', revision:'A', author:'Test', observedAt:'2027-01-01T00:00:00Z', evidence:'None', available:false }, timestamp), /observed time/);
});
test('import preserves semantic comparison, missing values, condition warnings and evidence availability', () => {
  const b = example(), runs = b.records.runs;
  const select = id => runs.find(r => r.id === id);
  const result = compareRuns(b.records, select('run-042'), select('run-043'));
  assert.equal(result.rows.filter(r => r.result === 'Changed').length, 6);
  assert.equal(result.rows.find(r => r.key === 'gripForce').result, 'Unknown');
  assert.ok(compareRuns(b.records, select('run-044'), select('run-043')).warnings.length);
  assert.equal(b.records.snapshots[0].provenance.hardware.available, false);
  b.records.snapshots[1].values.conditions.value = { ambient_C:22, speed_m_s:0.25 };
  assert.equal(compareRuns(b.records, select('run-042'), select('run-043')).rows.find(r => r.key === 'conditions').result, 'Unchanged');
});
