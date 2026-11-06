import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectSource, applyMapping, compareCustom, exportMapping, parseMapping, validateMapping, readPointer } from '../lib/local/custom.ts';
import { addRobot, addMappedSnapshot, addRun, appendCapture, correctField, emptyBundle, exportBundle, parseBundle } from '../lib/local/records.ts';
import { demoRecords } from '../lib/demo/fixtures.ts';

const time = '2026-10-10T10:00:00Z';
const provenance = { source:'Synthetic engineer export', method:'Manual test', author:'Synthetic tester', observedAt:time, recordedAt:time, evidence:'Synthetic fixture', available:false };
const torque = { id:'elbow-torque', component:'Arm / elbow', name:'Torque', type:'number', unit:'Nm', category:'configuration', source:'/arm/torque/value', unitSource:'/arm/torque/unit' };
const mapping = { id:'arm-mapping', name:'Synthetic arm measurements', format:'json', fields:[torque] };
const source = (n=12) => inspectSource(JSON.stringify({ arm:{ torque:{ value:n, unit:'Nm' } }, secret:'do-not-copy', newMetric:42 }), 'json');
function workspace(id='setup-1', document=source(), profile=mapping) {
  const b = addRobot(emptyBundle(), {id:'arm-1',name:'Synthetic arm',task:'Synthetic test'});
  return addMappedSnapshot(b, {id,robotId:'arm-1',mapping:profile,document,row:0,provenance});
}

test('JSON discovers arbitrary components, escaped paths and blocked fields without automatically approving them', () => {
  const document=inspectSource('{"arm":{"torque":{"value":12,"unit":"Nm"}},"leg":{"enabled":true},"a/b~c":3,"api_key":"secret"}', 'json');
  assert.equal(document.candidates.find(f=>f.source==='/arm/torque/value').unit,'Nm');
  assert.equal(document.candidates.find(f=>f.source==='/leg/enabled').type,'boolean');
  assert.equal(document.candidates.find(f=>f.source==='/api_key').sample,undefined);
  assert.equal(document.candidates.find(f=>f.source==='/api_key').blocked,true);
  const approved=applyMapping(mapping,document,0,provenance);
  assert.equal(approved.length,1); assert.equal(approved[0].value.value,12);
  assert.ok(!JSON.stringify(approved).includes('secret'));
  const {unitSource,...scalar}=torque;
  assert.equal(applyMapping({...mapping,fields:[{...scalar,source:'/a~1b~0c'}]},document,0,provenance)[0].value.value,3);
});

test('reused mappings preserve IDs, ignore new fields, and expose missing, type and unit mismatches', () => {
  for (const raw of ['{}','{"arm":{"torque":{"value":"12","unit":"Nm"}}}','{"arm":{"torque":{"value":12,"unit":"Nmm"}}}']) {
    const custom=applyMapping(mapping,inspectSource(raw,'json'),0,provenance);
    assert.equal(custom[0].value.state,'unknown');
    assert.equal(compareCustom({custom},{custom}).rows[0].result,'Unknown');
  }
  assert.deepEqual(parseMapping(exportMapping(mapping)),mapping);
  assert.deepEqual(applyMapping(mapping,source(),0,provenance).map(f=>f.id),['elbow-torque']);
});

test('CSV handles quoted commas, newlines, booleans, numbers and selected rows', () => {
  const document=inspectSource('Torque [Nm],label,enabled\r\n12,"a,b",true\r\n15,"two\nlines",false\r\n','csv');
  const profile={...mapping,format:'csv',fields:[{...torque,source:'/Torque [Nm]',unitSource:undefined}, {id:'label',component:'Robot',name:'Label',type:'text',unit:'',category:'configuration',source:'/label'}, {id:'enabled',component:'Leg',name:'Enabled',type:'boolean',unit:'',category:'configuration',source:'/enabled'}].map(({unitSource,...f})=>f)};
  const custom=applyMapping(profile,document,1,provenance);
  assert.deepEqual(custom.map(f=>f.value.value),[15,'two\nlines',false]);
  assert.match(custom[0].provenance.evidence,/CSV data row 2 \(1-based\)/);
  assert.equal(document.candidates[0].unit,'Nm');
  assert.throws(()=>applyMapping(profile,document,2,provenance),/row/);
});

