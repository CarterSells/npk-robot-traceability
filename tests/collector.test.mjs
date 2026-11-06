import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { appendCapture, correctField, emptyBundle, exportBundle, parseBundle } from '../lib/local/records.ts';
import { compareRuns } from '../lib/demo/records.ts';

const python = process.env.UNIFY_PYTHON || (existsSync('.tools/python-3.13.7/python.exe') ? resolve('.tools/python-3.13.7/python.exe') : process.platform === 'win32' ? 'python' : 'python3');
function captures() {
  const dir = mkdtempSync(join(tmpdir(), 'unify-synthetic-'));
  try {
    execFileSync(python, ['collector/test_collector.py', '--fixtures', dir]);
    return ['first', 'second'].map(name => parseBundle(readFileSync(join(dir, `${name}.json`), 'utf8')));
  } finally { rmSync(dir, { recursive:true, force:true }); }
}

test('Python handoffs import, append, compare and export without changing exact history', () => {
  const [first, second] = captures();
  const initial = appendCapture(emptyBundle(), first), original = exportBundle(initial);
  const joined = appendCapture(initial, second);
  assert.equal(exportBundle(initial), original);
  assert.equal(joined.records.robots.length, 1);
  assert.equal(joined.records.runs.length, 2);
  assert.deepEqual(appendCapture(joined, first), joined);
  const compared = compareRuns(joined.records, joined.records.runs[0], joined.records.runs[1]);
  assert.equal(compared.rows.find(r => r.key === 'model').result, 'Changed');
  assert.equal(compared.rows.find(r => r.key === 'hardware').result, 'Unknown');
  assert.deepEqual(parseBundle(exportBundle(joined)), joined);
  const snapshot = joined.records.snapshots[0];
  const corrected = correctField(joined, snapshot, 'model', { state:'known', value:'corrected-version' }, { ...snapshot.provenance.model, method:'Manual correction', recordedAt:'2026-10-09T12:05:00Z' }, 'Synthetic correction');
  assert.deepEqual(appendCapture(corrected, first), corrected);
  assert.equal(corrected.records.runs[0].snapshotRevision, 1);
});

test('capture conflicts, mode mixing and full-workspace imports fail atomically', () => {
  const [first, second] = captures();
  const bundle = appendCapture(emptyBundle(), first), before = exportBundle(bundle);
  for (const mutate of [
    b => { b.records.robots[0].name = 'Different name'; },
    b => { b.records.snapshots[0].values.model.value = 'conflicting'; },
    b => { b.records.runs[0].successfulPicks = 1; },
    b => { b.synthetic = false; },
  ]) {
    const bad = structuredClone(first); mutate(bad);
    assert.throws(() => appendCapture(bundle, bad), /conflict|cannot be combined/);
    assert.equal(exportBundle(bundle), before);
  }
  assert.throws(() => appendCapture(bundle, appendCapture(bundle, second)), /expected one robot/);
});
