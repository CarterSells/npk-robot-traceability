import { machineId } from './machines.ts';

export const lifecycleStates = ['requested','queued','running','succeeded','failed','cancelled','timed-out','unknown'] as const;
export type LifecycleState = typeof lifecycleStates[number];
type EvidenceValue = {state:'known';value:string} | {state:'unknown'|'not-applicable';reason:string};
export type Attempt = {
  job_id:string; attempt_id:string; retry_of:string|null; robot_id:string;
  snapshot_id:string; snapshot_revision:number; source_identity:string;
  procedure:EvidenceValue; procedure_version:EvidenceValue; task:EvidenceValue; environment:EvidenceValue;
  components:EvidenceValue; reality:'real'|'simulation'|'synthetic'; method:'manual'|'collector';
};
type StatePayload = {state:LifecycleState};
type Measurement = {name:string;state:'known'|'unknown'|'not-applicable';value:number|null;unit:string;reason:string|null};
type Label = {name:string;value:string;evidence:string};
type Component = {component_id:string;action:'installed'|'removed'|'maintained'|'serviced';evidence:string;hours:number|null;cycles:number|null};
type Step = {step_id:string;state:LifecycleState};
export type LifecycleEvent = {
  event_id:string; source_identity:string; source_sequence:number; observed_at:string;
  kind:'state'|'acknowledged'|'measurement'|'label'|'component'|'step';
  payload:StatePayload|Measurement|Label|Component|Step|Record<string,never>;
  correction_of:string|null; reason:string|null;
};
export type StoredLifecycleEvent = LifecycleEvent & {received_at:string;author:string};

