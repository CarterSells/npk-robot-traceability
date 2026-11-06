import {randomUUID} from 'node:crypto';
import {curateDataset,evaluateBaseline} from './prediction-evaluation.ts';
import {exactReport,reportText} from './reports.ts';
import {machineId} from './machines.ts';
export function registryInput(raw:unknown,org:string){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Invalid candidate request.');
 const v=raw as Record<string,unknown>;
 if(v.action==='register'){
  exactReport(v,['action','dataset','reason']);
  const dataset=curateDataset(v.dataset);
  if(dataset.org_id!==org||dataset.rows.length>1000)throw Error('Use at most 1,000 approved rows for this organization.');
  return {action:'register',id:randomUUID(),dataset,evaluation:evaluateBaseline(v.dataset),reason:reportText(v.reason)};
 }
 if(v.action==='review'){
  exactReport(v,['action','id','expected_revision','state','reason','published','public_label','public_reason']);
  if(!Number.isSafeInteger(v.expected_revision)||Number(v.expected_revision)<1||!['collecting_data','insufficient_labels','evaluating','paused','degraded'].includes(String(v.state))||typeof v.published!=='boolean')throw Error('Invalid unavailable candidate transition.');
  return {action:'review',id:machineId(v.id),expected_revision:v.expected_revision,state:v.state,reason:reportText(v.reason),published:v.published,
   public_label:v.published?reportText(v.public_label,120):null,public_reason:v.published?reportText(v.public_reason):null};
 }
 if(v.action==='list'){exactReport(v,['action','project_id']);return {action:'list',project_id:machineId(v.project_id)};}
 throw Error('Unsupported candidate action.');
}