test('only JSON array elements are addressable and custom observations must precede referenced runs', () => {
  assert.equal(readPointer({arm:[12]},'/arm/0'),12);
  for (const key of ['length','01','-1','__proto__']) assert.equal(readPointer({arm:[12]},'/arm/'+key),undefined);
  const b=workspace();
  b.records.snapshots[0].custom[0].provenance.observedAt='2026-10-10T11:00:00Z';
  b.records.snapshots[0].custom[0].provenance.recordedAt='2026-10-10T11:00:00Z';
  assert.throws(()=>addRun(b,{id:'early',robotId:'arm-1',snapshotId:'setup-1',snapshotRevision:1,at:time,outcome:'success'}),/custom observation is after/);
});

test('source and mapping limits reject ambiguous or unsafe input', () => {
  for (const raw of ['{"x":1,"x":2}','{"x":{"a":1,"a":2}}','['.repeat(17)+'0'+']'.repeat(17)]) assert.throws(()=>inspectSource(raw,'json'));
  for (const raw of ['x,x\n1,2','x,y\n1','x\n"unfinished','x\n"closed"junk']) assert.throws(()=>inspectSource(raw,'csv'));
  for (const field of [{...torque,source:'/api_key'}, {...torque,unit:''}, {...torque,source:'/bad~2pointer'}]) assert.throws(()=>validateMapping({...mapping,fields:[field]}));
  assert.throws(()=>inspectSource('x'.repeat(2*1024*1024+1),'json'),/2 MiB/);
});

test('custom comparisons retain units, flag incompatible definitions and changed test conditions', () => {
  const a=workspace().records.snapshots[0],b=workspace('setup-2',source(20)).records.snapshots[0];
  assert.equal(compareCustom(a,b).rows[0].result,'Changed');
  assert.equal(compareCustom(a,b).rows[0].after.value,'20 Nm');
  b.custom[0].unit='Nmm'; assert.equal(compareCustom(a,b).rows[0].result,'Unknown');
  assert.match(compareCustom(a,b).warnings[0],/units differ/);
  a.custom[0].category=b.custom[0].category='condition'; b.custom[0].unit='Nm';
  assert.match(compareCustom(a,b).warnings[0],/comparability/);
  assert.equal(compareCustom(a,{}).rows[0].result,'Unknown');
});

test('custom and core corrections preserve each other and exact run references across export', () => {
  const original=workspace();
  const b=addRun(original,{id:'run-1',robotId:'arm-1',snapshotId:'setup-1',snapshotRevision:1,at:time,outcome:'success'});
  const c=correctField(b,b.records.snapshots[0],'custom:elbow-torque',{state:'known',value:14},{...provenance,method:'Manual metadata correction'},'Synthetic typo');
  const d=correctField(c,c.records.snapshots[1],'model',{state:'not-applicable',reason:'No model in this test'},provenance,'Declare applicability');
  assert.equal(d.records.runs[0].snapshotRevision,1); assert.equal(d.records.snapshots[0].custom[0].value.value,12);
  assert.equal(d.records.snapshots[2].custom[0].value.value,14);
  assert.deepEqual(parseBundle(exportBundle(d)),d);
  for (const mutate of [x=>x.records.snapshots[1].custom[0].unit='Nmm',x=>x.records.snapshots[2].custom[0].value.value=999,x=>x.records.snapshots[1].values.model={state:'known',value:'undeclared'},x=>x.corrections[0].field='custom:absent']) {
    const bad=structuredClone(d); mutate(bad); assert.throws(()=>exportBundle(bad));
  }
  assert.equal(original.records.snapshots.length,1);
});

test('v1 records remain readable; v2 merges atomically and does not relax legacy run counts', () => {
  const legacy={format:'unify-local',version:1,synthetic:true,records:structuredClone(demoRecords),corrections:[]};
  assert.deepEqual(parseBundle(exportBundle(legacy)),legacy);
  const capture=workspace();capture.synthetic=true;
  const merged=appendCapture(legacy,capture); assert.equal(merged.version,2);
  assert.deepEqual(appendCapture(merged,capture),merged);
  const invalid=structuredClone(capture);invalid.mappings[0].name='Conflicting mapping';
  assert.throws(()=>appendCapture(merged,invalid),/Mapping identity conflicts/);
  const bad=structuredClone(merged);delete bad.records.runs[0].successfulPicks;delete bad.records.runs[0].attemptedPicks;
  assert.throws(()=>exportBundle(bad),/pick counts/);
  assert.throws(()=>addRun(capture,{id:'bad',robotId:'arm-1',snapshotId:'setup-1',snapshotRevision:1,at:time,outcome:'failure',successfulPicks:2}),/integer/);
});
