'use client';
import { useState } from 'react';
import { assessCombination, combinationFrom, compatibilityRule } from '../../lib/demo/compatibility';
import { demoRecords } from '../../lib/demo/fixtures';
import { snapshotFor } from '../../lib/demo/records';

export default function Registry() {
  const [runId, setRunId] = useState('run-043');
  const run = demoRecords.runs.find(r => r.id === runId)!;
  const combination = combinationFrom(snapshotFor(demoRecords, run));
  const assessment = assessCombination(combination);
  return <div className="m-wrap info-page"><p className="eyebrow">SYNTHETIC COMPATIBILITY PREVIEW</p><h1>Known combinations.<br /><span>Explicit limits.</span></h1><p className="home-intro">A registry for documented firmware, calibration, and policy constraints. Every rule here is invented to demonstrate the workflow. No real hardware or software combination has been validated.</p>
    <section className="info-card"><h2>Check a synthetic run</h2><label htmlFor="compat-run">Run configuration</label><select id="compat-run" value={runId} onChange={e => setRunId(e.target.value)}>{demoRecords.runs.map(r => <option key={r.id} value={r.id}>{r.id} · {r.robotId} · {r.outcome}</option>)}</select><dl className="info-facts">{(['hardware','firmware','calibration','model','procedure','object'] as const).map(key => <div key={key}><dt>{key}</dt><dd>{combination[key] || 'Unknown or not applicable'}</dd></div>)}</dl><div className="compat-result" aria-live="polite"><strong>{assessment}</strong><p>{assessment === 'Synthetic known-bad match' ? 'All six recorded values match the invented rule below. This is an illustration, not a diagnosis of this run or a real safety determination.' : assessment === 'Not assessed' ? 'No exact rule covers these recorded values. Absence of a match does not mean compatible, safe, or tested.' : 'Required configuration information is missing or not applicable. No compatibility conclusion is possible.'}</p></div></section>
    <section className="info-card"><p className="example-label">INVENTED KNOWN-BAD EXAMPLE</p><h2>{compatibilityRule.id} · revision {compatibilityRule.revision}</h2><p>{compatibilityRule.finding}</p><dl className="info-facts"><div><dt>Hardware scope</dt><dd>G-02 / revision B</dd></div><div><dt>Combination</dt><dd>gripper-fw-1.9 + camera-cal-08 + pick-policy-v4</dd></div><div><dt>Procedure scope</dt><dd>pick-v2; block-A picking</dd></div><div><dt>Author / recorded</dt><dd>{compatibilityRule.author} / {compatibilityRule.recordedAt}</dd></div><div><dt>Evidence</dt><dd>{compatibilityRule.evidence}</dd></div><div><dt>Validation status</dt><dd>Synthetic only. No verified customer constraint.</dd></div></dl><p>A real rule needs repeatable checks, an identified author, exact scope, version history, and accessible evidence. A changed version alone does not establish incompatibility.</p></section>
    <p><a href="/demo/">Inspect the full run and working setup reference →</a></p><p className="info-footnote">Read-only synthetic registry. No enforcement, deployment, automatic rollback, or robot communication.</p></div>;
}
