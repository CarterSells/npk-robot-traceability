import { machineId } from './machines.ts';

function exact(value: unknown, keys: string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || keys.some(k => !Object.hasOwn(value, k))) throw Error('Missing or unsupported command fields.');
}
function text(value: unknown, max = 240): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw Error('Missing or oversized command text.');
  return value;
}
function localId(value: unknown): string {
  const s = text(value, 120);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(s)) throw Error('Invalid configuration reference.');
  return s;
}
export function commandInput(value: unknown, machine = false): Record<string, unknown> {
  if (!value || typeof value !== 'object' || !('action' in value)) throw Error('Choose a command operation.');
  const v = value as Record<string, unknown>;
  if (v.action === 'list') {
    exact(v, ['action', 'after']);
    return {action: 'list', after: v.after === null ? null : machineId(v.after)};
  }
  if (v.action === 'grant' && !machine) {
    exact(v, ['action', 'machine_id', 'request_enabled', 'dispatch_enabled']);
    if (typeof v.request_enabled !== 'boolean' || typeof v.dispatch_enabled !== 'boolean') throw Error('Declare command permissions explicitly.');
    return {...v, machine_id: machineId(v.machine_id)};
  }
  if (v.action === 'request') {
    exact(v, ['action', 'id', 'correlation_id', 'gateway_id', 'snapshot_id', 'snapshot_revision', 'expires_at', 'kind', 'parameters', 'reality']);
    if (v.kind !== 'simulation.check' || v.reality !== 'simulation') throw Error('Only simulation.check is supported. Physical execution is disabled.');
    exact(v.parameters, ['checks']);
    if (!Number.isSafeInteger(v.parameters.checks) || Number(v.parameters.checks) < 1 || Number(v.parameters.checks) > 10) throw Error('Use 1–10 simulated checks.');
    if (!Number.isSafeInteger(v.snapshot_revision) || Number(v.snapshot_revision) < 1) throw Error('Choose an exact snapshot revision.');
    const expires = text(v.expires_at, 24);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(expires) || !Number.isFinite(Date.parse(expires)) || new Date(expires).toISOString() !== expires) throw Error('Use an exact UTC expiry with milliseconds.');
    return {...v, id: machineId(v.id), correlation_id: machineId(v.correlation_id), gateway_id: machineId(v.gateway_id), snapshot_id: localId(v.snapshot_id)};
  }
  if (['get', ...(machine ? ['dispatch'] : ['approve', 'cancel'])].includes(String(v.action))) {
    exact(v, ['action', 'id']);
    return {...v, id: machineId(v.id)};
  }
  if (v.action === 'resolve' && !machine) {
    exact(v, ['action', 'id', 'outcome', 'evidence']);
    if (!['succeeded', 'failed', 'cancelled', 'not-started'].includes(String(v.outcome))) throw Error('Record the verified simulation outcome.');
    return {...v, id: machineId(v.id), evidence: text(v.evidence, 500)};
  }
  if (v.action === 'report' && machine) {
    exact(v, ['action', 'id', 'event_id', 'state', 'outcome', 'reason', 'observed_at', 'stop_confirmed']);
    if (!['acknowledged', 'executing', 'completed', 'rejected', 'unknown'].includes(String(v.state))) throw Error('Unsupported command state.');
    if (v.state === 'completed' ? !['succeeded', 'failed', 'cancelled'].includes(String(v.outcome)) : v.outcome !== null) throw Error('Completion requires an explicit simulated outcome.');
    if (typeof v.stop_confirmed !== 'boolean' || v.stop_confirmed !== (v.outcome === 'cancelled')) throw Error('Cancellation must separately confirm the simulated stop.');
    const observed = text(v.observed_at, 24);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(observed) || !Number.isFinite(Date.parse(observed)) || new Date(observed).toISOString() !== observed) throw Error('Invalid observation time.');
    return {...v, id: machineId(v.id), event_id: machineId(v.event_id), reason: text(v.reason)};
  }
  throw Error('Unsupported command operation.');
}
