import { compareRuns, fields, hardwareStale, snapshotFor } from '../demo/records.ts';
import type { Records } from '../demo/records.ts';
import { compareCustom } from './custom.ts';

export const investigationStates = ['investigating', 'hypothesis', 'confirmed-by-engineer', 'unresolved'] as const;
export type Investigation = {
  id: string; revision: number; runId: string; baselineId: string;
  state: typeof investigationStates[number]; author: string; recordedAt: string;
  note: string; evidenceNote: string; retestId: string;
};
export function investigationComparison(records: Records, baselineId: string, runId: string) {
  const baseline = records.runs.find(r => r.id === baselineId), target = records.runs.find(r => r.id === runId);
  if (!baseline || !target) throw new Error('Investigation: both run references must exist.');
  const before = snapshotFor(records, baseline), after = snapshotFor(records, target);
  const core = compareRuns(records, baseline, target), custom = compareCustom(before, after);
  return { baseline, target, before, after, rows: [...core.rows, ...custom.rows], warnings: [...core.warnings, ...custom.warnings] };
}
export function suggestedBaseline(records: Records, runId: string) {
  const target = records.runs.find(r => r.id === runId);
  if (!target) return undefined;
  return records.runs.filter(r => r.robotId === target.robotId && r.outcome === 'success' && r.at < target.at)
    .sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id))
    .find(r => investigationComparison(records, r.id, runId).warnings.length === 0);
}
export function validateInvestigations(value: unknown, records: Records): asserts value is Investigation[] {
  const fail = (message: string): never => { throw new Error(`Investigations: ${message}`); };
  if (!Array.isArray(value) || value.length > 1000) fail('expected at most 1,000 revisions.');
  const latest = new Map<string, Investigation>();
  const keys = ['id','revision','runId','baselineId','state','author','recordedAt','note','evidenceNote','retestId'];
  for (const raw of value as unknown[]) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(k => !keys.includes(k))) fail('unsupported fields.');
    const e = raw as Investigation;
    if (typeof e.id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(e.id)) fail('use a lowercase UUID identity.');
    for (const k of ['runId','baselineId','author','note'] as const) if (typeof e[k] !== 'string' || !e[k].trim() || e[k].length > (k === 'note' ? 2048 : 512)) fail('run, baseline, author and note are required and bounded.');
    for (const k of ['evidenceNote','retestId'] as const) if (typeof e[k] !== 'string' || e[k].length > (k === 'evidenceNote' ? 2048 : 120)) fail('invalid evidence or retest reference.');
    if (!investigationStates.includes(e.state)) fail('unsupported state.');
    if (typeof e.recordedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(e.recordedAt) || !Number.isFinite(Date.parse(e.recordedAt)) || new Date(e.recordedAt).toISOString().replace('.000Z','Z') !== e.recordedAt) fail('use a real UTC recording time.');
    const prior = latest.get(e.id);
    if (!Number.isSafeInteger(e.revision) || e.revision !== (prior?.revision ?? 0) + 1) fail('revisions must be contiguous and ordered.');
    if (prior && (prior.runId !== e.runId || prior.baselineId !== e.baselineId || prior.recordedAt > e.recordedAt)) fail('keep the original run/baseline and chronological history; start a new investigation to change them.');
    const {baseline, target} = investigationComparison(records, e.baselineId, e.runId);
    if (baseline.robotId !== target.robotId || baseline.outcome !== 'success' || baseline.at >= target.at) fail('choose an earlier successful run for the same robot.');
    if (e.recordedAt < target.at) fail('recording time cannot precede the target run.');
    if (e.retestId) {
      const retest = records.runs.find(r => r.id === e.retestId);
      if (!retest || retest.robotId !== target.robotId || retest.at <= target.at || retest.at > e.recordedAt) fail('retest must reference a later run of this robot observed by the recording time.');
    }
    if (e.state === 'confirmed-by-engineer' && !e.evidenceNote.trim() && !e.retestId) fail('confirmation requires an evidence note or retest reference.');
    latest.set(e.id,e);
  }
}
export function investigationReport(records: Records, history: Investigation[], id: string, synthetic: boolean) {
  validateInvestigations(history,records);
  const revisions = history.filter(e => e.id === id), latest = revisions.at(-1);
  if (!latest) throw new Error('Investigation not found.');
  const comparison = investigationComparison(records,latest.baselineId,latest.runId);
  const retests = [...new Set(revisions.map(e=>e.retestId).filter(Boolean))].map(id=>records.runs.find(r=>r.id===id)!);
  const evidence = [comparison.baseline, comparison.target, ...retests].map(run => {
    const snapshot = snapshotFor(records,run);
    return {run, snapshot, staleManualHardware: hardwareStale(snapshot,run), unavailableCoreEvidence: fields.filter(([key]) => !snapshot.provenance[key].available).map(([key]) => key), unavailableCustomEvidence:(snapshot.custom ?? []).filter(f=>!f.provenance.available).map(f=>f.id)};
  });
  return {format:'unify-investigation-report',version:1,synthetic,disclaimer:'Recorded differences do not prove causation. Conclusions are reported by the named engineer; evidence availability is not independently verified. A retest reference alone does not establish success or comparable conditions.',investigation:latest,history:revisions,comparison:{rows:comparison.rows,warnings:comparison.warnings},evidence,retests:retests.map(run=>({runId:run.id,outcome:run.outcome,comparisonToBaseline:investigationComparison(records,latest.baselineId,run.id).warnings}))};
}