function exact(v:unknown, keys:string[]): asserts v is Record<string,unknown> {
  if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))throw Error('Missing or unsupported lifecycle fields.');
}
function text(v:unknown,max=240):string {
  if(typeof v!=='string'||!v.trim()||v.length>max)throw Error('Missing or oversized lifecycle text.');
  return v;
}
function identifier(v:unknown):string {
  const s=text(v,120);if(!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(s))throw Error('Invalid record identifier.');return s;
}
function integer(v:unknown,min=0):number {
  if(typeof v!=='number'||!Number.isSafeInteger(v)||v<min)throw Error('Expected a nonnegative safe integer.');return v;
}
function nonnegative(v:unknown):number|null {
  if(v===null)return null;if(typeof v!=='number'||!Number.isFinite(v)||v<0)throw Error('Expected an observed nonnegative number or null.');return v;
}
function timestamp(v:unknown):string {
  const s=text(v,24);if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(s)||!Number.isFinite(Date.parse(s))||new Date(s).toISOString()!==s)throw Error('Use a valid UTC timestamp with milliseconds.');return s;
}
function state(v:unknown):LifecycleState {
  if(!lifecycleStates.includes(v as LifecycleState))throw Error('Invalid lifecycle state.');return v as LifecycleState;
}
function evidence(v:unknown):EvidenceValue {
  if(v&&typeof v==='object'&&'state' in v&&v.state==='known'){exact(v,['state','value']);return {state:'known',value:text((v as Record<string,unknown>).value)};}
  exact(v,['state','reason']);if(v.state!=='unknown'&&v.state!=='not-applicable')throw Error('Invalid evidence state.');
  return {state:v.state,reason:text(v.reason)};
}
export function validateAttempt(v:unknown):Attempt {
  exact(v,['job_id','attempt_id','retry_of','robot_id','snapshot_id','snapshot_revision','source_identity','procedure','procedure_version','task','environment','components','reality','method']);
  if(!['real','simulation','synthetic'].includes(String(v.reality))||!['manual','collector'].includes(String(v.method)))throw Error('Declare reality and collection method separately.');
  const attempt_id=machineId(v.attempt_id),retry_of=v.retry_of===null?null:machineId(v.retry_of);
  if(attempt_id===retry_of)throw Error('A retry must reference a different attempt.');
  return {job_id:machineId(v.job_id),attempt_id,retry_of,robot_id:identifier(v.robot_id),snapshot_id:identifier(v.snapshot_id),snapshot_revision:integer(v.snapshot_revision,1),source_identity:machineId(v.source_identity),
    procedure:evidence(v.procedure),procedure_version:evidence(v.procedure_version),task:evidence(v.task),environment:evidence(v.environment),components:evidence(v.components),reality:v.reality as Attempt['reality'],method:v.method as Attempt['method']};
}
export function validateLifecycleEvent(v:unknown):LifecycleEvent {
  exact(v,['event_id','source_identity','source_sequence','observed_at','kind','payload','correction_of','reason']);
  const event_id=machineId(v.event_id),source_identity=machineId(v.source_identity),source_sequence=integer(v.source_sequence),observed_at=timestamp(v.observed_at);
  const correction_of=v.correction_of===null?null:machineId(v.correction_of);
  if(correction_of===event_id)throw Error('An event cannot correct itself.');
  const reason=correction_of?text(v.reason):null;if(!correction_of&&v.reason!==null)throw Error('Correction reason requires a prior event.');
  const p=v.payload;let payload:LifecycleEvent['payload'];
  switch(v.kind){
    case 'state':exact(p,['state']);payload={state:state(p.state)};break;
    case 'acknowledged':exact(p,[]);if(correction_of)throw Error('Acknowledgements cannot correct evidence.');payload={};break;
    case 'step':exact(p,['step_id','state']);payload={step_id:identifier(p.step_id),state:state(p.state)};break;
    case 'measurement':
      exact(p,['name','state','value','unit','reason']);
      if(!['known','unknown','not-applicable'].includes(String(p.state)))throw Error('Invalid measurement evidence state.');
      if(p.state==='known'?(typeof p.value!=='number'||!Number.isFinite(p.value)||p.reason!==null):(p.value!==null||typeof p.reason!=='string'||!p.reason.trim()))throw Error('Missing measurements must have a reason, never an invented zero.');
      payload={name:identifier(p.name),state:p.state as Measurement['state'],value:p.value as number|null,unit:text(p.unit,40),reason:p.reason===null?null:text(p.reason)};
      if(['duration','downtime'].includes(payload.name)&&(payload.unit!=='s'||(payload.value!==null&&payload.value<0)))throw Error('Duration and downtime use nonnegative seconds.');
      break;
    case 'label':exact(p,['name','value','evidence']);payload={name:identifier(p.name),value:text(p.value),evidence:text(p.evidence,500)};break;
    case 'component':
      exact(p,['component_id','action','evidence','hours','cycles']);
      if(!['installed','removed','maintained','serviced'].includes(String(p.action)))throw Error('Invalid component action.');
      payload={component_id:identifier(p.component_id),action:p.action as Component['action'],evidence:text(p.evidence,500),hours:nonnegative(p.hours),cycles:p.cycles===null?null:integer(p.cycles)};break;
    default:throw Error('Unsupported lifecycle event kind.');
  }
  return {event_id,source_identity,source_sequence,observed_at,kind:v.kind as LifecycleEvent['kind'],payload,correction_of,reason};
}

