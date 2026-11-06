'use client';
import {useEffect,useRef,useState} from 'react';
type API=(path:string,body?:unknown)=>Promise<any>;
export default function ReportList({org,project,api}:{org:string;project:string;api:API}){
 const [rows,setRows]=useState<any[]>([]),[next,setNext]=useState<string|null>(null),[after,setAfter]=useState('0'),[error,setError]=useState(''),[busy,setBusy]=useState(false),[updated,setUpdated]=useState(''),[enabled,setEnabled]=useState(true);
 const version=useRef(0);
 async function load(cursor=after){
  const current=++version.current;setBusy(true);setError('');setRows([]);setNext(null);setUpdated('');
  try{const result=await api(`client-reports/${org}/${project}?after=${cursor}`);if(current!==version.current)return;setRows(result.rows);setNext(result.next);setAfter(cursor);setEnabled(result.enabled!==false);setUpdated(new Date().toISOString());}
  catch(e){if(current===version.current)setError(e instanceof Error?e.message:'Reports unavailable.');}
  finally{if(current===version.current)setBusy(false);}
 }
 useEffect(()=>{
  const clear=()=>{version.current++;setRows([]);setUpdated('');setNext(null);setBusy(false);setError('Offline. Reconnect to verify report access.');};
  const refresh=()=>{if(navigator.onLine&&document.visibilityState==='visible')void load(after);};
  refresh();const timer=window.setInterval(refresh,30000);
  window.addEventListener('offline',clear);window.addEventListener('online',refresh);document.addEventListener('visibilitychange',refresh);
  return()=>{version.current++;clearInterval(timer);window.removeEventListener('offline',clear);window.removeEventListener('online',refresh);document.removeEventListener('visibilitychange',refresh);};
 },[org,project,after]);
 async function download(report:any){
  const current=version.current;setBusy(true);setError('');
  try{
   const result=await api(`client-reports/${org}/${project}?report_id=${report.report_id}&revision=${report.revision}`);
   if(current!==version.current)return;
   if(result.rows.length!==1)throw Error('Report is no longer available.');
   const url=URL.createObjectURL(new Blob([JSON.stringify(result.rows[0].payload,null,2)],{type:'application/json'}));
   const anchor=document.createElement('a');anchor.href=url;anchor.download=`tavrik-report-${report.report_id}-r${report.revision}.json`;anchor.click();URL.revokeObjectURL(url);
  }catch(e){if(current===version.current){setRows([]);setUpdated('');setError(e instanceof Error?e.message:'Download unavailable.');}}
  finally{if(current===version.current)setBusy(false);}
 }
 return <section aria-label="Published JSON reports"><h3>Published reports</h3><p>Approved facts and engineer statements. Missing measurements remain unknown; reports do not diagnose causes.</p>
 <p>Last checked: {updated||'Not currently verified'}. Reports refresh every 30 seconds while visible.</p>
 <button disabled={busy} onClick={()=>void load('0')}>Reload reports</button>
 {!enabled&&<p>Report publication is not activated for this beta.</p>}
 {rows.map(row=>{const r=row.payload;return <article key={row.publication_id}><h4>Report {r.report_id} · revision {r.revision}</h4><p>{r.period.start} to {r.period.end}, by execution record time.</p><p>{r.runs.length} selected executions. Generated {r.generated_at}.</p>{r.previous_revision&&<p>Corrects revision {r.previous_revision}; earlier history is retained.</p>}{r.engineer_conclusion&&<p>Engineer statement: {r.engineer_conclusion.text}</p>}<p>Model assessment: unavailable. Webhook receipt is not implied by publication.</p><button disabled={busy} onClick={()=>void download(r)}>Download report revision {r.revision}</button></article>;})}
 {!busy&&enabled&&!error&&!rows.length&&<p>No reports on this page.</p>}
 <button disabled={busy||next===null} onClick={()=>void load(String(next))}>Next reports</button>
 {busy&&<p role="status">Loading reports…</p>}{error&&<p role="alert">{error}</p>}</section>;
}
