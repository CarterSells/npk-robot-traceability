import test from 'node:test';
import assert from 'node:assert/strict';
import { compatibilityRule, assessCombination, combinationFrom } from '../lib/demo/compatibility.ts';
import { demoRecords } from '../lib/demo/fixtures.ts';
import { snapshotFor } from '../lib/demo/records.ts';
test('synthetic constraint matches only its full declared scope', () => {
  const combo = compatibilityRule.combination;
  assert.equal(assessCombination(combo), 'Synthetic known-bad match');
  for (const key of Object.keys(combo)) {
    assert.equal(assessCombination({ ...combo, [key]:'different' }), 'Not assessed');
    assert.equal(assessCombination({ ...combo, [key]:undefined }), 'Insufficient information');
  }
});
test('covered, uncovered, and incomplete fixture combinations remain distinct', () => {
  for (const [id, expected] of [['run-043','Synthetic known-bad match'],['run-042','Not assessed'],['run-045','Insufficient information'],['run-101','Insufficient information']]) {
    const run = demoRecords.runs.find(r => r.id === id);
    assert.equal(assessCombination(combinationFrom(snapshotFor(demoRecords, run))), expected);
  }
});
