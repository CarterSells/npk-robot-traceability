import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { parseBundle, appendCapture, emptyBundle } from '../lib/local/records.ts';
import { inspectSource, applyMapping, exportMapping } from '../lib/local/custom.ts';

const python=process.env.UNIFY_PYTHON || (existsSync('.tools/python-3.13.7/python.exe') ? resolve('.tools/python-3.13.7/python.exe') : process.platform==='win32'?'python':'python3');
const observedAt='2026-10-10T10:00:00Z';
const field={id:'torque',component:'Arm',name:'Torque',type:'number',unit:'Nm',category:'configuration',source:'/arm/torque/value',unitSource:'/arm/torque/unit'};

test('Python custom captures use browser mappings, exclude unapproved data and attach generic outcomes', () => {
  const dir=mkdtempSync(join(tmpdir(),'unify-custom-synthetic-'));
  try {
    const config={version:1,synthetic:true,robot:{id:'arm',name:'Synthetic arm',task:'Synthetic test'},author:'Synthetic tester',custom:{source:'input.json',mapping:'mapping.json',observedAt}};
    const mapping={id:'approved-arm',name:'Synthetic mapping',format:'json',fields:[field]};
    writeFileSync(join(dir,'config.json'),JSON.stringify(config));writeFileSync(join(dir,'mapping.json'),exportMapping(mapping));
    let bundle=emptyBundle();
    for(const input of [{arm:{torque:{value:12,unit:'Nm'}},secret:'do-not-copy',newMetric:40},{arm:{torque:{value:13,unit:'Nmm'}}},{arm:{torque:{value:'13',unit:'Nm'}}},{}]) {
      const raw=JSON.stringify(input);writeFileSync(join(dir,'input.json'),raw);
      const output=execFileSync(python,['collector/unify_collector.py','capture','--config',join(dir,'config.json'),'--dry-run'],{encoding:'utf8'});
      assert.ok(!output.includes('do-not-copy'));assert.ok(!output.includes(dir));assert.ok(!output.includes('newMetric'));
      const capture=parseBundle(output),s=capture.records.snapshots[0];
      const browser=applyMapping(mapping,inspectSource(raw,'json'),0,s.custom[0].provenance);
      assert.deepEqual(s.custom.map(f=>f.value),browser.map(f=>f.value));
      writeFileSync(join(dir,'capture.json'),output);writeFileSync(join(dir,'run.json'),JSON.stringify({id:s.id,at:'2099-01-01T00:00:00Z',outcome:'success'}));
      const filename=join(dir,s.id+'.json');
      execFileSync(python,['collector/unify_collector.py','attach-run','--capture',join(dir,'capture.json'),'--run',join(dir,'run.json'),'--output',filename]);
      const attached=parseBundle(readFileSync(filename,'utf8'));
      assert.deepEqual(attached.records.snapshots,capture.records.snapshots);
      assert.equal(attached.records.runs[0].attemptedPicks,undefined);
      bundle=appendCapture(bundle,attached);
    }
    assert.equal(bundle.mappings.length,1);assert.equal(bundle.records.snapshots.length,4);
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('Python CSV mapping preserves scalar types and rejects unapproved mapping paths', () => {
  const dir=mkdtempSync(join(tmpdir(),'unify-csv-synthetic-'));
  try {
    const {unitSource,...plain}=field;
    const mapping={id:'csv-map',name:'Synthetic CSV',format:'csv',fields:[{...plain,source:'/torque'}, {id:'active',component:'Leg',name:'Enabled',type:'boolean',unit:'',category:'configuration',source:'/enabled'}]};
    const config={version:1,synthetic:true,robot:{id:'arm',name:'Synthetic arm',task:'Test'},author:'Synthetic tester',custom:{source:'input.csv',mapping:'mapping.json',row:1,observedAt}};
    writeFileSync(join(dir,'config.json'),JSON.stringify(config));writeFileSync(join(dir,'mapping.json'),exportMapping(mapping));
    writeFileSync(join(dir,'input.csv'),'torque,enabled,secret\r\n12,true,excluded\r\n-0.5,false,excluded\r\n');
    const args=['collector/unify_collector.py','capture','--config',join(dir,'config.json'),'--dry-run'];
    const bundle=parseBundle(execFileSync(python,args,{encoding:'utf8'}));
    assert.deepEqual(bundle.records.snapshots[0].custom.map(f=>f.value.value),[-0.5,false]);
    assert.match(bundle.records.snapshots[0].custom[0].provenance.evidence,/CSV data row 2 \(1-based\)/);
    mapping.fields[0].source='/secret';writeFileSync(join(dir,'mapping.json'),JSON.stringify({format:'unify-mapping',version:1,mapping}));
    const rejected=spawnSync(python,args,{encoding:'utf8'});assert.equal(rejected.status,2);assert.ok(!rejected.stderr.includes('Traceback'));
  } finally {rmSync(dir,{recursive:true,force:true});}
});
