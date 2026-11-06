'use client';
import { useState } from 'react';
import { pilotSummary } from '../../lib/beta/pilot';
type Summary = ReturnType<typeof pilotSummary>;
type Api = (path: string, body?: unknown) => Promise<any>;
const measurements = [['supportMinutes','Founder support minutes'],['assistedSessions','Founder-assisted sessions'],['independentSessions','Independent sessions'],['expectedRuns','Expected eligible runs'],['capturedRuns','Matching captured runs'],['reconstructionMinutes','Total reconstruction minutes'],['reconstructionSamples','Reconstruction sample count']] as const;
export default function PilotPanel({ org, api }: {org: string; api: Api}) {
  const [data,setData]=useState<Summary|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[week,setWeek]=useState(1);
  async function perform(work:()=>Promise<void>) {setBusy(true);setError('');setMessage('');try{await work();}catch(e){setError(e instanceof Error?e.message:'Pilot request failed.');}finally{setBusy(false);}}
  async function refresh(){setData(await api(`org/${org}/pilot`));}
  const latest=data?.weeks.find(w=>w.week===week)?.review;
  const numeric=(f:FormData,name:string)=>String(f.get(name)??'').trim()===''?null:Number(f.get(name));
  return <details className="pilot-panel" onToggle={e=>{if(e.currentTarget.open&&!data&&!busy)void perform(refresh);}}>
    <summary>Four-week pilot · owner dashboard</summary>
    <p>One workflow, up to five robots. Measurements support an engineer-led review; they do not establish causes or customer value automatically.</p>
    <p>Activity is recorded only after enrollment. Do not enter credentials, configuration contents or private evidence in notes.</p>
    <button disabled={busy} onClick={()=>void perform(refresh)}>Refresh pilot</button>
    {busy&&<p role="status">Loading or saving pilot…</p>}{error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
    {data&&!data.plan&&<form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void perform(async()=>{await api(`org/${org}/pilot-plan`,{startDate:f.get('startDate'),scope:f.get('scope'),successCriteria:f.get('successCriteria'),baselineMinutes:numeric(f,'baselineMinutes'),baselineSamples:numeric(f,'baselineSamples'),baselineMethod:f.get('baselineMethod')});await refresh();setMessage('Pilot enrolled. Activity tracking starts within its 28-day UTC window.');});}}>
      <p>No pilot enrolled. Save a robot first. Agree scope and criteria before enrolling; the plan is retained unchanged. Blank measurements mean unknown.</p>
      <label>Start date (UTC)<input name="startDate" type="date" required min={new Date().toISOString().slice(0,10)} defaultValue={new Date().toISOString().slice(0,10)}/></label>
      <label>Agreed workflow and responsibilities<textarea name="scope" required maxLength={2000}/></label>
      <label>Negotiated success criteria<textarea name="successCriteria" required maxLength={2000}/></label>
      <label>Baseline total reconstruction minutes<input name="baselineMinutes" type="number" min="0" max="1000000" step="1"/></label>
      <label>Baseline sample count<input name="baselineSamples" type="number" min="1" max="1000000" step="1"/></label>
      <label>Baseline method and evidence note<textarea name="baselineMethod" maxLength={2000}/></label>
      <button disabled={busy}>Enroll pilot</button>
    </form>}
    {data?.plan&&<>
      <h2>{data.plan.synthetic?'Synthetic rehearsal — not customer evidence':'Pilot measurements — owner reported'}</h2>
      <p>Starts {data.plan.payload.startDate} (UTC), lasts 28 days. Scope: {data.plan.payload.scope}</p><p>Criteria: {data.plan.payload.successCriteria}</p>
      <p>Baseline: {data.plan.payload.baselineMinutes??'Unknown'} total minutes; {data.plan.payload.baselineSamples??'unknown'} samples. {data.plan.payload.baselineMethod}</p>
      <div className="pilot-weeks">{data.weeks.map(w=><section key={w.week} aria-label={`Week ${w.week} summary`}><h3>Week {w.week}</h3><p>Coverage: {w.coveragePercent===null?'Unknown / no eligible runs':`${w.coveragePercent.toFixed(1)}%`}</p><p>Active organizations: {w.activeOrganizations ?? 'Not yet observed'} of this 1 organization (saved human workspace or comparison activity).</p><p>Support: {w.review?.payload.supportMinutes??'Unknown'} minutes</p><p>Assisted / independent sessions: {w.review?.payload.assistedSessions??'?'} / {w.review?.payload.independentSessions??'?'}</p>{w.activity.map(a=><p key={a.kind}>{a.kind.replaceAll('_',' ')}: {a.count}; first observed <time>{a.first_at}</time></p>)}{!w.activity.length&&<p>No observed activity. Future weeks and tracking gaps are not evidence of inactivity.</p>}</section>)}</div>
      <label>Review week<select value={week} onChange={e=>setWeek(Number(e.target.value))}>{[1,2,3,4].map(n=><option key={n} value={n} disabled={!data.weeks[n-1].started}>Week {n}</option>)}</select></label>
      <form key={`${week}:${latest?.revision??0}`} onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void perform(async()=>{await api(`org/${org}/pilot-review`,{week,expectedRevision:latest?.revision??0,...Object.fromEntries(measurements.map(([key])=>[key,numeric(f,key)])),denominatorEvidence:f.get('denominatorEvidence'),evidenceNote:f.get('evidenceNote'),decision:f.get('decision')});await refresh();setMessage('Review saved as a new revision.');});}}>
        <p>Record observed totals for this week, not estimates. Leave unknown values blank; zero is a measured zero. Reviews cannot precede the week. Corrections append a revision.</p>
        {measurements.map(([key,label])=><label key={key}>{label}<input name={key} type="number" min="0" max="1000000" step="1" defaultValue={latest?.payload[key]??''}/></label>)}
        <label>Independent runner denominator source and scope<textarea name="denominatorEvidence" maxLength={2000} defaultValue={latest?.payload.denominatorEvidence??''}/></label>
        <label>Measurement method, buyer response, limitations and correction reason<textarea name="evidenceNote" required maxLength={2000} defaultValue={latest?.payload.evidenceNote??''}/></label>
        <label>Decision<select name="decision" defaultValue={latest?.payload.decision??'pending'}><option value="pending">Pending evidence</option><option value="continue-paid">Continue paid — proposal only</option><option value="revise">Revise scope / value / pricing</option><option value="stop">Stop</option></select></label>
        <button disabled={busy || !data.weeks[week-1].started}>Save weekly review</button>
      </form>
      <button disabled={busy} onClick={()=>void perform(async()=>{const fresh=await api(`org/${org}/pilot`);setData(fresh);const url=URL.createObjectURL(new Blob([JSON.stringify(fresh,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='tavrik-pilot-summary.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);})}>Export pilot summary</button>
      <p>USD 1,000 for four weeks is an unvalidated, negotiable pricing hypothesis. No billing or subscription activation occurs here.</p>
      <ul>{data.limitations.map(s=><li key={s}>{s}</li>)}</ul>
    </>}
  </details>;
}
