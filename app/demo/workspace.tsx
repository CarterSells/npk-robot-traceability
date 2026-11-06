'use client';

import { useState } from 'react';
import { demoRecords } from '../../lib/demo/fixtures';
import { compareRuns, fields, formatField, hardwareStale, snapshotFor, staleAfterHours } from '../../lib/demo/records';
import type { Provenance, Run, Snapshot } from '../../lib/demo/records';

function Evidence({ value }: { value: Provenance }) {
  return <dl className="demo-evidence"><dt>Source / method</dt><dd>{value.source} · {value.method}</dd><dt>Author</dt><dd>{value.author}</dd><dt>Observed</dt><dd>{value.observedAt}</dd><dt>Recorded</dt><dd>{value.recordedAt}</dd><dt>Evidence reference</dt><dd>{value.evidence} — {value.available ? 'Available' : 'Unavailable; synthetic reference only'}</dd></dl>;
}
function RecordDetails({ run, snapshot, heading }: { run: Run; snapshot: Snapshot; heading: string }) {
  return <details className="demo-panel demo-record"><summary>{heading}: {run.id} · exact revision &amp; provenance</summary>
    <p><strong>{snapshot.id} · revision {snapshot.revision}</strong> · schema {snapshot.schemaVersion}<br />Run time: {run.at}<br />Outcome: {run.outcome} · {run.successfulPicks}/{run.attemptedPicks} successful picks</p>
    <p className={hardwareStale(snapshot, run) ? 'demo-warning' : ''}>Manual hardware confirmation: {snapshot.hardwareConfirmedAt}. {hardwareStale(snapshot, run) ? `Stale at this run: more than ${staleAfterHours} hours old (demo policy).` : 'Within the demo’s 24-hour window at this run.'} This does not verify current hardware.</p>
    {fields.map(([key, group, label]) => <details className="demo-field" key={key}><summary>{group} / {label}: {formatField(snapshot.values[key])}</summary><Evidence value={snapshot.provenance[key]} /></details>)}
  </details>;
}

