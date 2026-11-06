import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,writeFileSync,readFileSync,readdirSync,unlinkSync,rmdirSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {curateDataset,evaluateBaseline,registryEntry} from '../../lib/beta/prediction-evaluation.ts';
import {predictionReadiness,readinessStates} from '../../lib/beta/prediction-readiness.ts';
import {createHandler} from '../../lib/beta/server.ts';
const row=(day,label)=>({attempt_id:randomUUID(),job_id:randomUUID(),duplicate_group:randomUUID(),robot_id:'robot-1',snapshot:{id:'snapshot-1',revision:2},decision_at:`2026-10-${day}T00:00:00.000Z`,context_recorded_at:'2026-10-01T00:00:00.000Z',label_available_at:label===null?null:`2026-10-${day}T01:00:00.000Z`,label,censored:false});
const dataset=()=>({schema_version:1,org_id:randomUUID(),project_id:randomUUID(),cohort:{procedure:'pick',procedure_version:'v1',configuration:'reviewed-equivalent-revision-family',environment:'lab-a',provenance:'manual-reviewed',reality:'simulation'},target:{capability:'duration',metric:'duration',unit:'s',horizon_seconds:null},feature_version:'cohort-only-v1',label_version:'measured-seconds-v1',split_at:'2026-10-15T00:00:00.000Z',evaluated_at:'2026-11-01T00:00:00.000Z',rows:[row('02',2),row('03',4),row('16',3),row('17',5)]});
test('curated dataset is deterministic, versioned and rejects synthetic data, future features and mismatched labels',()=>{
 const d=dataset(),hash=curateDataset(d).dataset_hash;assert.equal(curateDataset({...d,rows:[...d.rows].reverse()}).dataset_hash,hash);
 assert.throws(()=>curateDataset({...d,cohort:{...d.cohort,reality:'synthetic'}}));
 assert.throws(()=>curateDataset({...d,rows:[{...d.rows[0],context_recorded_at:'2026-10-30T00:00:00.000Z'}]}));
 assert.throws(()=>curateDataset({...d,rows:[{...d.rows[0],label_available_at:null}]}));
 assert.throws(()=>curateDataset({...d,rows:[{...d.rows[0],censored:true}]}));
 assert.throws(()=>curateDataset({...d,rows:[{...d.rows[0],label:Infinity}]}));
 assert.throws(()=>curateDataset({...d,rows:[d.rows[0],d.rows[0]]}));
 assert.notEqual(curateDataset({...d,org_id:randomUUID()}).dataset_hash,hash);
});
test('time holdout purges repeated jobs/near duplicates and labels unavailable at training cutoff',()=>{
 const d=dataset();d.rows[2].job_id=d.rows[0].job_id;
 let result=evaluateBaseline(d);assert.equal(result.training_attempts.length,1);assert.equal(result.test_attempts.length,1);assert.equal(result.excluded,2);
 d.rows[3].duplicate_group=d.rows[1].duplicate_group;result=evaluateBaseline(d);assert.equal(result.state,'insufficient_labels');assert.equal(result.model,null);
 const late=dataset();late.rows[0].label_available_at='2026-10-16T00:00:00.000Z';assert.equal(evaluateBaseline(late).training_attempts.length,1);
});
test('baseline metrics preserve exact references and cannot activate models; risk requires both classes and maintenance abstains',()=>{
 const d=dataset(),r=evaluateBaseline(d);assert.equal(r.state,'evaluating');assert.equal(r.available,false);assert.equal(r.model.value,3);assert.equal(r.metrics.mae,1);assert.equal(r.metrics.interval_coverage,.5);assert.equal(r.predictions[0].snapshot.revision,2);
 const entry=registryEntry(r,'paused','reviewer','Pending evidence');assert.equal(entry.available,false);assert.equal(entry.model_version,r.model.model_version);assert.throws(()=>registryEntry(r,'available','reviewer','No evidence'));
 const risk={...d,target:{capability:'failure_risk',metric:'confirmed_failure',unit:'binary',horizon_seconds:null},rows:d.rows.map((x,i)=>({...x,label:i%2}))};
 const rr=evaluateBaseline(risk);assert.equal(rr.metrics.brier,.25);assert.equal(rr.metrics.average_precision,.5);assert.equal(rr.metrics.recall,1);
 assert.equal(evaluateBaseline({...risk,rows:risk.rows.map(x=>({...x,label:0}))}).state,'insufficient_labels');
 assert.equal(evaluateBaseline({...risk,target:{capability:'maintenance',metric:'bearing-failure',unit:'binary',horizon_seconds:86400}}).model,null);
 assert.equal(evaluateBaseline({...d,rows:[]}).state,'collecting_data');
 assert.equal(predictionReadiness().capabilities.every(c=>!c.available&&c.eligible_runs===null),true);assert.equal(readinessStates.includes('degraded'),true);
});
test('readiness API requires current project access and does not expose private cohort records',async()=>{
 Object.assign(process.env,{BETA_ENABLED:'true',BETA_AUTH_LIFECYCLE:'false',BETA_ORIGIN:'https://beta.example.invalid',SUPABASE_URL:'https://db.example.invalid',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'server'});
 const org=randomUUID(),project=randomUUID();let allowed=true;
 const handle=createHandler(async(url)=>{const u=new URL(url);if(u.pathname==='/auth/v1/user')return Response.json({id:randomUUID()});if(u.pathname==='/rest/v1/projects'){assert.equal(u.searchParams.get('org_id'),'eq.'+org);assert.equal(u.searchParams.get('id'),'eq.'+project);return Response.json(allowed?[{id:project}]:[]);}throw Error('Unexpected data access');});
 const request=()=>new Request(`https://beta.example.invalid/api/client-readiness/${org}/${project}`,{headers:{Cookie:'unify_session=synthetic'}});
 const r=await handle(request());assert.equal(r.status,200);assert.deepEqual(await r.json(),predictionReadiness());allowed=false;assert.equal((await handle(request())).status,403);
});
test('offline CLI preserves private artifacts, rejects repository paths including dot-prefixed directories',()=>{
 const directory=mkdtempSync(join(tmpdir(),'tavrik-evaluation-test-')),input=join(directory,'input.json'),local=resolve('.cache/..prediction-test-'+randomUUID());
 try{
  writeFileSync(input,JSON.stringify(dataset()));
  const output=execFileSync(process.execPath,['--experimental-strip-types','scripts/evaluate-predictions.mjs',input,directory,'synthetic-test-reviewer'],{encoding:'utf8',windowsHide:true});
  assert.equal(JSON.parse(output).available,false);
  const file=readdirSync(directory).find(f=>f.startsWith('evaluation-'));const artifact=JSON.parse(readFileSync(join(directory,file),'utf8'));assert.equal(artifact.dataset.cohort.reality,'simulation');assert.equal(artifact.registry.state,artifact.evaluation.state);
  mkdirSync(local);assert.throws(()=>execFileSync(process.execPath,['--experimental-strip-types','scripts/evaluate-predictions.mjs',input,local,'test'],{stdio:'pipe',windowsHide:true}));
 }finally{for(const file of readdirSync(directory))unlinkSync(join(directory,file));rmdirSync(directory);try{rmdirSync(local);}catch{}}
});
