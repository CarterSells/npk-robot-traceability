'use client';
import { useState } from 'react';
import type { Bundle } from '../../lib/local/records';
type Row = { key: string; revision: number; payload: Record<string, unknown> };
export default function HistoryPanel({ org, api, open }: { org: string; api: (path: string, body?: unknown) => Promise<any>; open: (bundle: Bundle) => void }) {
  const [collection,setCollection]=useState('runs'),[rows,setRows]=useState<Row[]>([]),[next,setNext]=useState<Row|null>(null),[watermark,setWatermark]=useState<number>();
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[selected,setSelected]=useState<string[]>([]);
  async function load(more=false){setBusy(true);setError('');try{
    const q=new URLSearchParams({collection,limit:'25'});
    if(more&&next){q.set('after',next.key);q.set('revision',String(next.revision));q.set('watermark',String(watermark));}
    const result=await api(`org/${org}/history?${q}`);setRows(result.rows);setNext(result.next);setWatermark(result.watermark);
  }catch(e){setRows([]);setNext(null);setError(e instanceof Error?e.message:'History unavailable.');}finally{setBusy(false);}}
  return <section aria-label="Saved history"><h2>Saved history</h2><p>Browse saved pages independently of the draft below. Select up to two runs to inspect or compare their exact snapshots. Differences do not establish causes.</p>
    <a href={`/api/org/${org}/export-history`}>Export complete history</a>
    <label>Record type<select value={collection} disabled={busy} onChange={e=>{setCollection(e.target.value);setRows([]);setNext(null);setSelected([]);}}>{['runs','robots','snapshots','corrections','investigation_revisions','mappings'].map(c=><option key={c}>{c}</option>)}</select></label>
    <button disabled={busy} onClick={()=>void load()}>Load first page</button><button disabled={busy||!next} onClick={()=>void load(true)}>Next page</button>
    {rows.map(row=><details key={row.key+':'+row.revision}><summary>{row.key}{row.revision>0?` · revision ${row.revision}`:''}</summary>
      {collection==='runs'&&<label style={{display:'flex',alignItems:'center',gap:'0.75rem'}}><input style={{width:'1.25rem',minHeight:'1.25rem'}} type="checkbox" checked={selected.includes(row.key)} disabled={!selected.includes(row.key)&&selected.length>=2} onChange={e=>setSelected(e.target.checked?[...selected,row.key]:selected.filter(id=>id!==row.key))}/>Select run</label>}
      <pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(row.payload,null,2)}</pre></details>)}
    {!!selected.length&&<button disabled={busy} onClick={()=>{if(!window.confirm('Save or export your current draft before opening selected runs. Continue?'))return;setBusy(true);setError('');void api(`org/${org}/run-context?ids=${selected.map(encodeURIComponent).join(',')}`).then(data=>open(data.bundle)).catch(e=>setError(e.message)).finally(()=>setBusy(false));}}>Open {selected.length} selected run{selected.length===1?'':'s'}</button>}
    {busy&&<p role="status">Loading saved history…</p>}{error&&<p role="alert">{error}</p>}
  </section>;
}