export default function Demo({ workspaceAvailable = false }: { workspaceAvailable?: boolean }) {
  const [robotId, setRobotId] = useState('robot-01');
  const [runId, setRunId] = useState('run-043');
  const [baselineId, setBaselineId] = useState('');
  const runs = demoRecords.runs.filter(r => r.robotId === robotId).sort((a, b) => b.at.localeCompare(a.at));
  const run = runs.find(r => r.id === runId);
  const baseline = runs.find(r => r.id === baselineId);
  const snapshot = run ? snapshotFor(demoRecords, run) : undefined;
  const comparison = run && baseline ? compareRuns(demoRecords, baseline, run) : undefined;
  const successes = runs.filter(r => r.outcome === 'success' && r.id !== runId);
  function selectRobot(id: string) {
    setRobotId(id); setBaselineId('');
    const latest = demoRecords.runs.filter(r => r.robotId === id).sort((a, b) => b.at.localeCompare(a.at))[0];
    setRunId(latest?.id ?? '');
  }
  return <div className="demo-app">
    <a className="skip-link" href="#demo-main">Skip to demo</a>
    <div className="demo-banner">SYNTHETIC DEMO · All robots, records, people, and outcomes are invented. No uploads or robot connection.</div>
    <header className="demo-header"><a className="wordmark" href="/">Tavrik</a><span>Example records</span><nav aria-label="Main navigation"><a className="home-link" href="/">Home</a>{workspaceAvailable && <a href="/workspace/">Workspace</a>}<a href="/compatibility/">Compatibility</a><a href="/security/">Security</a></nav></header>
    <main id="demo-main" className="demo-main">
      <div className="demo-title"><p className="eyebrow">FROM “IT WORKED” TO “WHAT CHANGED?”</p><h1>Robot test history</h1><p>Inspect a run. Choose a successful baseline. Investigate recorded differences.</p></div>
      <div className="demo-layout">
        <aside className="demo-sidebar" aria-label="Robot selection"><h2>Robots</h2>{workspaceAvailable && <a className="button demo-add-robot" href="/workspace/">Add your robot</a>}{demoRecords.robots.map(robot => <button key={robot.id} aria-pressed={robot.id === robotId} onClick={() => selectRobot(robot.id)}><strong>{robot.name}</strong><span>{robot.task}</span><small>{demoRecords.runs.filter(r => r.robotId === robot.id).length} synthetic runs</small></button>)}<p>These are example robots. Selections reset on refresh.</p></aside>
        <div className="demo-content">
          <section className="demo-panel" aria-labelledby="history-heading"><div className="demo-section-title"><h2 id="history-heading">Run history</h2><span>{demoRecords.robots.find(r => r.id === robotId)?.name}</span></div>
            {!runs.length ? <p>No runs recorded for this synthetic robot. Select Robot 01 to explore a comparison.</p> : <div className="demo-history">{runs.map(item => <button key={item.id} aria-pressed={item.id === runId} onClick={() => { setRunId(item.id); setBaselineId(''); }}><strong>{item.id}</strong><span className={`badge ${item.outcome === 'success' ? 'same' : 'changed'}`}>{item.outcome}</span><span>{item.successfulPicks}/{item.attemptedPicks} picks</span><small>{item.at.replace('T', ' ')}</small></button>)}</div>}
          </section>
          {run && snapshot && <>
            <section className="demo-panel" aria-labelledby="run-heading"><p className="eyebrow">SELECTED RUN</p><h2 id="run-heading">{run.id} <span className={`badge ${run.outcome === 'success' ? 'same' : 'changed'}`}>{run.outcome}</span></h2>
              <div className="demo-metrics"><div><small>Outcome</small><strong>{run.successfulPicks} / {run.attemptedPicks}</strong><span>successful picks</span></div><div><small>Exact snapshot</small><strong>{snapshot.id}</strong><span>Revision {snapshot.revision} · schema {snapshot.schemaVersion}</span></div><div><small>Missing fields</small><strong>{fields.filter(([key]) => snapshot.values[key].state === 'unknown').length}</strong><span>Unknown is not unchanged</span></div></div>
              {hardwareStale(snapshot, run) && <p className="demo-warning">Stale manual hardware confirmation at this run. Inspect provenance before relying on the hardware record.</p>}
              <label className="demo-label" htmlFor="baseline">Successful baseline</label><select id="baseline" value={baselineId} onChange={e => setBaselineId(e.target.value)}><option value="">Choose a run to compare</option>{successes.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.id} · {candidate.at} · {compareRuns(demoRecords, candidate, run).warnings.length ? 'Comparability warnings' : 'Recorded procedure and conditions match'}</option>)}</select>
              <p className="demo-help">You choose the baseline; none is selected automatically. Matching recorded conditions do not establish a cause or guarantee identical physical conditions.</p>
              {!successes.length && <p>No other successful run is available for this robot.</p>}
            </section>
            {comparison && baseline ? <section className="demo-panel" aria-labelledby="comparison-heading"><p className="eyebrow">{baseline.id} → {run.id}</p><h2 id="comparison-heading">Recorded differences</h2>
              <div aria-live="polite">{comparison.warnings.length ? <div className="demo-warning"><strong>Comparison needs caution</strong><ul>{comparison.warnings.map(w => <li key={w}>{w}</li>)}</ul></div> : <p className="demo-match">Same robot, procedure, object, and recorded conditions; the successful baseline precedes this run.</p>}</div>
              <p>{comparison.rows.filter(r => r.result === 'Changed').length} changed · {comparison.rows.filter(r => r.result === 'Unknown').length} unknown · Differences are not proven causes.</p>
              <p className="demo-help">On narrow screens, scroll each comparison table horizontally to see both runs and the result.</p>
              {[...new Set(fields.map(([, group]) => group))].map(group => <div className="demo-group" key={group}><h3>{group}</h3><div className="table-scroll" role="region" aria-label={`${group} comparison`} tabIndex={0}><table><caption className="sr-only">{group}: {baseline.id} compared with {run.id}</caption><thead><tr><th scope="col">Record</th><th scope="col">{baseline.id}</th><th scope="col">{run.id}</th><th scope="col">Result</th></tr></thead><tbody>{comparison.rows.filter(row => row.group === group).map(row => <tr key={row.key}><th scope="row">{row.label}</th><td>{formatField(row.before)}</td><td>{formatField(row.after)}</td><td><span className={`badge ${row.result === 'Changed' ? 'changed' : row.result === 'Unchanged' ? 'same' : 'unknown'}`}>{row.result}</span></td></tr>)}</tbody></table></div></div>)}
              <p className="demo-help">“Unchanged” refers only to recorded values. Equal model versions do not verify underlying artifacts. Both missing values remain unknown. Both not-applicable values are labeled separately.</p>
              <RecordDetails run={baseline} snapshot={snapshotFor(demoRecords, baseline)} heading="Baseline record" />
              <section className="working-reference"><h3>Working setup reference</h3><p>Reference: <strong>{baseline.id} → {baseline.snapshotId} · revision {baseline.snapshotRevision}</strong>. The recorded success applies to that run and its conditions; it does not guarantee a future result.</p><dl>{comparison.rows.filter(row => row.group !== 'Test conditions').map(row => <div key={row.key}><dt>{row.label}</dt><dd>{formatField(row.before)}</dd></div>)}</dl><h3>Engineer-led recreation checklist</h3><ol><li>Resolve unknown fields and obtain the referenced artifacts; this demo has no artifact files.</li><li>Confirm component identities, firmware, calibration, policy, and dataset lineage against the exact revision.</li><li>Check documented constraints and follow your team’s approved change procedure.</li><li>Repeat the recorded procedure and conditions, then capture a new run to verify the result.</li></ol><p>No changes are sent to a robot. This reference is not a deployable configuration or a verified restoration.</p></section>
            </section> : <p className="demo-empty">Choose a successful baseline above to reveal the comparison.</p>}
            <RecordDetails run={run} snapshot={snapshot} heading="Selected record" />
          </>}
        </div>
      </div>
      <footer className="demo-footer">Synthetic prototype · Evidence files are unavailable · No cause or resolution confirmed · No data is saved or sent</footer>
    </main>
  </div>;
}
