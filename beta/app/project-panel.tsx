'use client';
import {useEffect,useRef,useState} from 'react';
import ReportList from './report-list';
import {predictionReadiness} from '../../lib/beta/prediction-readiness';
type API=(path:string,body?:unknown)=>Promise<any>;
type Item={id:string;name:string;org_id?:string};
export function ClientProjects({api}:{api:API}){
 const [projects,setProjects]=useState<Item[]>([]),[selected,setSelected]=useState(''),[rows,setRows]=useState<any[]>([]),[next,setNext]=useState<number|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [executions,setExecutions]=useState<any[]>([]),[executionNext,setExecutionNext]=useState<number|null>(null),[cursor,setCursor]=useState({runs:0,executions:0}),[updated,setUpdated]=useState('');
 const requestVersion=useRef(0);
 const [connection,setConnection]=useState('Not connected');
 async function refresh(){const version=++requestVersion.current;setBusy(true);setError('');setRows([]);setExecutions([]);setUpdated('');setSelected('');setNext(null);setExecutionNext(null);try{const result=await api('client-projects');if(version===requestVersion.current)setProjects(result);}catch(e){if(version===requestVersion.current)setError(e instanceof Error?e.message:'Projects unavailable.');}finally{if(version===requestVersion.current)setBusy(false);}}
 useEffect(()=>{void refresh();return()=>{requestVersion.current++;};},[]);
 async function load(id:string,after=0,executionAfter=0){const version=++requestVersion.current;setBusy(true);setError('');setRows([]);setExecutions([]);setNext(null);setExecutionNext(null);setSelected(id);setCursor({runs:after,executions:executionAfter});try{const project=projects.find(p=>p.id===id);if(!project)return;const [result,execution]=await Promise.all([api(`client-project/${project.org_id}/${project.id}?after=${after}`),api(`client-executions/${project.org_id}/${project.id}?after=${executionAfter}`)]);if(version===requestVersion.current){setRows(result.rows);setNext(result.next);setExecutions(execution.rows);setExecutionNext(execution.next);setUpdated(new Date().toISOString());}}catch(e){if(version===requestVersion.current){setUpdated('');setError(e instanceof Error?e.message:'Access unavailable.');}}finally{if(version===requestVersion.current)setBusy(false);}}
 useEffect(()=>{
  if(!selected)return;
  let source:EventSource|null=null,lastRevision='',closed=false;
  const update=()=>{if(document.visibilityState==='visible'&&navigator.onLine)void load(selected,cursor.runs,cursor.executions);};
  const clear=()=>{requestVersion.current++;setRows([]);setExecutions([]);setUpdated('');setBusy(false);};
  const connect=()=>{
   source?.close();source=null;
   if(closed||document.visibilityState!=='visible'||!navigator.onLine){setConnection('Updates paused');return;}
   const project=projects.find(p=>p.id===selected);if(!project)return;
   setConnection('Connecting; periodic checks remain active');
   source=new EventSource(`/api/client-updates/${project.org_id}/${project.id}`);
   source.addEventListener('checked',event=>{
    if(closed)return;
    const data=JSON.parse((event as MessageEvent).data);setConnection(`Connected; access checked ${data.checkedAt}`);
    if(data.revision!==lastRevision){lastRevision=data.revision;update();}
   });
   source.addEventListener('unavailable',()=>{if(closed)return;clear();setConnection('Connection unavailable; retrying through periodic checks');update();});
   source.onerror=()=>{if(closed)return;setConnection('Reconnecting; periodic checks remain active');};
  };
  const online=()=>{update();connect();};
  const visibility=()=>{if(document.visibilityState!=='visible'){source?.close();source=null;setConnection('Updates paused while hidden');}else online();};
  const offline=()=>{source?.close();source=null;clear();setConnection('Offline');setError('Offline. Reconnect to check current project access and publications.');};
  connect();
  const timer=window.setInterval(update,30000);window.addEventListener('online',online);window.addEventListener('offline',offline);document.addEventListener('visibilitychange',visibility);
  return()=>{closed=true;source?.close();clearInterval(timer);window.removeEventListener('online',online);window.removeEventListener('offline',offline);document.removeEventListener('visibilitychange',visibility);};
 },[selected,cursor.runs,cursor.executions,projects]);
 return <section aria-label="Shared projects" style={{overflowWrap:'anywhere'}}><h2>Shared project records</h2><p>Only deliberately shared summaries appear here. Internal evidence and notes remain private.</p><button disabled={busy} onClick={()=>void refresh()}>Reload project list</button><label>Project<select disabled={busy} value={selected} onChange={e=>void load(e.target.value)}><option value="">Choose a project</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
 {selected&&<><p>{connection}. Publication notifications recheck access about every five seconds. Full records are also checked every 30 seconds while visible and after reconnecting.</p><p>Last updated: {updated||'Not currently verified'}.</p><button disabled={busy} onClick={()=>void load(selected)}>Check latest publications</button><details><summary>Prediction readiness: unavailable</summary><p>{predictionReadiness().scope}</p>{predictionReadiness().capabilities.map(c=><p key={c.capability}><strong>{c.capability.replaceAll('_',' ')}: collecting data.</strong> {c.reason}</p>)}<p>{predictionReadiness().limitations}</p></details><h3>Published test history</h3></>}
 {rows.map(r=><article key={r.publication_id}><h4>{r.payload.runId}</h4><p>{r.payload.synthetic?'Synthetic record':'Recorded run'} · {r.payload.outcome} · {r.payload.observedAt}</p><p>Shared revision {r.revision}. Published {r.published_at}. An outcome does not establish a cause.</p></article>)}{selected&&!busy&&!rows.length&&!error&&<p>No shared run summaries on this page.</p>}<button disabled={busy||next===null} onClick={()=>void load(selected,next??0,cursor.executions)}>Next shared records</button>
 {selected&&<h3>Published execution outcomes</h3>}{executions.map(r=><article key={r.publication_id}><h4>{r.payload.attemptId}</h4><p>{r.payload.reality} · {r.payload.method} · {r.payload.outcome}</p><p>Latest reported observation: {r.payload.observedAt||'Unknown'}. Published revision {r.revision}: {r.published_at}.</p>{r.payload.evidenceWarning&&<p>Evidence uncertainty remains. This summary does not establish a cause.</p>}<p>Publication status: shared in this portal. External delivery is not implied.</p></article>)}{selected&&!busy&&!executions.length&&!error&&<p>No execution outcomes have been published on this page.</p>}
 <button disabled={busy||executionNext===null} onClick={()=>void load(selected,cursor.runs,executionNext??0)}>Older execution publications</button>
 {selected&&updated&&projects.find(p=>p.id===selected)?.org_id&&<ReportList key={selected} org={projects.find(p=>p.id===selected)!.org_id!} project={selected} api={api}/>}
 {busy&&<p role="status">Loading…</p>}{error&&<p role="alert">{error}</p>}</section>;
}
export default function ProjectPanel({org,role,api,robots,runs}:{org:string;role:string;api:API;robots:{id:string;name:string}[];runs:{id:string}[]}){
 const manage=['owner','admin'].includes(role),publish=['owner','admin','engineer','member'].includes(role);
 const [data,setData]=useState<any>({clients:[],teams:[],team_members:[],projects:[],grants:[],invitations:[]}),[secret,setSecret]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 async function reload(){setData(manage?await api(`org/${org}/projects`):{clients:[],teams:[],team_members:[],grants:[],invitations:[],projects:(await api('client-projects')).filter((p:Item)=>p.org_id===org)});}
 useEffect(()=>{void reload().catch(e=>setError(e.message));},[org,role]);
 async function action(kind:string,values:Record<string,unknown>){setBusy(true);setError('');setMessage('');setSecret('');try{const result=await api(`org/${org}/project`,{action:kind,...values});if(result.token)setSecret(result.token);await reload();setMessage('Saved. Access changes apply to subsequent requests.');}catch(e){setError(e instanceof Error?e.message:'Operation failed.');}finally{setBusy(false);}}
 function form(kind:string,event:React.FormEvent<HTMLFormElement>){event.preventDefault();void action(kind,Object.fromEntries(new FormData(event.currentTarget)));}
 const projectSelect=<label>Project<select name="project_id" required>{data.projects.map((p:Item)=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>;
 return <details><summary>Teams, clients and project access</summary><p>Client viewers receive explicit project grants and shared summaries. Teams do not grant additional access.</p>
 {manage&&<>
 <form onSubmit={e=>form('client',e)}><label>New client name<input name="name" required maxLength={120}/></label><button disabled={busy}>Create client</button></form>
 <form onSubmit={e=>form('team',e)}><label>New team name<input name="name" required maxLength={120}/></label><button disabled={busy}>Create team</button></form>
 <form onSubmit={e=>form('team_member',e)}><label>Team<select name="team_id" required>{data.teams.map((t:Item)=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label><label>Existing internal member ID<input name="user_id" required/></label><button disabled={busy||!data.teams.length}>Add team member</button></form>
 {data.team_members.map((m:any)=><p key={m.team_id+':'+m.user_id}>{m.user_id} · team {m.team_id} <button disabled={busy} onClick={()=>void action('team_member',{...m,remove:true})}>Remove from team</button></p>)}
 <form onSubmit={e=>form('project',e)}><label>New project name<input name="name" required maxLength={120}/></label><label>Client<select name="client_id"><option value="">Internal project</option>{data.clients.map((c:Item)=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><button disabled={busy}>Create project</button></form>
 <form onSubmit={e=>form('robot',e)}>{projectSelect}<label>Saved robot<select name="robot_id" required>{robots.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label><button disabled={busy||!data.projects.length||!robots.length}>Assign robot to project</button></form>
 <form onSubmit={e=>form('invite',e)}>{projectSelect}<label>Client viewer email<input name="email" type="email" required/></label><button disabled={busy||!data.projects.length}>Create client invitation</button></form>
 {secret&&<label>Invitation token — copy now<textarea readOnly value={secret}/><button onClick={()=>setSecret('')}>Hide invitation token</button></label>}
 {data.invitations.map((i:any)=><p key={i.id}>{i.email} · {i.used_at?'Accepted':i.revoked_at?'Revoked':`Expires ${i.expires_at}`} <button disabled={busy||!!i.used_at||!!i.revoked_at} onClick={()=>void action('revoke_invite',{id:i.id})}>Revoke project invitation</button></p>)}
 {data.grants.map((g:any)=><p key={g.project_id+':'+g.user_id}>{g.user_id} · project {g.project_id} <button disabled={busy} onClick={()=>void action('revoke_grant',{project_id:g.project_id,user_id:g.user_id})}>Revoke project access</button></p>)}
 </>}
 {publish&&<form onSubmit={e=>form('publish',e)}>{projectSelect}<label>Run to share<select name="run_id" required>{runs.map(r=><option key={r.id} value={r.id}>{r.id}</option>)}</select></label><p>Shares only run ID, outcome, observed time and synthetic status. The robot must already belong to this project.</p><button disabled={busy||!data.projects.length||!runs.length}>Share run summary</button></form>}
 {role==='operator'&&<form onSubmit={async e=>{e.preventDefault();const file=new FormData(e.currentTarget).get('capture') as File;setError('');setBusy(true);try{if(file.size>2097152)throw Error('Capture must be at most 2 MiB.');await api(`org/${org}/save`,{bundle:JSON.parse(await file.text()),request_id:crypto.randomUUID(),expected_version:0});setMessage('Capture saved. Reload saved records to view it.');}catch(e){setError(e instanceof Error?e.message:'Upload failed.');}finally{setBusy(false);}}}><label>Approved run capture<input name="capture" type="file" accept="application/json,.json" required/></label><p>Operators can append captures for existing robots, without corrections, mappings or investigation changes.</p><button disabled={busy}>Submit approved capture</button></form>}
 {busy&&<p role="status">Saving…</p>}{message&&<p role="status">{message}</p>}{error&&<p role="alert">{error}</p>}
 </details>;
}
