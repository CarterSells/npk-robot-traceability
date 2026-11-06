'use client';
import {useEffect,useRef,useState} from 'react';
import type {Attempt,projectAttempt} from '../../lib/beta/lifecycle';
type Detail={payload:Attempt;cutoff:number;projection:ReturnType<typeof projectAttempt>};
type Row={id:string;robot_id:string;created_at:string;payload:Attempt};
export default function LifecyclePanel({org,api,canPublish=false}:{org:string;api:(path:string,body?:unknown)=>Promise<any>;canPublish?:boolean}){
 const [rows,setRows]=useState<Row[]>([]),[next,setNext]=useState<string|null>(null),[detail,setDetail]=useState<Detail|null>(null);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[updated,setUpdated]=useState('');
 const request=useRef(0);
 const [publication,setPublication]=useState('');
 async function load(after?:string){const version=++request.current;setBusy(true);setError('');setDetail(null);
  try{const result=await api(`org/${org}/executions${after?'?after='+encodeURIComponent(after):''}`);if(version!==request.current)return;setRows(result.rows);setNext(result.next);setUpdated(new Date().toISOString());}
  catch(e){if(version===request.current)setError(e instanceof Error?e.message:'Could not load attempts.');}
  finally{if(version===request.current)setBusy(false);}
 }
 async function open(id:string){const version=++request.current;setBusy(true);setError('');setDetail(null);setPublication('');
  try{const result=await api(`org/${org}/executions?attempt=${encodeURIComponent(id)}`);if(version===request.current){setDetail(result);setUpdated(new Date().toISOString());}}
  catch(e){if(version===request.current)setError(e instanceof Error?e.message:'Could not load evidence.');}
  finally{if(version===request.current)setBusy(false);}
 }
 useEffect(()=>{void load();return()=>{request.current++;};},[org]); // Keyed by organization at the caller.
 return <details><summary>Execution attempts and evidence</summary>
  <p>Recorded execution history. Acknowledgement does not establish completion. This view does not control robots.</p>
  <button disabled={busy} onClick={()=>void load()}>Refresh attempts</button>
  {updated&&<p>Last refreshed: {updated}. Updates appear when refreshed.</p>}
  {error&&<p role="alert">{error}</p>}
  {!busy&&!rows.length&&<p>No execution attempts recorded. Completed test captures remain in Run history.</p>}
  <ul>{rows.map(row=><li key={row.id}><button disabled={busy} onClick={()=>void open(row.id)}>{row.robot_id} · {row.created_at} · {row.payload.reality} / {row.payload.method}</button></li>)}</ul>
  {next&&<button disabled={busy} onClick={()=>void load(next)}>Next attempts</button>}
  {detail&&<section aria-label="Attempt timeline" style={{overflowWrap:'anywhere'}}>
   <h3>{detail.projection.state}</h3>
   <p>Completion observed: {detail.projection.completion_observed?'Yes':'No'}. Acknowledged: {detail.projection.acknowledged?'Yes':'No'}.</p>
   <p>{detail.payload.reality} evidence · {detail.payload.method} collection. Attempt {detail.payload.attempt_id}; job {detail.payload.job_id}.</p>
   <p>Exact snapshot: {detail.payload.snapshot_id}, revision {detail.payload.snapshot_revision}. {detail.payload.retry_of&&`Retry of ${detail.payload.retry_of}.`}</p>
   {canPublish&&<div><p>Publish only the attempt ID, outcome, observation time, reality, collection method and uncertainty flag to this attempt’s project. Internal evidence and notes stay private.</p><button disabled={busy} onClick={async()=>{setBusy(true);setError('');try{const result=await api(`org/${org}/publish-execution`,{attempt_id:detail.payload.attempt_id,cutoff:detail.cutoff});setPublication(`Outcome published as revision ${result.revision}.`);}catch(e){setError(e instanceof Error?e.message:'Publication failed.');}finally{setBusy(false);}}}>Publish reviewed outcome to project</button>{publication&&<p role="status">{publication}</p>}</div>}
   <dl>{(['procedure','procedure_version','task','environment','components'] as const).map(key=><div key={key}><dt>{key.replaceAll('_',' ')}</dt><dd>{detail.payload[key].state==='known'?detail.payload[key].value:`${detail.payload[key].state}: ${detail.payload[key].reason}`}</dd></div>)}</dl>
   {detail.projection.warnings.length>0&&<ul aria-label="Evidence warnings">{detail.projection.warnings.map((warning,i)=><li key={i}>{warning}</li>)}</ul>}
   <h4>Measurements</h4>
   {!Object.keys(detail.projection.measurements).length&&<p>No measurements recorded; values are unknown.</p>}
   <dl>{Object.entries(detail.projection.measurements).map(([name,m])=><div key={name}><dt>{name}</dt><dd>{m.state==='known'?`${m.value} ${m.unit}`:`${m.state}: ${m.reason}`}</dd></div>)}</dl>
   <h4>Labels</h4><dl>{Object.entries(detail.projection.labels).map(([name,label])=><div key={name}><dt>{name}</dt><dd>{label.value} · {label.evidence}</dd></div>)}</dl>
   <h4>Recorded timeline</h4>
   <ol>{detail.projection.timeline.map(e=><li key={e.event_id}><strong>{e.kind}</strong> · observed {e.observed_at}; received {e.received_at}. Author {e.author}. Source sequence {e.source_sequence}.
    {e.correction_of&&<p>Corrects {e.correction_of}: {e.reason}</p>}
    <dl>{Object.entries(e.payload).map(([key,value])=><div key={key}><dt>{key.replaceAll('_',' ')}</dt><dd>{value===null?'Not observed':String(value)}</dd></div>)}</dl>
   </li>)}</ol>
  </section>}
 </details>;
}
