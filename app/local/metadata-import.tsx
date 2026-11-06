'use client';

import { useRef, useState } from 'react';
import { addMappedSnapshot, MAX_BYTES } from '../../lib/local/records';
import type { Bundle } from '../../lib/local/records';
import { applyMapping, exportMapping, formatCustom, inspectSource, parseMapping } from '../../lib/local/custom';
import type { Mapping, MappingField, SourceDocument } from '../../lib/local/custom';

const now = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
export default function MetadataImport({ bundle, robotId, save }: { bundle: Bundle; robotId: string; save: (bundle: Bundle, snapshotId: string) => void }) {
  const [document, setDocument] = useState<SourceDocument>();
  const [mapping, setMapping] = useState<Mapping>();
  const [profile, setProfile] = useState('');
  const [row, setRow] = useState(0);
  const [author, setAuthor] = useState('');
  const [observed, setObserved] = useState(now);
  const [source, setSource] = useState('Approved engineer metadata export');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const alert = useRef<HTMLParagraphElement>(null);
  function failed(e: unknown) { setError(e instanceof Error ? e.message : 'Unable to read metadata.'); requestAnimationFrame(() => alert.current?.focus()); }
  async function read(file: File | undefined, isMapping = false) {
    if (!file) return;
    setBusy(true); setError('');
    try {
      if (file.size > MAX_BYTES) throw new Error('Maximum file size is 2 MiB.');
      const raw = await file.text();
      if (isMapping) { const m = parseMapping(raw); setMapping(m); setProfile(m.id); }
      else {
        if (!/\.(json|csv)$/i.test(file.name)) throw new Error('Choose a JSON or CSV metadata file.');
        const doc = inspectSource(raw, /\.csv$/i.test(file.name) ? 'csv' : 'json');
        setDocument(doc); setRow(0);
        if (!profile) setMapping({ id: crypto.randomUUID(), name: 'Engineer metadata', format: doc.format, fields: [] });
      }
    } catch (e) { if (!isMapping) setDocument(undefined); failed(e); }
    finally { setBusy(false); }
  }
  function update(id: string, change: Partial<MappingField>) { if (mapping) setMapping({ ...mapping, fields: mapping.fields.map(f => f.id === id ? { ...f, ...change } : f) }); }
  function download() {
    try {
      if (!mapping) return;
      const url = URL.createObjectURL(new Blob([exportMapping(mapping)], { type: 'application/json' }));
      const link = window.document.createElement('a'); link.href = url; link.download = 'tavrik-mapping.json'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) { failed(e); }
  }
  let preview: ReturnType<typeof applyMapping> = [], previewError = '';
  if (document && mapping?.fields.length) {
    try { preview = applyMapping(mapping, document, row, { source, author: author || 'Preview', observedAt: observed, recordedAt: now(), evidence: 'Approved mapping', method: 'Preview', available: false }); }
    catch (e) { previewError = e instanceof Error ? e.message : 'Review the mapping.'; }
  }
  return <details className="local-details"><summary>Import engineer metadata · JSON / CSV</summary>
    <p>Bring your robot’s components, settings, measurements, part numbers and CAD revision references from JSON or CSV exports. Select approved fields once, confirm their meaning and units, then reuse the mapping. Adding an approved snapshot automatically fills the test draft. Files stay in this tab; unselected fields are excluded from snapshots and exports.</p>
    {!robotId ? <p>Select or add a robot first.</p> : <fieldset disabled={busy} className="local-workspace"><legend className="sr-only">Engineer metadata import</legend>
      <div className="local-form-grid">
        <label className="local-input">Field mapping<select value={profile} onChange={e => { const id = e.target.value; setProfile(id); setMapping(id ? bundle.mappings?.find(m => m.id === id) : document ? { id: crypto.randomUUID(), name: 'Engineer metadata', format: document.format, fields: [] } : undefined); }}><option value="">Create a mapping</option>{bundle.mappings?.map(m => <option key={m.id} value={m.id}>{m.name} · {m.format}</option>)}{profile && !bundle.mappings?.some(m => m.id === profile) && <option value={profile}>Imported mapping · {mapping?.name}</option>}</select></label>
        <label className="local-file">Open mapping file<input type="file" accept=".json" onChange={e => { void read(e.target.files?.[0], true); e.target.value = ''; }} /></label>
        <label className="local-file">Engineer metadata file<input type="file" accept=".json,.csv" onChange={e => { void read(e.target.files?.[0]); e.target.value = ''; }} /></label>
        {document && document.format === 'csv' && <label className="local-input">CSV data row<select value={row} onChange={e => setRow(Number(e.target.value))}>{document.rows.map((_, i) => <option key={i} value={i}>Row {i + 1}</option>)}</select></label>}
      </div>
      {document && mapping && <>
        {!profile && <><label className="local-input">Mapping name<input maxLength={120} value={mapping.name} onChange={e => setMapping({ ...mapping, name: e.target.value })} /></label><p>Select only approved metadata. Numbers require explicit units; use “1” for dimensionless values. Do not select secrets, source, raw data or recordings. Field-name filtering is an additional check, not a substitute for your review.</p>
          {document.candidates.map(c => { const f = mapping.fields.find(f => f.source === c.source); return <div className="local-mapping-field" key={c.source}>
            <label className="local-check"><input type="checkbox" checked={!!f} disabled={c.blocked} onChange={e => setMapping({ ...mapping, fields: e.target.checked ? [...mapping.fields, { id: crypto.randomUUID(), source: c.source, component: c.component, name: c.name, type: c.type, unit: c.unit, category: 'configuration', ...(c.unitSource ? { unitSource: c.unitSource } : {}) }] : mapping.fields.filter(f => f.source !== c.source) })} />{c.source}{c.blocked ? ' · blocked sensitive field' : ''}</label>
            {f && <div className="local-form-grid"><label className="local-input">Component<input value={f.component} maxLength={120} onChange={e => update(f.id, { component: e.target.value })} /></label><label className="local-input">Measurement / field name<input value={f.name} maxLength={120} onChange={e => update(f.id, { name: e.target.value })} /></label><label className="local-input">Value type<select value={f.type} onChange={e => update(f.id, { type: e.target.value as MappingField['type'], unit: e.target.value === 'number' ? c.unit : '' })}><option value="number">Number</option><option value="text">Text</option><option value="boolean">True / false</option></select></label>{f.type === 'number' && <label className="local-input">Unit<input value={f.unit} maxLength={40} onChange={e => update(f.id, { unit: e.target.value })} /></label>}<label className="local-input">Field purpose<select value={f.category} onChange={e => update(f.id, { category: e.target.value as MappingField['category'] })}><option value="configuration">Configuration</option><option value="condition">Test condition</option><option value="measurement">Measurement</option></select></label></div>}
          </div>; })}
        </>}
        {profile && <><p>Reusing {mapping.name}. Only its {mapping.fields.length} approved fields are captured. Additional source fields are ignored. Missing values, changed types and declared unit mismatches remain unknown. Import the same mapping on teammates’ machines to preserve field identities.</p><button type="button" onClick={() => { setProfile(''); setMapping({ ...mapping, id: crypto.randomUUID(), name: `${mapping.name.slice(0, 107)} (revised)` }); }}>Review a mapping copy</button></>}
        <div className="local-form-grid"><label className="local-input">Import author<input value={author} maxLength={512} onChange={e => setAuthor(e.target.value)} /></label><label className="local-input">Metadata observed at (UTC)<input value={observed} onChange={e => setObserved(e.target.value)} /><small>YYYY-MM-DDTHH:mm:ssZ · time represented by the source file</small></label><label className="local-input">Metadata source reference<input value={source} maxLength={512} onChange={e => setSource(e.target.value)} /></label></div>
        <h3>Approved snapshot preview</h3>{previewError && <p className="local-warning">{previewError}</p>}{!mapping.fields.length && <p>Select at least one field.</p>}
        {preview.map(f => <p key={f.id}><strong>{f.component} / {f.name}</strong>: {formatCustom(f)} <small>({f.category})</small></p>)}
        <p className="local-help">File metadata does not verify physical hardware or interpret CAD geometry. Core fields not supplied here remain unknown. Adding this snapshot selects its exact revision and custom fields in the test draft; enter the actual test result to save a run.</p>
        <button type="button" disabled={!preview.length || !!previewError || !author.trim()} className="local-primary" onClick={() => { try { const id = `metadata-${crypto.randomUUID()}`; const next = addMappedSnapshot(bundle, { id, robotId, mapping, document, row, provenance: { source, method: 'Engineer-approved metadata', author, observedAt: observed, recordedAt: now(), evidence: 'Approved mapping', available: false } }); save(next, id); setProfile(mapping.id); setError(''); } catch (e) { failed(e); } }}>Add approved snapshot</button>{' '}<button type="button" onClick={download} disabled={!preview.length || !!previewError}>Download mapping</button>
      </>}
      {error && <p role="alert" className="local-error" ref={alert} tabIndex={-1}>{error}</p>}
    </fieldset>}
  </details>;
}
