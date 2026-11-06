'use client';
import {useEffect,useRef,useState} from 'react';
type API=(path:string,body?:unknown)=>Promise<any>;
export default function IntegrationPanel({org,api}:{org:string;api:API}){
 const [data,setData]=useState<any>({connections:[],jobs:[],configured:false}),[projects,setProjects]=useState<any[]>([]),[selected,setSelected]=useState('');
 const [preview,setPreview]=useState<any>(null),[versions,setVersions]=useState<any[]>([]),[next,setNext]=useState<number|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const queued=useRef({signature:'',id:''});
 const connection=data.connections.find((c:any)=>c.id===selected);
 const path=`org/${org}/integrations`;
 async function reload(){setData(await api(path));}
 useEffect(()=>{let live=true;void Promise.all([api(path),api(`org/${org}/projects`)]).then(([a,b])=>{if(live){setData(a);setProjects(b.projects);}}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[org]);
 async function run(work:()=>Promise<void>){setBusy(true);setError('');setMessage('');try{await work();}catch(e){setError(e instanceof Error?e.message:'Integration unavailable.');}finally{setBusy(false);}}
 const values=(event:React.FormEvent<HTMLFormElement>)=>{event.preventDefault();return Object.fromEntries(new FormData(event.currentTarget));};
 const action=(name:string,body:Record<string,unknown>={})=>api(path,{action:name,connection_id:selected,...body});
 const discover=async(offset=0)=>{const r=await action('discover',{offset});setVersions(r.versions);setNext(r.next);};
 return <details><summary>CAD integrations</summary><section aria-label="CAD integrations">
  <p>Connect an approved Onshape document to one project and robot. CAD references describe design history; physical installation still needs an engineer's confirmation.</p>
  {!data.configured&&<p>Onshape setup is pending: an administrator must register the OAuth application, configure its HTTPS callback and encryption keys, and verify provider access. A paid CAD subscription is not assumed.</p>}
  <form onSubmit={e=>{const d=values(e);void run(async()=>{const r=await action('create',{...d,write_enabled:d.write_enabled==='on'});await reload();setSelected(r.id);setPreview(null);setMessage('Connection created. Authorize Onshape to begin.');});}}>
   <label>Project<select name="project_id" required>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
   <label>Saved robot ID<input name="robot_id" required maxLength={120}/></label><p>The robot must already be assigned to the selected project.</p>
   <label>Onshape document ID<input name="document_id" required pattern="[a-f0-9]{24}"/></label>
   <label><input type="checkbox" name="write_enabled" style={{width:'1.25rem',minHeight:'1.25rem'}}/> Allow separately approved create-version requests</label>
   <button disabled={busy||!projects.length}>Create scoped connection</button>
  </form>
  <label>Connection<select disabled={busy} value={selected} onChange={e=>{setSelected(e.target.value);setPreview(null);setVersions([]);setNext(null);}}><option value="">Choose a connection</option>{data.connections.map((c:any)=><option key={c.id} value={c.id}>{c.robot_id} / {c.document_id} - {c.status}</option>)}</select></label>
  {connection&&<>
   <p>Status: {connection.status}. Writes {connection.write_enabled?'require explicit approval':'disabled'}.</p>
   <button disabled={busy||!data.configured} onClick={()=>void run(async()=>{const r=await action('authorize');window.location.assign(r.url);})}>Authorize or reconnect Onshape</button>
   <button disabled={busy||connection.status==='disconnected'} onClick={()=>void run(async()=>{await action('disconnect');setPreview(null);await reload();setMessage('Local access disconnected and stored tokens erased. You can also revoke the grant in Onshape.');})}>Disconnect local access</button>
   {connection.status==='connected'&&<>
    <button disabled={busy} onClick={()=>void run(()=>discover())}>Check authorized document versions</button>
    <ul>{versions.map(v=><li key={v.id}>{v.name}: {v.id} (microversion {v.microversionId})</li>)}</ul>
    {next!==null&&<button disabled={busy} onClick={()=>void run(()=>discover(next))}>Next document versions</button>}
    <form onSubmit={e=>{const d=values(e);setPreview(null);void run(async()=>{setPreview({...await action('preview',d),requestId:crypto.randomUUID()});});}}>
     <h3>Review an exact CAD reference</h3>
     <label>Reference type<select name="kind"><option value="v">Version</option><option value="w">Workspace (pin its current microversion)</option><option value="m">Microversion</option></select></label>
     <label>Reference ID<input name="reference_id" required pattern="[a-f0-9]{24}"/></label><label>Element ID<input name="element_id" required pattern="[a-f0-9]{24}"/></label><label>Robot component label<input name="component" required maxLength={120}/></label><button disabled={busy}>Preview metadata</button>
    </form>
    {preview&&<form onSubmit={e=>{const d=values(e);void run(async()=>{const r=await action('import',{...d,snapshot_revision:Number(d.snapshot_revision),synthetic:d.synthetic==='on',approved:true,ticket:preview.ticket,request_id:preview.requestId});setMessage(`Saved new snapshot ${r.snapshot_id}, revision 1. Reload saved records to use it for a test.`);setPreview(null);});}}>
     <p>{preview.reference.name}: {preview.reference.url}</p><p>Captured {preview.reference.capturedAt}. Physical installation is not verified. Existing runs keep their original snapshots.</p>
     <label>Existing snapshot ID to copy<input name="snapshot_id" required maxLength={120}/></label><label>Existing snapshot revision<input name="snapshot_revision" type="number" min="1" defaultValue="1" required/></label>
     <label><input name="synthetic" type="checkbox" style={{width:'1.25rem',minHeight:'1.25rem'}}/> This is a synthetic test document (must match the organization history)</label>
     <button disabled={busy}>Approve reference and save a new snapshot</button>
    </form>}
    <form onSubmit={e=>{const d=values(e);void run(async()=>{const signature=JSON.stringify([selected,d]);if(queued.current.signature!==signature)queued.current={signature,id:crypto.randomUUID()};await action('enqueue',{...d,approved:true,request_id:queued.current.id});await reload();setMessage('Operation queued. A configured worker must process it; queued does not mean executed.');});}}>
     <h3>Request an Onshape operation</h3><label>Operation<select name="kind"><option value="export_step">Export a Part Studio version to STEP</option>{connection.write_enabled&&<option value="create_version">Create a version from an approved workspace microversion</option>}</select></label>
     <label>Expected microversion ID<input name="microversion_id" required pattern="[a-f0-9]{24}"/></label>
     <label>Version ID (export)<input name="version_id" pattern="[a-f0-9]{24}"/></label><label>Element ID (export)<input name="element_id" pattern="[a-f0-9]{24}"/></label>
     <label>Workspace ID (create version)<input name="workspace_id" pattern="[a-f0-9]{24}"/></label><label>New version name (create version)<input name="name" maxLength={120}/></label>
     <p>Exports retain result references, not CAD file contents. These operations never execute a robot. An uncertain provider response requires reconciliation, not another submission.</p><button disabled={busy}>Approve and queue operation</button>
    </form>
   </>}
  </>}
  <button disabled={busy} onClick={()=>void run(reload)}>Refresh connection and operation status</button>
  <h3>Recent operations</h3><ul>{data.jobs.map((j:any)=><li key={j.id}>{j.kind} - {j.status}. Request {j.id}. {j.provider_id&&`Provider reference ${j.provider_id}.`}{j.output?.reason&&<p>{j.output.reason}</p>}{j.status==='unknown'&&<form onSubmit={e=>{const d=values(e);void run(async()=>{await api(path,{action:'reconcile',connection_id:j.connection_id,request_id:j.id,provider_id:d.provider_id});await reload();setMessage('Provider result verified and attached to the original request.');});}}><label>Provider result ID verified in Onshape<input name="provider_id" required pattern="[a-f0-9]{24}"/></label><button disabled={busy}>Verify and reconcile result</button></form>}</li>)}</ul>
  {busy&&<p role="status">Checking integration…</p>}{message&&<p role="status">{message}</p>}{error&&<p role="alert">{error}</p>}
 </section></details>;
}
