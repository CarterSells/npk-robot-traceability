import { fields, validateRecords } from './records.ts';
import type { Field, FieldKey, Provenance, Records, Snapshot, Value } from './records.ts';

const known = (value: Value): Field => ({ state: 'known', value });
const unknown = (reason: string): Field => ({ state: 'unknown', reason });
function snapshot(id: string, hour: string, changes: Partial<Record<FieldKey, Field>> = {}, robotId = 'robot-01'): Snapshot {
  const observedAt = `2026-09-01T${hour}:00:00Z`;
  const provenance = Object.fromEntries(fields.map(([key]) => [key, {
    source: key === 'hardware' ? 'Synthetic operator manifest' : 'Synthetic test worksheet',
    method: key === 'hardware' ? 'Manual hardware report' : 'Manually transcribed demo metadata',
    author: 'Demo operator', observedAt, recordedAt: `2026-09-01T${hour}:02:00Z`,
    evidence: `synthetic:${id}:${key}`, available: false,
  }])) as Record<FieldKey, Provenance>;
  return { id, revision: 1, schemaVersion: 1, robotId, hardwareConfirmedAt: observedAt, provenance, values: {
    hardware: known({ component: 'G-01', revision: 'A' }),
    software: known({ commit: 'a31c9e2'.padEnd(40, '0'), dirty: false }),
    firmware: known('gripper-fw-1.8'), model: known('pick-policy-v3'), lineage: known('teleop-block-A-v12'),
    calibration: known('camera-cal-07'), gripForce: unknown('Force was not recorded'),
    procedure: known('pick-v2'), object: known('Pick block-A'),
    conditions: known({ speed_m_s: 0.25, ambient_C: 22 }), ...changes,
  } };
}
const first = snapshot('snap-042', '09');
const failed = snapshot('snap-043', '10', {
  hardware: known({ component: 'G-02', revision: 'B' }),
  software: known({ commit: 'f72b4d1'.padEnd(40, '0'), dirty: false }),
  calibration: known('camera-cal-08'),
  firmware: known('gripper-fw-1.9'), model: known('pick-policy-v4'), lineage: known('teleop-block-A-v13'),
});
const different = snapshot('snap-044', '11', { procedure: known('pick-v3'), object: known('Pick block-B'), conditions: known({ speed_m_s: 0.4, ambient_C: 28 }) });
const incomplete = snapshot('snap-045', '12', { hardware: unknown('No new hardware confirmation'), calibration: unknown('Calibration record missing'), lineage: unknown('Dataset identity was not recorded'), conditions: unknown('Ambient temperature and speed missing') });
incomplete.hardwareConfirmedAt = '2026-08-29T09:00:00Z';
incomplete.provenance.hardware.observedAt = incomplete.hardwareConfirmedAt;
const second = snapshot('snap-101', '09', { model: { state: 'not-applicable', reason: 'Scripted picking without a learned model' }, lineage: { state: 'not-applicable', reason: 'No trained model in this procedure' } }, 'robot-02');

export const demoRecords: Records = {
  robots: [{ id: 'robot-01', name: 'Robot 01', task: 'Picking · Cell 01' }, { id: 'robot-02', name: 'Robot 02', task: 'Scripted picking · Cell 02' }, { id: 'robot-03', name: 'Robot 03', task: 'Machine tending · No recorded runs' }],
  snapshots: [first, failed, different, incomplete, second],
  runs: [
    { id: 'run-042', robotId: 'robot-01', snapshotId: first.id, snapshotRevision: 1, at: '2026-09-01T09:05:00Z', outcome: 'success', successfulPicks: 10, attemptedPicks: 10 },
    { id: 'run-043', robotId: 'robot-01', snapshotId: failed.id, snapshotRevision: 1, at: '2026-09-01T10:05:00Z', outcome: 'failure', successfulPicks: 4, attemptedPicks: 10 },
    { id: 'run-044', robotId: 'robot-01', snapshotId: different.id, snapshotRevision: 1, at: '2026-09-01T11:05:00Z', outcome: 'success', successfulPicks: 10, attemptedPicks: 10 },
    { id: 'run-045', robotId: 'robot-01', snapshotId: incomplete.id, snapshotRevision: 1, at: '2026-09-01T12:05:00Z', outcome: 'failure', successfulPicks: 3, attemptedPicks: 10 },
    { id: 'run-101', robotId: 'robot-02', snapshotId: second.id, snapshotRevision: 1, at: '2026-09-01T09:05:00Z', outcome: 'success', successfulPicks: 10, attemptedPicks: 10 },
  ],
};
validateRecords(demoRecords);
function freeze(value: object): void { Object.values(value).forEach(v => { if (v && typeof v === 'object') freeze(v); }); Object.freeze(value); }
freeze(demoRecords);
