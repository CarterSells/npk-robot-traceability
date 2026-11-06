import {test} from 'node:test';
import assert from 'node:assert/strict';
import {demoRecords} from '../lib/demo/fixtures.ts';
import {appendInvestigation,exportBundle,parseBundle,correctField} from '../lib/local/records.ts';
import {suggestedBaseline,investigationReport} from '../lib/local/investigations.ts';
import {appendBundle} from '../lib/beta/records.ts';
const fixture=()=>structuredClone({format:'unify-local',version:1,synthetic:true,records:demoRecords,corrections:[]});
const entry={id:'10000000-0000-4000-8000-000000000001',revision:1,runId:'run-043',baselineId:'run-042',state:'investigating',author:'Synthetic engineer',recordedAt:'2026-10-15T12:00:00Z',note:'Inspect the calibration change.',evidenceNote:'',retestId:''};
test('investigation creation, resolution, export and append preserve exact history',()=>{
 const initial=fixture(),a=appendInvestigation(initial,entry);
 const b=appendInvestigation(a,{...entry,revision:2,state:'confirmed-by-engineer',note:'Reviewed calibration evidence.',evidenceNote:'Synthetic inspection note, not customer evidence.'});
 assert.deepEqual(parseBundle(exportBundle(b)),b);assert.equal(initial.investigations,undefined);
 assert.deepEqual(appendBundle(a,b),b);
 const snapshot=b.records.snapshots.find(s=>s.id==='snap-043');
 const c=correctField(b,snapshot,'calibration',{state:'known',value:'corrected'},{...snapshot.provenance.calibration,method:'Manual correction',author:'Synthetic reviewer',recordedAt:'2026-10-15T12:01:00Z'},'Transcription correction');
 const report=investigationReport(c.records,c.investigations,entry.id,true);
 assert.equal(report.evidence[1].snapshot.revision,1);assert.equal(report.history.length,2);assert.equal(report.synthetic,true);
 assert.ok(report.evidence.some(e=>e.unavailableCoreEvidence.length));
});
test('invalid confirmations, broken references and rewritten history are rejected',()=>{
 for(const change of [{state:'confirmed-by-engineer'},{baselineId:'run-043'},{retestId:'absent'},{revision:2},{secret:'not allowed'}]) assert.throws(()=>appendInvestigation(fixture(),{...entry,...change}));
 const a=appendInvestigation(fixture(),entry);
 assert.throws(()=>appendInvestigation(a,{...entry,revision:2,baselineId:'run-041'}));
 const b=structuredClone(a);b.investigations[0].note='overwrite';assert.throws(()=>appendBundle(a,b),/conflicts/);
});
test('suggestion requires known matching core and custom conditions',()=>{
 const b=fixture();assert.equal(suggestedBaseline(b.records,'run-043')?.id,'run-042');
 const s=b.records.snapshots.find(s=>s.id==='snap-043');s.values.conditions={state:'unknown',reason:'Missing'};
 assert.equal(suggestedBaseline(b.records,'run-043'),undefined);
 const custom=fixture();const before=custom.records.snapshots.find(s=>s.id==='snap-042'),after=custom.records.snapshots.find(s=>s.id==='snap-043');
 const field={id:'temperature',component:'Cell',name:'Temperature',type:'number',unit:'C',category:'condition',value:{state:'known',value:20},provenance:before.provenance.conditions};
 before.custom=[field];after.custom=[{...field,unit:'F'}];assert.equal(suggestedBaseline(custom.records,'run-043'),undefined);
});
test('retest-only confirmation exports the exact retest snapshot and outcome',()=>{
 const b=fixture();const run=structuredClone(b.records.runs.find(r=>r.id==='run-043'));run.id='retest-1';run.at='2026-10-15T11:00:00Z';b.records.runs.push(run);
 const saved=appendInvestigation(b,{...entry,state:'confirmed-by-engineer',retestId:run.id});
 const report=investigationReport(saved.records,saved.investigations,entry.id,true);
 assert.equal(report.evidence[2].snapshot.id,run.snapshotId);assert.equal(report.evidence[2].snapshot.revision,run.snapshotRevision);assert.equal(report.retests[0].outcome,'failure');assert.ok(report.disclaimer.includes('does not establish success'));
});