const terminal=new Set<LifecycleState>(['succeeded','failed','cancelled','timed-out']);
const allowed:Record<LifecycleState,readonly LifecycleState[]>={
  requested:['requested','queued','running','succeeded','failed','cancelled','timed-out','unknown'],
  queued:['queued','running','succeeded','failed','cancelled','timed-out','unknown'],
  running:['running','succeeded','failed','cancelled','timed-out','unknown'],
  unknown:lifecycleStates,succeeded:['succeeded'],failed:['failed'],cancelled:['cancelled'],
  // A timeout is uncertainty about completion; a later result may resolve it.
  'timed-out':['timed-out','succeeded','failed','cancelled','unknown'],
};
export function projectAttempt(attempt:Attempt, raw:StoredLifecycleEvent[], knownAt?:string) {
  validateAttempt(attempt);if(knownAt!==undefined)timestamp(knownAt);
  const events=raw.filter(e=>knownAt===undefined||e.received_at<=knownAt).map(e=>{
    timestamp(e.received_at);text(e.author);const validated=validateLifecycleEvent(eWithoutStorage(e));
    if(validated.source_identity!==attempt.source_identity)throw Error('Attempt source identity mismatch.');
    return {...validated,received_at:e.received_at,author:e.author};
  }).sort((a,b)=>a.source_sequence-b.source_sequence);
  const ids=new Set<string>(),sequences=new Set<number>(),active=new Map<string,StoredLifecycleEvent>(),positions=new Map<string,number>(),warnings:string[]=[];
  let unresolved=false;
  for(const e of events){
    if(ids.has(e.event_id)||sequences.has(e.source_sequence))throw Error('Duplicate event ID or source sequence in stored history.');
    ids.add(e.event_id);sequences.add(e.source_sequence);
    if(e.correction_of){
      const prior=active.get(e.correction_of);
      if(!prior||prior.kind!==e.kind){warnings.push(`Unresolved correction ${e.event_id}.`);unresolved=true;continue;}
      // Corrections may fix a value, not silently rename the evidence being corrected.
      let identityMismatch=false;
      for(const key of ['name','step_id','component_id'] as const){
        const before=prior.payload as Record<string,unknown>,after=e.payload as Record<string,unknown>;
        if(key in before&&(!(key in after)||before[key]!==after[key]))identityMismatch=true;
      }
      if(identityMismatch){warnings.push(`Correction changes evidence identity: ${e.event_id}.`);unresolved=true;continue;}
      active.delete(e.correction_of);
      positions.set(e.event_id,positions.get(e.correction_of)!);
    }
    else positions.set(e.event_id,e.source_sequence);
    active.set(e.event_id,e);
  }
  let current:LifecycleState='unknown',acknowledged=false,conflict=false;
  const steps:Record<string,LifecycleState>=Object.create(null),measurements:Record<string,Measurement>=Object.create(null),labels:Record<string,Label>=Object.create(null);
  const components:Component[]=[],conflictingLabels=new Set<string>(),conflictingSteps=new Set<string>();
  for(const e of [...active.values()].sort((a,b)=>positions.get(a.event_id)!-positions.get(b.event_id)!)){
    if(e.observed_at>e.received_at)warnings.push(`Observation is ahead of receipt: ${e.event_id}.`);
    if(e.kind==='acknowledged'){acknowledged=true;continue;}
    if(e.kind==='state'){
      const next=(e.payload as StatePayload).state;
      if(!allowed[current].includes(next)){conflict=true;warnings.push(`Conflicting state ${current} → ${next}: ${e.event_id}.`);}
      else current=next;
    }else if(e.kind==='step'){
      const p=e.payload as Step,prior=steps[p.step_id]??'unknown';
      if(!allowed[prior].includes(p.state)){conflictingSteps.add(p.step_id);warnings.push(`Conflicting step ${p.step_id}.`);}
      steps[p.step_id]=conflictingSteps.has(p.step_id)?'unknown':p.state;
    }else if(e.kind==='measurement'){
      const p=e.payload as Measurement,prior=measurements[p.name];
      if(prior){warnings.push(`Multiple uncorrected measurements for ${p.name}${prior.unit!==p.unit?' with inconsistent units':''}.`);measurements[p.name]={...prior,state:'unknown',value:null,reason:'Conflicting observations; append a correction.'};}
      else measurements[p.name]=p;
    }else if(e.kind==='label'){
      const p=e.payload as Label;
      if(labels[p.name]||conflictingLabels.has(p.name)){warnings.push(`Multiple uncorrected labels for ${p.name}.`);conflictingLabels.add(p.name);delete labels[p.name];}
      else labels[p.name]=p;
    }else components.push(e.payload as Component);
  }
  if(conflict||unresolved)current='unknown';
  return {state:current,acknowledged,completion_observed:terminal.has(current)&&current!=='timed-out',steps,measurements,labels,components,warnings,timeline:events};
}
function eWithoutStorage(e:StoredLifecycleEvent):LifecycleEvent {
  const {received_at:_,author:__,...event}=e;return event;
}
