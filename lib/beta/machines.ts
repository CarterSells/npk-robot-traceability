import { appendCapture, emptyBundle, parseBundle } from '../local/records.ts';
import { validateAttempt, validateLifecycleEvent } from './lifecycle.ts';

export const EVENT_BYTES = 2 * 1024 * 1024;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function machineId(value: unknown): string {
  if (typeof value !== 'string' || !uuid.test(value)) throw Error('Use a lowercase UUID.');
  return value;
}
function exact(value: unknown, keys: string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !keys.includes(k)) || keys.some(k => !(k in value))) throw Error('Missing or unsupported event fields.');
}
export function validateMachineEvent(value: unknown) {
  exact(value, ['event_id','schema_version','run_id','source_identity','source_sequence','observed_at','event_type','payload']);
  const event_id = machineId(value.event_id), source_identity = machineId(value.source_identity);
  if (value.schema_version !== 1 || !['run.recorded','execution.recorded'].includes(String(value.event_type))) throw Error('Use schema_version 1 and a supported event type.');
  if (!Number.isSafeInteger(value.source_sequence) || Number(value.source_sequence) < 0) throw Error('source_sequence must be a nonnegative safe integer, persisted across restarts.');
  if (typeof value.observed_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.observed_at) || !Number.isFinite(Date.parse(value.observed_at)) || new Date(value.observed_at).toISOString() !== value.observed_at) throw Error('observed_at must be a valid UTC timestamp with milliseconds.');
  if(value.event_type==='execution.recorded'){
    exact(value.payload,['attempt','evidence']);
    const attempt=validateAttempt(value.payload.attempt);
    exact(value.payload.evidence,['kind','payload','correction_of','reason']);
    const evidence=validateLifecycleEvent({event_id,source_identity,source_sequence:value.source_sequence,observed_at:value.observed_at,...value.payload.evidence});
    if(attempt.attempt_id!==value.run_id||attempt.source_identity!==source_identity||attempt.method!=='collector')throw Error('Execution envelope must match the collector attempt and source identity.');
    return {event_id,schema_version:1,run_id:attempt.attempt_id,source_identity,source_sequence:evidence.source_sequence,observed_at:evidence.observed_at,event_type:'execution.recorded',payload:{attempt,evidence}};
  }
  exact(value.payload, ['capture']);
  let capture;
  try {
    capture = parseBundle(JSON.stringify(value.payload.capture));
    appendCapture(emptyBundle(), capture);
  } catch { throw Error('payload.capture must be one approved capture with its exact snapshot; validate it with the local record validator.'); }
  if (capture.records.runs.length !== 1 || capture.records.runs[0].id !== value.run_id) throw Error('run_id must match the single captured run.');
  if (Date.parse(capture.records.runs[0].at) !== Date.parse(value.observed_at)) throw Error('observed_at must match the captured run time.');
  return {event_id, schema_version:1, run_id:value.run_id as string, source_identity,
    source_sequence:value.source_sequence as number, observed_at:value.observed_at, event_type:'run.recorded', payload:{capture}};
}

export function machineAdminInput(value: Record<string, unknown>) {
  const action = value.action;
  if (!['create','rotate','revoke','revoke_token'].includes(String(action))) throw Error('Choose create, rotate, revoke or revoke_token.');
  if (action === 'revoke' || action === 'revoke_token') return {action, id:machineId(value.id)};
  const expires_days = Number(value.expires_days);
  if (!Number.isInteger(expires_days) || expires_days < 1 || expires_days > 90) throw Error('Expiry must be 1–90 days.');
  if (action === 'rotate') {
    const overlap_minutes = Number(value.overlap_minutes);
    if (!Number.isInteger(overlap_minutes) || overlap_minutes < 0 || overlap_minutes > 60) throw Error('Rotation overlap must be 0–60 minutes.');
    return {action,id:machineId(value.id),expires_days,overlap_minutes};
  }
  const name = value.name, robot_id = value.robot_id, kind = value.kind;
  if (typeof name !== 'string' || !name.trim() || name.length > 120) throw Error('Enter a name of at most 120 characters.');
  if (typeof robot_id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(robot_id)) throw Error('Choose a saved robot.');
  if (!['collector','gateway','api_client'].includes(String(kind))) throw Error('Choose a supported identity kind.');
  const per_minute = Number(value.per_minute);
  if (!Number.isInteger(per_minute) || per_minute < 1 || per_minute > 600) throw Error('Request limit must be 1–600 per minute.');
  if (value.capability !== 'events:write' && value.capability !== 'receipts:read') throw Error('Choose events:write or receipts:read.');
  return {action,name:name.trim(),robot_id,kind,project_id:machineId(value.project_id),expires_days,per_minute,
    capabilities:value.capability === 'events:write' ? ['events:write','receipts:read'] : ['receipts:read']};
}
