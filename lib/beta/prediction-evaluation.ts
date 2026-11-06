import {createHash} from 'node:crypto';
import {exactReport,reportTime,reportText} from './reports.ts';
import {machineId} from './machines.ts';
import {capabilities,type Capability} from './prediction-readiness.ts';

const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const text=(v:unknown)=>reportText(v,120);
function number(v:unknown){if(typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>1e12)throw Error('Use a finite bounded numeric label.');return v;}
type Row={attempt_id:string;job_id:string;duplicate_group:string;robot_id:string;snapshot:{id:string;revision:number};decision_at:string;context_recorded_at:string;label_available_at:string|null;label:number|null;censored:boolean};
export function curateDataset(raw:unknown){
 exactReport(raw,['schema_version','org_id','project_id','cohort','target','feature_version','label_version','split_at','evaluated_at','rows']);
 if(raw.schema_version!==1)throw Error('Unsupported dataset version.');
 const org_id=machineId(raw.org_id),project_id=machineId(raw.project_id);
 exactReport(raw.cohort,['procedure','procedure_version','configuration','environment','provenance','reality']);
 const cohort={procedure:text(raw.cohort.procedure),procedure_version:text(raw.cohort.procedure_version),configuration:text(raw.cohort.configuration),environment:text(raw.cohort.environment),provenance:text(raw.cohort.provenance),reality:text(raw.cohort.reality)};
 if(!['real','simulation'].includes(cohort.reality))throw Error('Synthetic records cannot form an eligible dataset.');
 exactReport(raw.target,['capability','metric','unit','horizon_seconds']);
 const capability=raw.target.capability as Capability;if(!capabilities.includes(capability))throw Error('Unknown capability.');
 const target={capability,metric:text(raw.target.metric),unit:text(raw.target.unit),horizon_seconds:raw.target.horizon_seconds===null?null:number(raw.target.horizon_seconds)};
 if(capability==='failure_risk'&&(target.metric!=='confirmed_failure'||target.unit!=='binary'||target.horizon_seconds!==null))throw Error('Risk target must be confirmed_failure/binary at completion.');
 if(capability==='duration'&&(target.metric!=='duration'||target.unit!=='s'||target.horizon_seconds!==null))throw Error('Duration target must use seconds at completion.');
 if(capability==='maintenance'&&(target.horizon_seconds===null||target.horizon_seconds<=0||target.unit!=='binary'))throw Error('Maintenance requires a positive horizon and binary reviewed outcome.');
 if(capability==='quality'&&target.horizon_seconds!==null)throw Error('Quality is measured at completion.');
 const feature_version=text(raw.feature_version),label_version=text(raw.label_version),split_at=reportTime(raw.split_at),evaluated_at=reportTime(raw.evaluated_at);
 if(split_at>=evaluated_at)throw Error('Evaluation must follow the training cutoff.');
 if(!Array.isArray(raw.rows)||raw.rows.length>10000)throw Error('Dataset limit is 10,000 curated rows.');
 const seen=new Set<string>();
 const rows:Row[]=raw.rows.map(r=>{
  exactReport(r,['attempt_id','job_id','duplicate_group','robot_id','snapshot','decision_at','context_recorded_at','label_available_at','label','censored']);
  const attempt_id=machineId(r.attempt_id);if(seen.has(attempt_id))throw Error('Duplicate attempt.');seen.add(attempt_id);
  exactReport(r.snapshot,['id','revision']);if(!Number.isSafeInteger(r.snapshot.revision)||Number(r.snapshot.revision)<1)throw Error('Exact snapshot revision required.');
  const decision_at=reportTime(r.decision_at),context_recorded_at=reportTime(r.context_recorded_at),label_available_at=r.label_available_at===null?null:reportTime(r.label_available_at);
  if(context_recorded_at>decision_at||decision_at>evaluated_at)throw Error('Context must exist at the prediction decision time.');
  if(typeof r.censored!=='boolean')throw Error('Declare censoring.');
  const label=r.label===null?null:number(r.label);
  if((label===null)!==(label_available_at===null)||label_available_at!==null&&(label_available_at<decision_at||label_available_at>evaluated_at))throw Error('Label timing is inconsistent.');
  if(r.censored&&label!==null)throw Error('Censored follow-up cannot be a negative or positive label.');
  if(label!==null&&((['failure_risk','maintenance'].includes(capability)&&![0,1].includes(label))||(capability==='duration'&&label<0)))throw Error('Label violates target definition.');
  return {attempt_id,job_id:machineId(r.job_id),duplicate_group:text(r.duplicate_group),robot_id:text(r.robot_id),snapshot:{id:text(r.snapshot.id),revision:Number(r.snapshot.revision)},decision_at,context_recorded_at,label_available_at,label,censored:r.censored};
 }).sort((a,b)=>a.decision_at.localeCompare(b.decision_at)||a.attempt_id.localeCompare(b.attempt_id));
 const manifest={schema_version:1,org_id,project_id,cohort,target,feature_version,label_version,split_at,evaluated_at,rows};
 return {...manifest,dataset_hash:digest(manifest)};
}
export function evaluateBaseline(raw:unknown){
 const dataset=curateDataset(raw),{rows,target,split_at}=dataset;
 const groupSides=new Map<string,Set<boolean>>();
 for(const r of rows)for(const key of ['job:'+r.job_id,'duplicate:'+r.duplicate_group]){const sides=groupSides.get(key)??new Set();sides.add(r.decision_at<split_at);groupSides.set(key,sides);}
 const eligible=rows.filter(r=>!r.censored&&r.label!==null&&groupSides.get('job:'+r.job_id)!.size===1&&groupSides.get('duplicate:'+r.duplicate_group)!.size===1);
 const train=eligible.filter(r=>r.decision_at<split_at&&r.label_available_at!<split_at),test=eligible.filter(r=>r.decision_at>=split_at);
 const manifest={dataset_hash:dataset.dataset_hash,org_id:dataset.org_id,project_id:dataset.project_id,cohort:dataset.cohort,target,feature_version:dataset.feature_version,label_version:dataset.label_version,algorithm_version:'constant-baseline-v1',evaluated_at:dataset.evaluated_at,split_at,training_attempts:train.map(r=>r.attempt_id),test_attempts:test.map(r=>r.attempt_id),excluded:rows.length-train.length-test.length};
 const unavailable=(state:string,reason:string)=>({...manifest,state,available:false,reason,model:null,metrics:null,registry_status:'candidate',predictions:[]});
 if(!rows.length)return unavailable('collecting_data','No curated rows.');
 if(target.capability==='maintenance')return unavailable('insufficient_labels','Maintenance requires an independently reviewed survival/censoring protocol, exposure and event times. This baseline does not estimate maintenance risk.');
 if(!train.length||!test.length)return unavailable('insufficient_labels','Need eligible earlier training labels and later unseen jobs; boundary-spanning job/duplicate groups are excluded.');
 const labels=train.map(r=>r.label!),actual=test.map(r=>r.label!),risk=target.capability==='failure_risk';
 if(risk&&([labels,actual].some(values=>!values.includes(0)||!values.includes(1))))return unavailable('insufficient_labels','Both success and failure labels are required in training and holdout; rare failures may keep risk unavailable.');
 const sorted=[...labels].sort((a,b)=>a-b),mean=labels.reduce((s,x)=>s+x,0)/labels.length;
 const value=risk?mean:(sorted[Math.floor((sorted.length-1)/2)]+sorted[Math.ceil((sorted.length-1)/2)])/2;
 const interval=risk?null:[sorted[Math.floor((sorted.length-1)*.1)],sorted[Math.ceil((sorted.length-1)*.9)]];
 const model={value,interval,training_count:train.length,real_world_eligible:dataset.cohort.reality==='real',uncertainty:risk?'No calibrated confidence interval; empirical constant risk.':'Empirical training 10th–90th percentile range; not calibrated coverage.'};
 let metrics:Record<string,unknown>;
 if(risk){const positives=actual.filter(x=>x===1).length,predictedPositive=value>=.5;metrics={brier:actual.reduce((s,y)=>s+(value-y)**2,0)/actual.length,calibration:{predicted:value,observed:positives/actual.length,count:actual.length},threshold:.5,precision:predictedPositive?positives/actual.length:null,recall:predictedPositive?1:0,average_precision:positives/actual.length};}
 else metrics={mae:actual.reduce((s,y)=>s+Math.abs(value-y),0)/actual.length,rmse:Math.sqrt(actual.reduce((s,y)=>s+(value-y)**2,0)/actual.length),interval_coverage:actual.filter(y=>y>=interval![0]&&y<=interval![1]).length/actual.length,interval_width:interval![1]-interval![0]};
 const model_version=digest({manifest,model}),predictions=test.map(r=>({attempt_id:r.attempt_id,snapshot:r.snapshot,decision_at:r.decision_at,model_version,value,interval,mode:'offline_evaluation',realized:r.label,applicability:dataset.cohort,uncertainty:model.uncertainty}));
 return {...manifest,state:'evaluating',available:false,reason:'Offline baseline only. No acceptance review, real-world validation or serving activation is implied.',model:{...model,model_version},metrics,registry_status:'candidate',predictions};
}
// A paused/degraded candidate never produces a live recommendation; activation is intentionally absent.
export function registryEntry(evaluation:ReturnType<typeof evaluateBaseline>,state:string,actor:string,reason:string,priorHash:string|null=null){
 if(!['collecting_data','insufficient_labels','evaluating','paused','degraded'].includes(state))throw Error('Activation requires a separate validated deployment; unavailable here.');
 if(['collecting_data','insufficient_labels','evaluating'].includes(state)&&state!==evaluation.state)throw Error('Registry state must match the evaluation.');
 if(priorHash!==null&&!/^[a-f0-9]{64}$/.test(priorHash))throw Error('Prior registry hash must be an exact SHA-256 reference.');
 const entry={schema_version:1,evaluation_hash:digest(evaluation),org_id:evaluation.org_id,project_id:evaluation.project_id,model_version:evaluation.model?.model_version??null,state,available:false,actor:reportText(actor),reason:reportText(reason),prior_hash:priorHash,recorded_at:new Date().toISOString()};
 return {...entry,entry_hash:digest(entry)};
}
