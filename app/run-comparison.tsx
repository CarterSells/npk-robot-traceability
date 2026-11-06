'use client';
import { useEffect, useRef, useState } from 'react';
import { demoRecords } from '../lib/demo/fixtures';
import { compareRuns, formatField, hardwareStale, snapshotFor } from '../lib/demo/records';
import type { FieldKey } from '../lib/demo/records';

const scenarios = [
  { id: 'run-043', title: 'A failed test', description: 'Inspect a configuration change.' },
  { id: 'run-045', title: 'Missing evidence', description: 'See what the record cannot tell you.' },
  { id: 'run-044', title: 'Different procedure', description: 'Check whether the tests compare.' },
];

export default function RunComparison() {
  const [targetId, setTargetId] = useState('run-043');
  const [filter, setFilter] = useState('All fields');
  const [field, setField] = useState<FieldKey | null>(null);
  const evidencePanel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (field) {
      evidencePanel.current?.focus({ preventScroll: true });
      evidencePanel.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [field]);
  function closeEvidence() {
    document.getElementById(`inspect-${field}`)?.focus();
    setField(null);
  }
  function selectRun(id: string) { setTargetId(id); setField(null); setFilter('All fields'); }
  const baseline = demoRecords.runs.find(r => r.id === 'run-042')!;
  const target = demoRecords.runs.find(r => r.id === targetId)!;
  const result = compareRuns(demoRecords, baseline, target);
  const before = snapshotFor(demoRecords, baseline), after = snapshotFor(demoRecords, target);
  const visibleRows = result.rows.filter(row => filter === 'All fields' || row.result === (filter === 'Changes only' ? 'Changed' : 'Unknown'));
  const selectedRow = result.rows.find(row => row.key === field);
  return <div className="live-comparison">
    <div className="scenario-picker" role="group" aria-label="Example scenarios">{scenarios.map((scenario, index) => <button key={scenario.id} type="button" aria-pressed={targetId === scenario.id} onClick={() => selectRun(scenario.id)}><small>0{index + 1}</small><strong>{scenario.title}</strong><span>{scenario.description}</span></button>)}</div>
    <div className="comparison-toolbar"><div><span className="example-label">SYNTHETIC · WORKING PROTOTYPE</span><strong>Robot 01 / Configuration comparison</strong></div><div><label htmlFor="home-target">Compare baseline run-042 with</label><select id="home-target" value={targetId} onChange={e => selectRun(e.target.value)}><option value="run-043">run-043 · Failed test</option><option value="run-045">run-045 · Incomplete record</option><option value="run-044">run-044 · Different procedure</option></select></div></div>
    <div className="comparison-run-head"><div><small>SUCCESSFUL BASELINE · RUN-042</small><strong>10 / 10 picks</strong><span>{before.id} · revision {before.revision}</span></div><div><small>{target.outcome.toUpperCase()} · {target.id.toUpperCase()}</small><strong>{target.successfulPicks} / {target.attemptedPicks} picks</strong><span>{after.id} · revision {after.revision}</span></div></div>
    <div className="comparison-summary" aria-live="polite"><strong>{result.rows.filter(r => r.result === 'Changed').length} recorded changes</strong><span>{result.rows.filter(r => r.result === 'Unknown').length} unknown comparisons</span></div>
    {result.warnings.length > 0 && <div className="home-warning"><strong>Comparability is limited</strong><ul>{result.warnings.map(w => <li key={w}>{w}</li>)}</ul></div>}
    {hardwareStale(after, target) && <p className="home-warning">Stale manual hardware confirmation: more than 24 hours before this run (illustrative demo policy). Current hardware is not verified.</p>}
    <div className="comparison-filters"><div role="group" aria-label="Filter comparison fields">{['All fields', 'Changes only', 'Unknown only'].map(item => <button key={item} type="button" aria-pressed={filter === item} onClick={() => { setFilter(item); setField(null); }}>{item}</button>)}</div><button type="button" className="reset-comparison" onClick={() => selectRun('run-043')}>Reset example ↺</button><p aria-live="polite" aria-atomic="true">Showing {visibleRows.length} of {result.rows.length} fields. Select a field name to inspect its evidence.</p></div>
    <p className="scroll-hint">On narrow screens, scroll the table horizontally to see both runs and the result.</p>
    <div className="table-scroll" role="region" aria-label="Live synthetic run comparison" tabIndex={0}><table><caption className="sr-only">Recorded values from run-042 and {target.id}; all values are synthetic.</caption><thead><tr><th scope="col">Configuration</th><th scope="col">run-042 · Baseline</th><th scope="col">{target.id} · Selected run</th><th scope="col">Result</th></tr></thead><tbody>{visibleRows.map(row => <tr key={row.key} className={field === row.key ? 'inspected-row' : undefined}><th scope="row"><button type="button" className="field-inspect" id={`inspect-${row.key}`} aria-expanded={field === row.key} aria-controls="field-evidence" onClick={() => setField(field === row.key ? null : row.key)}>{row.label}<span aria-hidden="true"> ↗</span></button>{row.key === 'hardware' && <span className="field-note">Manually reported</span>}</th><td>{formatField(row.before)}</td><td>{formatField(row.after)}</td><td><span className={`badge ${row.result === 'Changed' ? 'changed' : row.result === 'Unchanged' ? 'same' : 'unknown'}`}>{row.result}</span></td></tr>)}</tbody></table></div>
    {!visibleRows.length && <p className="comparison-empty">No fields match this filter. Choose All fields to see the complete record. This does not establish identical physical conditions.</p>}
    <section ref={evidencePanel} tabIndex={-1} id="field-evidence" className="field-evidence" aria-label="Field evidence" hidden={!selectedRow}>
      {selectedRow && <><button type="button" className="close-evidence" onClick={closeEvidence}>Back to selected field ↑</button><p className="eyebrow">SYNTHETIC FIELD EVIDENCE</p><h3>{selectedRow.label}</h3><p>{selectedRow.result} · a recorded comparison, not a causal diagnosis.</p><div className="evidence-columns">{[{ snapshot: before, run: baseline }, { snapshot: after, run: target }].map(({ snapshot, run }) => { const evidence = snapshot.provenance[selectedRow.key]; return <div key={run.id}><h4>{run.id} · {snapshot.id} revision {snapshot.revision}</h4><p>{formatField(snapshot.values[selectedRow.key])}</p><dl><div><dt>Source / method</dt><dd>{evidence.source} / {evidence.method}</dd></div><div><dt>Author</dt><dd>{evidence.author}</dd></div><div><dt>Observed</dt><dd>{evidence.observedAt}</dd></div><div><dt>Recorded</dt><dd>{evidence.recordedAt}</dd></div><div><dt>Evidence reference</dt><dd>{evidence.evidence} · {evidence.available ? 'Available' : 'Unavailable'}</dd></div></dl></div>; })}</div></>}
    </section>
    <div className="comparison-note"><p><strong>Changes are starting points, not proven causes.</strong> Missing values remain unknown. These invented runs demonstrate the actual comparison engine; no customer results are shown.</p></div>
    <details className="home-provenance"><summary>Inspect the example’s context and provenance</summary><p>Baseline run-042 is fixed for this illustration; choose your own baseline in the full demo. Each run references the exact snapshot revision shown above. All entries were manually supplied by “Demo operator.”</p><p>Baseline observed: {before.provenance.hardware.observedAt}; recorded: {before.provenance.hardware.recordedAt}. Selected hardware observed: {after.provenance.hardware.observedAt}; recorded: {after.provenance.hardware.recordedAt}.</p><p>Evidence references and underlying model/dataset artifacts are unavailable. Versions identify recorded references, not verified artifact contents. No cause or resolution is confirmed.</p><a href="/demo/">Inspect each field and its provenance →</a></details>
  </div>;
}
