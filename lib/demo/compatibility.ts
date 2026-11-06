import type { Snapshot } from './records.ts';
export type Combination = { firmware: string; calibration: string; model: string; procedure: string; hardware: string; object: string };
export const compatibilityRule = Object.freeze({
  id: 'SYN-RULE-001', revision: 1, author: 'Demo test engineer', recordedAt: '2026-09-01T14:00:00Z',
  combination: Object.freeze({ firmware: 'gripper-fw-1.9', calibration: 'camera-cal-08', model: 'pick-policy-v4', procedure: 'pick-v2', hardware: 'G-02 / B', object: 'Pick block-A' }),
  finding: 'Invented constraint: this combination uses an incompatible gripper coordinate convention in the block-A picking procedure.',
  evidence: 'SYN-EVIDENCE-001 — invented bench-check reference; underlying evidence unavailable',
});
export function assessCombination(combination: Partial<Combination>): 'Synthetic known-bad match' | 'Not assessed' | 'Insufficient information' {
  const keys = Object.keys(compatibilityRule.combination) as (keyof Combination)[];
  if (keys.some(key => !combination[key])) return 'Insufficient information';
  return keys.every(key => combination[key] === compatibilityRule.combination[key]) ? 'Synthetic known-bad match' : 'Not assessed';
}
export function combinationFrom(snapshot: Snapshot): Partial<Combination> {
  const result: Partial<Combination> = {};
  for (const key of ['firmware','calibration','model','procedure','object'] as const) {
    const field = snapshot.values[key];
    if (field.state === 'known' && typeof field.value === 'string') result[key] = field.value;
  }
  const h = snapshot.values.hardware;
  if (h.state === 'known' && typeof h.value === 'object' && !Array.isArray(h.value) && typeof h.value.component === 'string' && typeof h.value.revision === 'string') result.hardware = `${h.value.component} / ${h.value.revision}`;
  return result;
}
