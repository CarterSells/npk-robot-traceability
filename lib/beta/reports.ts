import {machineId} from './machines.ts';
import {projectAttempt, type Attempt, type StoredLifecycleEvent} from './lifecycle.ts';

export function exactReport(v:unknown,keys:string[]):asserts v is Record<string,unknown>{
 if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))throw Error('Missing or unsupported report fields.');
}
export function reportText(v:unknown,max=500){if(typeof v!=='string'||!v.trim()||v.length>max)throw Error('Missing or oversized report text.');return v;}
export function reportTime(v:unknown){const s=reportText(v,24);if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(s)||!Number.isFinite(Date.parse(s))||new Date(s).toISOString()!==s)throw Error('Use a valid UTC timestamp with milliseconds.');return s;}
export type ReportSelection={report_id:string;project_id:string;expected_revision:number;period:{start:string;end:string};attempt_ids:string[];metrics:string[];conclusion:string|null;correction_reason:string|null};
export function reportSelection(v:unknown):ReportSelection{
 exactReport(v,['report_id','project_id','expected_revision','period','attempt_ids','metrics','conclusion','correction_reason']);
 exactReport(v.period,['start','end']);
 const start=reportTime(v.period.start),end=reportTime(v.period.end);
 if(start>=end)throw Error('Reporting period must end after it starts.');
 if(!Number.isSafeInteger(v.expected_revision)||Number(v.expected_revision)<0)throw Error('Use the prior report revision, or zero for a new report.');
 if(!Array.isArray(v.attempt_ids)||v.attempt_ids.length<1||v.attempt_ids.length>25||new Set(v.attempt_ids).size!==v.attempt_ids.length)throw Error('Select 1–25 distinct execution attempts.');
 if(!Array.isArray(v.metrics)||v.metrics.length>10||new Set(v.metrics).size!==v.metrics.length||v.metrics.some(m=>typeof m!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(m)))throw Error('Select at most ten distinct measurement names.');
 const correction_reason=Number(v.expected_revision)>0?reportText(v.correction_reason):null;
 if(Number(v.expected_revision)===0&&v.correction_reason!==null)throw Error('A first report is not a correction.');
 return {report_id:machineId(v.report_id),project_id:machineId(v.project_id),expected_revision:Number(v.expected_revision),period:{start,end},attempt_ids:v.attempt_ids.map(machineId),metrics:v.metrics as string[],conclusion:v.conclusion===null?null:reportText(v.conclusion),correction_reason};
}
type Source={attempt:Attempt;project_id:string;created_at:string;events:(StoredLifecycleEvent&{archive_id:number})[]};
export function buildReport(selection:ReportSelection,sources:Source[]){
 if(sources.length!==selection.attempt_ids.length)throw Error('Selected execution evidence is incomplete.');
 const cutoffs:Record<string,number>=Object.create(null);
 const runs=selection.attempt_ids.map(id=>{
  const source=sources.find(s=>s.attempt.attempt_id===id);
  if(!source||source.project_id!==selection.project_id||source.created_at<selection.period.start||source.created_at>=selection.period.end)throw Error('Execution is outside the selected project or recorded-time period.');
  const p=projectAttempt(source.attempt,source.events.map(({archive_id:_,...event})=>event));
  cutoffs[id]=Math.max(0,...source.events.map(e=>e.archive_id));
  const measurement=(name:string)=>{
   const value=p.measurements[name];
   // Deliberately omit raw observation/correction reasons and evidence URLs.
   return value?{name,state:value.state,value:value.value,unit:value.unit}:{name,state:'unknown',value:null,unit:null};
  };
  return {attempt_id:id,job_id:source.attempt.job_id,robot_id:source.attempt.robot_id,
   snapshot:{id:source.attempt.snapshot_id,revision:source.attempt.snapshot_revision},
   reality:source.attempt.reality,method:source.attempt.method,outcome:p.state,
   duration:measurement('duration'),measurements:selection.metrics.filter(m=>m!=='duration').map(measurement),
   evidence:{completion_observed:p.completion_observed,uncertainty:p.warnings.length>0,selected_measurements_known:selection.metrics.filter(m=>p.measurements[m]?.state==='known').length,selected_measurements_total:selection.metrics.length},
  };
 });
 return {selection,cutoffs,content:{schema_version:1,period:{...selection.period,basis:'attempt_recorded_at'},runs,correction_reason:selection.correction_reason,
  engineer_conclusion:selection.conclusion===null?null:{text:selection.conclusion,method:'explicitly published engineer statement'},
  model_assessment:{state:'unavailable',reason:'No validated predictive model is active.'}}};
}
export function validatePublishedReport(v:unknown){
 exactReport(v,['schema_version','period','runs','engineer_conclusion','model_assessment','report_id','revision','previous_revision','project_id','client_id','generated_at','correction_reason']);
 if(v.schema_version!==1||!Number.isSafeInteger(v.revision)||Number(v.revision)<1||v.previous_revision!==(Number(v.revision)===1?null:Number(v.revision)-1))throw Error('Invalid report revision.');
 machineId(v.report_id);machineId(v.project_id);machineId(v.client_id);reportTime(v.generated_at);
 if(v.revision===1){if(v.correction_reason!==null)throw Error('First revision cannot correct a report.');}else reportText(v.correction_reason);
 exactReport(v.period,['start','end','basis']);reportTime(v.period.start);reportTime(v.period.end);
 if(v.period.basis!=='attempt_recorded_at'||String(v.period.start)>=String(v.period.end))throw Error('Invalid report period.');
 if(!Array.isArray(v.runs)||!v.runs.length||v.runs.length>25)throw Error('Invalid report runs.');
 for(const run of v.runs){
  exactReport(run,['attempt_id','job_id','robot_id','snapshot','reality','method','outcome','duration','measurements','evidence']);
  machineId(run.attempt_id);machineId(run.job_id);reportText(run.robot_id,120);
  exactReport(run.snapshot,['id','revision']);reportText(run.snapshot.id,120);if(!Number.isSafeInteger(run.snapshot.revision)||Number(run.snapshot.revision)<1)throw Error('Invalid snapshot revision.');
  if(!['real','simulation','synthetic'].includes(String(run.reality))||!['manual','collector'].includes(String(run.method))||!['requested','queued','running','succeeded','failed','cancelled','timed-out','unknown'].includes(String(run.outcome)))throw Error('Invalid report evidence.');
  if(!Array.isArray(run.measurements)||run.measurements.length>10)throw Error('Invalid measurements.');
  for(const m of [run.duration,...run.measurements]){
   exactReport(m,['name','state','value','unit']);reportText(m.name,120);
   if(!['known','unknown','not-applicable'].includes(String(m.state))||(m.state==='known'?(typeof m.value!=='number'||!Number.isFinite(m.value)||m.unit===null):m.value!==null))throw Error('Invalid measurement state.');
   if(m.unit!==null)reportText(m.unit,40);
  }
  exactReport(run.evidence,['completion_observed','uncertainty','selected_measurements_known','selected_measurements_total']);
  if(typeof run.evidence.completion_observed!=='boolean'||typeof run.evidence.uncertainty!=='boolean'||!Number.isSafeInteger(run.evidence.selected_measurements_known)||!Number.isSafeInteger(run.evidence.selected_measurements_total)||Number(run.evidence.selected_measurements_known)<0||Number(run.evidence.selected_measurements_total)>10||Number(run.evidence.selected_measurements_known)>Number(run.evidence.selected_measurements_total))throw Error('Invalid completeness.');
 }
 if(v.engineer_conclusion!==null){exactReport(v.engineer_conclusion,['text','method']);reportText(v.engineer_conclusion.text);if(v.engineer_conclusion.method!=='explicitly published engineer statement')throw Error('Invalid conclusion provenance.');}
 exactReport(v.model_assessment,['state','reason']);if(v.model_assessment.state!=='unavailable'||v.model_assessment.reason!=='No validated predictive model is active.')throw Error('Unvalidated predictions cannot be published.');
 return v;
}
