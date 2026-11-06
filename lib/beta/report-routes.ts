import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {machineId} from './machines.ts';
import {seal,unseal} from './connector-secrets.ts';
import {buildReport,exactReport,reportSelection,validatePublishedReport} from './reports.ts';
import {resolveWebhook} from './report-delivery.ts';
import type {Remote} from './auth.ts';

export function reportQuery(url:URL){
 const after=url.searchParams.get('after')??'0';if(!/^\d{1,15}$/.test(after))throw Error('Invalid report cursor.');
 const report_id=url.searchParams.has('report_id')?machineId(url.searchParams.get('report_id')):null;
 const revision=url.searchParams.get('revision');
 if(report_id&&(!revision||!/^\d{1,9}$/.test(revision)||Number(revision)<1))throw Error('Choose an exact report revision.');
 return {after,report_id,revision:report_id?Number(revision):null};
}
export function validateReportPage(result:any){for(const row of result.rows)validatePublishedReport(row.payload);return result;}
export async function reportRoute(remote:Remote,read:(table:string,query:string)=>Promise<any>,org:string,actor:string,data:Record<string,unknown>){
 const admin=(p_data:unknown)=>remote('/rest/v1/rpc/report_admin','POST',{p_org:org,p_actor:actor,p_data});
 if(data.action==='preview'||data.action==='publish'){
  exactReport(data,data.action==='preview'?['action','selection']:['action','selection','reviewed_cutoffs','approved']);
  const selection=reportSelection(data.selection),sources=[];
  for(const attemptId of selection.attempt_ids){
   const [row]=await read('execution_attempts',`org_id=eq.${org}&id=eq.${attemptId}&project_id=eq.${selection.project_id}&select=payload,project_id,created_at`);
   if(!row)throw Error('Selected execution is unavailable.');
   const events=await read('execution_events',`org_id=eq.${org}&attempt_id=eq.${attemptId}&select=archive_id,payload,received_at,author&order=source_sequence&limit=1000`);
   sources.push({attempt:row.payload,project_id:row.project_id,created_at:new Date(row.created_at).toISOString(),events:events.map((e:any)=>({...e.payload,archive_id:e.archive_id,received_at:new Date(e.received_at).toISOString(),author:e.author}))});
  }
  const built=buildReport(selection,sources);
  if(data.action==='preview')return built;
  exactReport(data.reviewed_cutoffs,selection.attempt_ids);
  const cuts=data.reviewed_cutoffs;
  if(data.approved!==true||selection.attempt_ids.some(id=>cuts[id]!==built.cutoffs[id]))throw Error('Evidence changed or approval is missing. Preview and review again.');
  const result=await remote('/rest/v1/rpc/report_publish','POST',{p_org:org,p_actor:actor,p_data:built});
  validatePublishedReport(result.report);return result;
 }
 if(data.action==='list'){exactReport(data,['action']);return admin(data);}
 if(['revoke_credential','revoke_endpoint','replay'].includes(String(data.action))){exactReport(data,['action','id']);return admin({...data,id:machineId(data.id)});}
 if(data.action==='credential'){
  exactReport(data,['action','project_id','recipient','days']);
  if(!Number.isSafeInteger(data.days)||Number(data.days)<1||Number(data.days)>90)throw Error('Credential expiry must be 1–90 days.');
  const token='tr_'+randomBytes(32).toString('hex');
  const saved=await admin({...data,project_id:machineId(data.project_id),recipient:machineId(data.recipient),token_hash:createHash('sha256').update(token).digest('hex')});
  return {...saved,token};
 }
 if(data.action==='endpoint'){
  exactReport(data,['action','project_id','recipient','url']);
  const project_id=machineId(data.project_id),recipient=machineId(data.recipient);
  const {url}=await resolveWebhook(String(data.url));
  const id=randomUUID(),signing_secret=randomBytes(32).toString('hex');
  const saved=await admin({action:'endpoint',id,project_id,recipient,url:url.href,secret:seal({active:signing_secret,previous:null,previous_until:0},'report:'+org+':'+id)});
  return {...saved,signing_secret};
 }
 if(data.action==='rotate'){
  exactReport(data,['action','id','overlap_minutes']);const id=machineId(data.id);
  if(!Number.isSafeInteger(data.overlap_minutes)||Number(data.overlap_minutes)<0||Number(data.overlap_minutes)>60)throw Error('Rotation overlap must be 0–60 minutes.');
  const prior=await admin({action:'rotation_read',id});
  const old=unseal<{active:string;previous:string|null;previous_until:number}>(prior.secret,'report:'+org+':'+id);
  if(old.previous_until>Date.now())throw Error('Wait until the previous rotation overlap ends.');
  const signing_secret=randomBytes(32).toString('hex');
  const saved=await admin({action:'rotate',id,expected_revision:prior.revision,secret:seal({active:signing_secret,previous:old.active,previous_until:Date.now()+Number(data.overlap_minutes)*60000},'report:'+org+':'+id)});
  return {...saved,signing_secret};
 }
 throw Error('Unsupported report operation.');
}
