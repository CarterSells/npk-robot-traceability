'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { demoRecords } from '../../lib/demo/fixtures';
import { compareField, compareRuns, fields, formatField, hardwareStale, snapshotFor } from '../../lib/demo/records';
import type { Field, FieldKey, Run, Snapshot } from '../../lib/demo/records';
import { addHardware, addRobot, addRun, appendCapture, correctField, emptyBundle, exportBundle, MAX_BYTES, parseBundle } from '../../lib/local/records';
import type { Bundle, RecordKey } from '../../lib/local/records';
import { fieldFor, provenanceFor } from '../../lib/local/records';
import { compareCustom, formatCustom } from '../../lib/local/custom';
import MetadataImport from './metadata-import';
import InvestigationPanel from './investigation-panel';
import { appendBundle } from '../../lib/beta/records';

const now = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const value = (form: FormData, name: string) => String(form.get(name) ?? '').trim();
function Input({ name, label, initial, type = 'text', help, required = true }: { name: string; label: string; initial?: string; type?: string; help?: string; required?: boolean }) {
  return <label className="local-input">{label}<input name={name} defaultValue={initial} type={type} required={required} maxLength={2048} step={type === 'number' ? '1' : undefined} min={type === 'number' ? '0' : undefined} />{help && <small>{help}</small>}</label>;
}
function Form({ title, children, submit, button }: { title: string; children: ReactNode; submit: (data: FormData) => void; button: string }) {
  const [error, setError] = useState('');
  const alert = useRef<HTMLParagraphElement>(null);
  function handle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try { submit(new FormData(event.currentTarget)); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to save this entry.'); requestAnimationFrame(() => alert.current?.focus()); }
  }
  return <form aria-label={title} onSubmit={handle} className="local-form"><div className="local-form-grid">{children}</div>{error && <p className="local-error" role="alert" tabIndex={-1} ref={alert}>{error}</p>}<button className="local-primary" type="submit">{button}</button></form>;
}
function RunForm({ snapshots, snapshotRef, choose, save }: { snapshots: Snapshot[]; snapshotRef: string; choose: (ref: string) => void; save: (run: Run) => void }) {
  const snapshot = snapshots.find(s => `${s.id}:${s.revision}` === snapshotRef);
  const counts = <><Input name="successful" label="Successful picks" type="number" required={!snapshot?.custom} /><Input name="attempted" label="Attempted picks" type="number" required={!snapshot?.custom} /></>;
  return <Form title="Record a test run" button="Record run" submit={data => {
    if (!snapshot) throw new Error('Choose an exact snapshot revision.');
    save({ id: value(data, 'id'), robotId: snapshot.robotId, snapshotId: snapshot.id, snapshotRevision: snapshot.revision, at: value(data, 'at'), outcome: value(data, 'outcome') as Run['outcome'],
      ...(value(data, 'successful') || value(data, 'attempted') ? { successfulPicks: value(data, 'successful') ? Number(value(data, 'successful')) : undefined, attemptedPicks: value(data, 'attempted') ? Number(value(data, 'attempted')) : undefined } : {}) });
  }}>
    <Input name="id" label="Run ID" />
    <label className="local-input">Exact snapshot revision<select name="snapshot" required value={snapshotRef} onChange={e => choose(e.target.value)}><option value="" disabled>Choose an exact revision</option>{snapshots.map(s => <option key={`${s.id}:${s.revision}`} value={`${s.id}:${s.revision}`}>{s.id} · revision {s.revision} · {fields.filter(([k]) => s.values[k].state === 'unknown').length + (s.custom ?? []).filter(f => f.value.state === 'unknown').length} unknown</option>)}</select></label>
    <div className="local-wide" role="group" aria-label="Test snapshot fields">
      {snapshot ? <><p>This test will use {snapshot.id} · revision {snapshot.revision}. Imported fields update this draft; saved tests keep their original snapshots.</p>
        {snapshot.custom?.map(f => <p key={f.id}><strong>{f.component} / {f.name}</strong>: {formatCustom(f)} <small>({f.category})</small></p>)}
        {!snapshot.custom && <p>Review this snapshot’s configuration and provenance in History.</p>}</> : <p>Import approved metadata, add a collector capture, or choose a recorded setup.</p>}
    </div>
    <Input name="at" label="Run time (UTC)" initial={now()} help="Actual test time; must not precede its recorded observations." />
    <label className="local-input">Outcome<select name="outcome" required defaultValue=""><option value="" disabled>Choose the actual result</option><option value="success">Success</option><option value="failure">Failure</option></select></label>
    {snapshot?.custom ? <details key={snapshotRef} className="local-details local-wide"><summary>Optional picking counts</summary><p>Leave both blank for other tests. Custom measurements above come from the imported file.</p><div className="local-form-grid">{counts}</div></details> : <div key={snapshotRef} className="local-form-grid local-wide">{counts}</div>}
  </Form>;
}
function SnapshotDetails({ snapshot, bundle }: { snapshot: Snapshot; bundle: Bundle }) {
  const later = bundle.records.snapshots.filter(s => s.id === snapshot.id && s.revision > snapshot.revision).length;
  return <details className="local-details"><summary>{snapshot.id} · revision {snapshot.revision} — values and provenance</summary>
    {later > 0 && <p className="local-notice">{later} later revision(s) exist. This reference still resolves to revision {snapshot.revision}.</p>}
    <p>{snapshot.values.hardware.state === 'known' ? `Manual hardware confirmation: ${snapshot.hardwareConfirmedAt}. This is an operator report, not physical verification.` : 'Hardware is not confirmed. Its provenance time records the missing-information declaration, not a physical confirmation.'}</p>
    {fields.map(([key, group, label]) => <details key={key}><summary>{group} / {label}: {formatField(snapshot.values[key])}</summary><dl className="local-provenance"><dt>Source / method</dt><dd>{provenanceFor(snapshot, key).source} / {provenanceFor(snapshot, key).method}</dd><dt>Author</dt><dd>{provenanceFor(snapshot, key).author}</dd><dt>Observed</dt><dd>{provenanceFor(snapshot, key).observedAt}</dd><dt>Recorded</dt><dd>{provenanceFor(snapshot, key).recordedAt}</dd><dt>Evidence reference</dt><dd>{provenanceFor(snapshot, key).evidence}</dd><dt>Availability</dt><dd>{provenanceFor(snapshot, key).available ? 'Reported available; not checked by Tavrik' : 'Unavailable'}</dd></dl></details>)}
    {snapshot.custom?.map(f => <details key={f.id}><summary>{f.component} / {f.name}: {formatCustom(f)}</summary><dl className="local-provenance"><dt>Purpose</dt><dd>{f.category}</dd><dt>Source / method</dt><dd>{f.provenance.source} / {f.provenance.method}</dd><dt>Author</dt><dd>{f.provenance.author}</dd><dt>Observed / recorded</dt><dd>{f.provenance.observedAt} / {f.provenance.recordedAt}</dd><dt>Evidence reference</dt><dd>{f.provenance.evidence}</dd><dt>Availability</dt><dd>{f.provenance.available ? 'Reported available; not checked by Tavrik' : 'Unavailable'}</dd></dl></details>)}
  </details>;
}
function CorrectionForm({ snapshot, save }: { snapshot: Snapshot; save: (key: RecordKey, field: Field, data: FormData) => void }) {
  const [key, setKey] = useState<RecordKey>('hardware');
  const [state, setState] = useState<Field['state']>(snapshot.values.hardware.state);
  const current = fieldFor(snapshot, key);
  const custom = snapshot.custom?.find(f => `custom:${f.id}` === key);
  const example: Record<FieldKey, string> = { hardware: '{"component":"G-02","revision":"B"}', software: '{"commit":"40 lowercase hex characters","dirty":false}', firmware: 'gripper-fw-1.9', model: 'policy-v4', lineage: 'dataset-v13', calibration: 'camera-cal-08', gripForce: '25', procedure: 'pick-v2', object: 'Pick block-A', conditions: '{"speed_m_s":0.25,"ambient_C":22,"payload_kg":1}' };
  const structured = ['hardware', 'software', 'conditions', 'gripForce'].includes(key) || custom?.type === 'number' || custom?.type === 'boolean';
  return <Form key={`${snapshot.id}:${snapshot.revision}:${key}:${state}`} title="Correct a field" button="Append correction" submit={data => {
    let field: Field;
    if (state === 'known') {
      let v = value(data, 'fieldValue');
      if (structured) { try { v = JSON.parse(v); } catch { throw new Error('Field value: enter valid JSON using the example shown.'); } }
      field = { state: 'known', value: v };
    } else field = { state, reason: value(data, 'fieldValue') };
    save(key, field, data);
  }}>
    <label className="local-input">Field to correct<select value={key} onChange={e => { const k = e.target.value as RecordKey; setKey(k); setState(fieldFor(snapshot, k).state); }}>{fields.map(([k, group, label]) => <option key={k} value={k}>{group} / {label}</option>)}{snapshot.custom?.map(f => <option key={f.id} value={`custom:${f.id}`}>{f.component} / {f.name} ({f.unit || f.type})</option>)}</select></label>
    <label className="local-input">Information state<select value={state} onChange={e => setState(e.target.value as Field['state'])}><option value="known">Known</option><option value="unknown">Unknown</option><option value="not-applicable">Not applicable</option></select></label>
    <label className="local-input local-wide">{state === 'known' ? 'Field value' : 'Missing / applicability reason'}<textarea required name="fieldValue" maxLength={2048} rows={3} defaultValue={state === current.state ? current.state === 'known' ? typeof current.value === 'object' ? JSON.stringify(current.value) : String(current.value) : current.reason : ''} />{state === 'known' && <small>Example{structured ? ' (JSON)' : ''}: {custom ? custom.type === 'number' ? `25 (${custom.unit})` : custom.type === 'boolean' ? 'true' : 'text' : example[key as FieldKey]}</small>}</label>
    <Input name="author" label="Correction author" />
    <Input name="observedAt" label="Observed at (UTC)" initial={provenanceFor(snapshot, key).observedAt} help="YYYY-MM-DDTHH:mm:ssZ. When this information was observed, not when you typed it." />
    <Input name="source" label="Evidence source" initial={provenanceFor(snapshot, key).source} />
    <Input name="evidence" label="Evidence reference" initial={provenanceFor(snapshot, key).evidence} />
    <Input name="reason" label="Reason for correction" />
    <label className="local-check"><input name="available" type="checkbox" /> Evidence is reported available</label>
  </Form>;
}

export type HostedWorkspace = { initial: Bundle; readOnly: boolean; comparison?: (runId: string, baselineId: string) => Promise<void>; save: (bundle: Bundle, requestId: string) => Promise<void> };
export default function Workspace({ hosted }: { hosted?: HostedWorkspace } = {}) {
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);
  const [importGeneration, setImportGeneration] = useState(0);
  const [bundle, setBundle] = useState<Bundle>(() => hosted?.initial ?? emptyBundle());
  const [addingRobot, setAddingRobot] = useState(!hosted?.readOnly && !hosted?.initial.records.robots.length);
  const robotForm = useRef<HTMLElement>(null);
  function openRobotForm() {
    setAddingRobot(true);
    requestAnimationFrame(() => robotForm.current?.querySelector('input')?.focus());
  }
  const [view, setView] = useState<'compare' | 'record' | 'history'>('compare');
  const [robotId, setRobotId] = useState(hosted?.initial.records.robots[0]?.id ?? '');
  const [runId, setRunId] = useState('');
  const [baselineId, setBaselineId] = useState('');
  const [snapshotRef, setSnapshotRef] = useState('');
  const [draftSnapshotRef, setDraftSnapshotRef] = useState('');
  const [runFormGeneration, setRunFormGeneration] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(hosted?.readOnly ? 'Viewer access: compare and export saved records.' : hosted?.initial.records.robots.length ? 'Saved organization records loaded. Changes need an explicit save.' : 'Add your first robot, or import an existing record file.');
  const [error, setError] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const captureFile = useRef<HTMLInputElement>(null);
  const importError = useRef<HTMLParagraphElement>(null);
  const pendingSave = useRef({ body: '', id: '' });
  async function saveShared() {
    if (!hosted || hosted.readOnly) return;
    setBusy(true); setError('');
    try {
      const body = exportBundle(bundle);
      if (pendingSave.current.body !== body) pendingSave.current = { body, id: crypto.randomUUID() };
      await hosted.save(bundle, pendingSave.current.id);
      setDirty(false); pendingSave.current = { body: '', id: '' }; setMessage('Saved to the organization workspace.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Save failed. Your draft remains in this tab.'); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  function replace(next: Bundle, label: string) {
    setDraftSnapshotRef('');
    setImportGeneration(n => n + 1);
    setAddingRobot(next.records.robots.length === 0);
    setView('compare');
    setBundle(next); setRobotId(next.records.robots[0]?.id ?? ''); setRunId(''); setBaselineId(''); setSnapshotRef(''); setDirty(false); setError(''); setMessage(label);
  }
  function allowReplace() { return !dirty || window.confirm('This workspace has changes. Export first to keep them. Replace the workspace?'); }
  function commit(next: Bundle, label: string) { if (hosted?.readOnly) throw new Error('Viewers cannot edit records.'); setBundle(next); setDirty(true); setMessage(hosted ? `${label.replace(/Export to save[^.]*\./g, '')} Save to organization to retain this draft.` : label); setError(''); }
  const robots = bundle.records.robots;
  const runs = bundle.records.runs.filter(r => r.robotId === robotId).sort((a, b) => b.at.localeCompare(a.at));
  const snapshots = bundle.records.snapshots.filter(s => s.robotId === robotId).sort((a, b) => a.id.localeCompare(b.id) || b.revision - a.revision);
  const ref = (s: Snapshot) => `${s.id}:${s.revision}`;
  const selected = snapshots.find(s => ref(s) === snapshotRef) ?? snapshots[0];
  const latest = selected && Math.max(...snapshots.filter(s => s.id === selected.id).map(s => s.revision)) === selected.revision;
  const run = runs.find(r => r.id === runId), baseline = runs.find(r => r.id === baselineId);
  const observedComparisons = useRef(new Set<string>());
  useEffect(() => {
    if (view !== 'compare' || !hosted?.comparison || !run || !baseline || baseline.outcome !== 'success' || baseline.at >= run.at) return;
    if (![run.id,baseline.id].every(id => hosted.initial.records.runs.some(r => r.id === id))) return;
    const key = JSON.stringify([run.id,baseline.id,new Date().toISOString().slice(0,10)]);
    if (observedComparisons.current.has(key)) return;
    observedComparisons.current.add(key);
    void hosted.comparison(run.id,baseline.id).catch(() => { observedComparisons.current.delete(key); });
  }, [view,run,baseline,hosted]);
  function compareLocal(a: NonNullable<typeof run>, b: NonNullable<typeof run>) {
    const core = compareRuns(bundle.records, a, b), custom = compareCustom(snapshotFor(bundle.records, a), snapshotFor(bundle.records, b));
    return { rows: [...core.rows, ...custom.rows], warnings: [...core.warnings, ...custom.warnings] };
  }
  const comparison = run && baseline ? compareLocal(baseline, run) : undefined;
  async function importFile(selectedFile: File | undefined, append = false) {
    if (!selectedFile) return;
    setBusy(true); setError('');
    try {
      if (selectedFile.size > MAX_BYTES) throw new Error('File: maximum size is 2 MiB.');
      const next = parseBundle(await selectedFile.text());
      if (append) {
        const merged = appendCapture(bundle, next);
        commit(merged, 'Capture added. Existing records retained; identical records are not duplicated. Export to save this workspace.');
        setRobotId(next.records.robots[0].id); setSnapshotRef(`${next.records.snapshots[0].id}:1`);
        setRunId(next.records.runs[0]?.id ?? ''); setBaselineId(''); setAddingRobot(false);
        setDraftSnapshotRef(next.records.runs.length ? '' : `${next.records.snapshots[0].id}:1`);
        setView(next.records.runs.length ? 'compare' : 'record');
      } else if (hosted) commit(appendBundle(bundle, next), 'Imported records appended. Existing history retained.');
      else if (allowReplace()) replace(next, `Imported ${next.records.runs.length} runs. Original file remains unchanged.`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Import failed.'); requestAnimationFrame(() => importError.current?.focus()); }
    finally { setBusy(false); if (file.current) file.current.value = ''; if (captureFile.current) captureFile.current.value = ''; }
  }
  function download() {
    try {
      const url = URL.createObjectURL(new Blob([exportBundle(bundle)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = `tavrik-${bundle.synthetic ? 'synthetic' : 'local'}-records.json`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000); if (!hosted) setDirty(false); setMessage('Export download requested. Keep the file outside the repository and verify it saved.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Export failed.'); }
  }
  return <div className="local-app" data-hosted={!!hosted} data-readonly={hosted?.readOnly ?? false}><a className="skip-link" href="#local-main">Skip to workspace</a>
    {!hosted && <header className="local-header"><a className="wordmark" href="/">Tavrik</a><span>WORKSPACE</span><nav aria-label="Main navigation"><a href="/">Home</a><a href="http://127.0.0.1:3002/">Private beta</a><a href="/demo/">Example records</a><a href="/security/">Data handling</a></nav></header>}
    <main id="local-main" className="local-main"><div className="local-title"><div><h1>Robot records</h1><p>Record a setup. Compare tests. Keep the history.</p></div><div className="local-memory"><strong>{dirty ? hosted ? 'Unsaved organization draft' : 'Changes awaiting export' : hosted ? 'Organization records loaded' : 'Ready to record'}</strong><span>{hosted ? 'Save changes to retain them for your team' : 'Stored in this tab · export to save'}</span></div><button className="local-primary local-add-robot" disabled={!ready || busy || hosted?.readOnly} aria-controls="add-robot" aria-expanded={addingRobot} onClick={openRobotForm}>Add robot</button></div>
      <p className="local-notice">{hosted ? 'Saved records persist in your organization. Draft edits stay in this tab until you choose Save to organization. Imported authors remain reported authors; the authenticated submitter is recorded separately.' : 'Records stay in this tab until you export. Refreshing or closing loses the session.'} Import only approved metadata and references; keep private exports outside this repository. Evidence references are displayed as text and never fetched.</p>
      {!ready && <p className="local-notice">Loading workspace. JavaScript must be enabled before you can enter records.</p>}<fieldset disabled={!ready || busy} className="local-workspace"><legend className="sr-only">Local record workspace</legend>
        <section className="local-toolbar" aria-label="Workspace files">{hosted && <button className="local-primary" disabled={!dirty || hosted.readOnly} onClick={() => void saveShared()}>Save to organization</button>}<label className="local-file">Import JSON<input ref={file} type="file" accept=".json,application/json" onChange={e => void importFile(e.target.files?.[0])} /></label><button onClick={download} disabled={!robots.length}>Export JSON</button>{!hosted && <><button onClick={() => { if (allowReplace()) replace(parseBundle(JSON.stringify({ format: 'unify-local', version: 1, synthetic: true, records: demoRecords, corrections: [] })), 'Synthetic example loaded. All additions to this workspace remain synthetic.'); }}>Load synthetic example</button><button onClick={() => { if (allowReplace()) replace(emptyBundle(), 'Empty workspace. Add a robot or import records.'); }}>Clear workspace</button></>}</section>
        <p role="status" className="local-status">{busy ? 'Working…' : message}</p>{error && <p className="local-error" role="alert" ref={importError} tabIndex={-1}>{error} Current records were retained.</p>}
        <details className="local-details"><summary>Capture from your test setup</summary><p>Run the local Python collector on your development machine or robot computer, inspect its JSON output, then add it here. Each capture preserves earlier records. {hosted ? 'Save approved records to your organization, or configure a scoped collector credential.' : 'Nothing is uploaded.'}</p><ol><li>Configure explicit source paths and a manual hardware manifest using <code>docs/collector.md</code> in the project.</li><li>Preview with <code>python collector/unify_collector.py capture --config /path/to/config.json --dry-run</code>.</li><li>Capture before the test, then use <code>attach-run</code> to bind its result to that exact snapshot. You can also add a run through Record.</li></ol><label className="local-file">Add collector capture<input ref={captureFile} type="file" accept=".json,application/json" onChange={e => void importFile(e.target.files?.[0], true)} /></label><p className="local-help">Adds one snapshot and optionally its run. Identical reimports are safe; conflicting IDs are rejected. Synthetic and real records stay separate. {hosted ? 'Import JSON appends approved records without replacing history.' : 'Import JSON above replaces a full workspace.'}</p></details>
        {!hosted?.readOnly && <MetadataImport key={`${importGeneration}:${robotId}`} bundle={bundle} robotId={robotId} save={(next, id) => { commit(next, 'Approved metadata snapshot added. Test draft updated with its exact snapshot and custom fields. Choose the actual result, then record the run. Export to save.'); setSnapshotRef(`${id}:1`); setDraftSnapshotRef(`${id}:1`); setView('record'); setAddingRobot(false); }} />}
        <div className="local-stats"><span className="local-mode">{bundle.synthetic ? 'SYNTHETIC · Invented records, including edits' : hosted ? 'ORGANIZATION RECORDS · User supplied, unverified' : 'LOCAL RECORDS · User supplied, unverified'}</span><span><strong>{robots.length}</strong> robots</span><span><strong>{bundle.records.runs.length}</strong> runs</span><span><strong>{bundle.corrections.length}</strong> corrections</span></div>
        <div className="local-layout"><aside className="local-sidebar"><h2>Robots</h2>{robots.length ? robots.map(robot => <button key={robot.id} aria-pressed={robot.id === robotId} onClick={() => { setRobotId(robot.id); setRunId(''); setBaselineId(''); setSnapshotRef(''); setView('compare'); setAddingRobot(false); }}><strong>{robot.name}</strong><small>{robot.task}</small><small>{robot.id}</small></button>) : <p>Your robots will appear here.</p>}
          </aside><div className="local-content"><section id="add-robot" ref={robotForm} hidden={!addingRobot} className="local-panel local-create" aria-labelledby="add-robot-title"><h2 id="add-robot-title">Add a robot</h2><p>Give your robot a name and stable ID. Next, record its hardware and first test.</p><Form key={robots.length} title="Add a robot" button="Add robot" submit={data => { const id = value(data, 'id'); commit(addRobot(bundle, { id, name: value(data, 'name'), task: value(data, 'task') }), 'Robot added. Record its hardware next.'); setRobotId(id); setRunId(''); setBaselineId(''); setSnapshotRef(''); setView('record'); setAddingRobot(false); }}><Input name="id" label="Robot ID" help="Stable ID, for example arm-01." /><Input name="name" label="Robot name" /><Input name="task" label="Task / cell" /></Form>{robots.length > 0 && <button className="local-cancel" onClick={() => setAddingRobot(false)}>Cancel</button>}</section>
          <div className="local-views" hidden={addingRobot} role="group" aria-label="Workspace views">{(['compare', 'record', 'history'] as const).map(item => <button key={item} type="button" aria-pressed={view === item} aria-controls={item === 'compare' || (item === 'record' ? robotId : selected) ? `view-${item}` : undefined} disabled={item === 'record' ? !robotId : item === 'history' ? !selected : false} onClick={() => setView(item)}>{item === 'compare' ? 'Compare' : item === 'record' ? 'Record' : 'History'}</button>)}</div>
          <section id="view-compare" hidden={addingRobot || view !== 'compare'} className="local-panel" aria-labelledby="compare-title"><h2 id="compare-title">What changed between runs?</h2><p>Choose the target and a successful baseline. Differences are facts to investigate, not proven causes.</p>
            {!runs.length ? <p className="local-empty">No runs for this robot. Import a record, or select a robot and open Record to add a hardware snapshot and test run.</p> : <><div className="local-form-grid"><label className="local-input">Target run<select value={runId} onChange={e => { setRunId(e.target.value); setBaselineId(''); }}><option value="">Choose a run</option>{runs.map(r => <option key={r.id} value={r.id}>{r.id} · {r.outcome} · {r.at}</option>)}</select></label><label className="local-input">Successful baseline<select value={baselineId} disabled={!run} onChange={e => setBaselineId(e.target.value)}><option value="">Choose a baseline</option>{runs.filter(r => r.outcome === 'success' && r.id !== runId).map(r => <option key={r.id} value={r.id}>{r.id} · {run && compareLocal(r, run).warnings.length ? 'Comparability limited' : 'Recorded conditions match'}</option>)}</select></label></div>
            {run && <div className="local-run"><strong>{run.id}: {run.outcome}{run.attemptedPicks !== undefined ? ` · ${run.successfulPicks}/${run.attemptedPicks} successful picks` : ' · pick counts not applicable / not supplied'}</strong><p>Exact reference: {run.snapshotId} · revision {run.snapshotRevision} · {run.at}</p>{hardwareStale(snapshotFor(bundle.records, run), run) && <p className="local-warning">Stale manual hardware report at this run: over 24 hours old (prototype policy, not a validated team requirement).</p>}<SnapshotDetails snapshot={snapshotFor(bundle.records, run)} bundle={bundle} /></div>}
            {comparison && baseline && run && <><div className="local-comparison-summary"><strong>{comparison.rows.filter(r => r.result === 'Changed').length} recorded changes</strong><span>{comparison.rows.filter(r => r.result === 'Unknown').length} unknown fields</span></div>{comparison.warnings.length > 0 ? <div className="local-warning"><strong>Comparability is limited</strong><ul>{comparison.warnings.map(w => <li key={w}>{w}</li>)}</ul></div> : <p className="local-match">Recorded procedure, object and conditions match; baseline precedes the target. Physical conditions are not independently verified.</p>}<p className="local-help">Scroll the table on narrow screens. Unknown never means unchanged.</p><div className="local-table" role="region" aria-label="Run comparison" tabIndex={0}><table><caption className="sr-only">{baseline.id} compared with {run.id}</caption><thead><tr><th scope="col">Record</th><th scope="col">{baseline.id}</th><th scope="col">{run.id}</th><th scope="col">Result</th></tr></thead><tbody>{comparison.rows.map(row => <tr key={row.key}><th scope="row"><small>{row.group}</small>{row.label}</th><td>{formatField(row.before)}</td><td>{formatField(row.after)}</td><td><span className={`local-result result-${row.result.toLowerCase().replace(' ', '-')}`}>{row.result}</span></td></tr>)}</tbody></table></div><p className="local-help">Baseline reference: {baseline.snapshotId} · revision {baseline.snapshotRevision}</p>{hardwareStale(snapshotFor(bundle.records, baseline), baseline) && <p className="local-warning">Stale baseline hardware report: over 24 hours old at the baseline run (prototype policy).</p>}<SnapshotDetails snapshot={snapshotFor(bundle.records, baseline)} bundle={bundle} /></>}
            <details className="local-details"><summary>Run history ({runs.length})</summary>{runs.map(r => <p key={r.id}><strong>{r.id}</strong> · {r.outcome} · {r.at}<br />{r.snapshotId} · revision {r.snapshotRevision}</p>)}</details></>}
            <InvestigationPanel key={`${importGeneration}:${robotId}:${runId}`} bundle={bundle} runId={runId} baselineId={baselineId} chooseBaseline={setBaselineId} commit={commit} readOnly={hosted?.readOnly} />
          </section>
          {robotId && <section id="view-record" hidden={addingRobot || view !== 'record'} className="local-panel" aria-labelledby="capture-title"><h2 id="capture-title">Hardware &amp; test records</h2><details className="local-details"><summary>Record a hardware change / initial setup</summary><p>Creates a new snapshot. Other fields start unknown. Use History to fill them through field corrections before recording a run. Use History to correct a mistake in an existing record.</p><Form title="Record hardware" button="Record hardware" submit={data => { const id = value(data, 'id'); commit(addHardware(bundle, { id, robotId, component: value(data, 'component'), revision: value(data, 'revision'), author: value(data, 'author'), observedAt: value(data, 'observedAt'), evidence: value(data, 'evidence'), available: data.has('available') }, now()), 'New hardware snapshot recorded. Other configuration fields remain unknown.'); setSnapshotRef(`${id}:1`); }}><Input name="id" label="New snapshot ID" help="Unique reference, for example arm-01-setup-002." /><Input name="component" label="Gripper / component identity" /><Input name="revision" label="Hardware revision" /><Input name="author" label="Reporting author" /><Input name="observedAt" label="Hardware confirmed at (UTC)" initial={now()} /><Input name="evidence" label="Hardware evidence reference" initial="No evidence supplied" /><label className="local-check"><input type="checkbox" name="available" /> Evidence is reported available</label></Form></details>
            <details className="local-details" open={!!draftSnapshotRef}><summary>Record a test run</summary>{snapshots.length ? <RunForm key={`${importGeneration}:${robotId}:${runFormGeneration}`} snapshots={snapshots} snapshotRef={snapshots.some(s => ref(s) === draftSnapshotRef) ? draftSnapshotRef : ''} choose={setDraftSnapshotRef} save={entry => { commit(addRun(bundle, entry), 'Run recorded with its exact snapshot revision.'); setRunId(entry.id); setBaselineId(''); setRunFormGeneration(n => n + 1); setView('compare'); }} /> : <p>Import approved metadata or record hardware to create a snapshot.</p>}</details>
          </section>}
          {selected && <section id="view-history" hidden={addingRobot || view !== 'history'} className="local-panel" aria-labelledby="revision-title"><h2 id="revision-title">Snapshot revisions</h2><label className="local-input">Inspect snapshot revision<select value={ref(selected)} onChange={e => setSnapshotRef(e.target.value)}>{snapshots.map(s => <option key={ref(s)} value={ref(s)}>{s.id} · revision {s.revision}</option>)}</select></label><SnapshotDetails snapshot={selected} bundle={bundle} />
            <details className="local-details"><summary>Correct a recorded field</summary><p>Appends a revision with your author, reason, and observation time. Existing runs keep their original reference. To record a physical change, open Record and create a new hardware snapshot.</p>{latest ? <CorrectionForm key={ref(selected)} snapshot={selected} save={(key, field, data) => { const next = correctField(bundle, selected, key, field, { source: value(data, 'source'), method: key === 'hardware' ? 'Manual hardware correction' : 'Manual metadata correction', author: value(data, 'author'), observedAt: value(data, 'observedAt'), recordedAt: now(), evidence: value(data, 'evidence'), available: data.has('available') }, value(data, 'reason')); commit(next, 'Correction appended. Existing run references are unchanged.'); setSnapshotRef(`${selected.id}:${selected.revision + 1}`); }} /> : <p className="local-notice">This is a historical revision. Select the latest revision of this snapshot to append a correction.</p>}</details>
            <h3>Correction history</h3>{bundle.corrections.filter(c => c.snapshotId === selected.id).length ? <ol className="local-timeline">{bundle.corrections.filter(c => c.snapshotId === selected.id).map(c => { const a = snapshots.find(s => s.id === c.snapshotId && s.revision === c.priorRevision)!; const b = snapshots.find(s => s.id === c.snapshotId && s.revision === c.revision)!; return <li key={c.revision}><strong>Revision {c.priorRevision} → {c.revision} · {c.field}</strong><p>{c.reason}</p><p>{formatField(fieldFor(a, c.field))} → {formatField(fieldFor(b, c.field))} ({compareField(fieldFor(a, c.field), fieldFor(b, c.field))}; provenance may also change)</p><small>{c.author} · recorded {c.recordedAt}</small></li>; })}</ol> : <p>No corrections to this snapshot.</p>}
          </section>}
        </div></div>
      </fieldset><footer className="local-footer">{hosted ? 'Tavrik private workspace · Approved metadata only · Differences do not establish causes' : 'Tavrik workspace · Manual records and local collector imports · No network ingestion or cloud backup'}</footer>
    </main></div>;
}



