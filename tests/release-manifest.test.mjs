import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
import {spawnSync} from 'node:child_process';
const script=resolve('scripts/release-manifest.mjs');
function fixture(work){const dir=mkdtempSync(join(tmpdir(),'unify-release-'));try{mkdirSync(join(dir,'out/walkthrough'),{recursive:true});writeFileSync(join(dir,'out/index.html'),'synthetic home');writeFileSync(join(dir,'out/walkthrough/index.html'),'synthetic walkthrough');work(dir);}finally{assert.equal(dirname(resolve(dir)),resolve(tmpdir()));assert.ok(basename(dir).startsWith('unify-release-'));rmSync(dir,{recursive:true,force:true});}}
const run=dir=>spawnSync(process.execPath,[script],{cwd:dir,encoding:'utf8'});
const manifest=dir=>JSON.parse(readFileSync(join(dir,'.cache/release/static-manifest.json'),'utf8'));
test('release identity hashes public bytes deterministically and changes with content',()=>fixture(dir=>{
 assert.equal(run(dir).status,0);const first=manifest(dir);assert.equal(first.files.length,2);assert.equal(first.status,'candidate-not-publication-proof');
 assert.equal(run(dir).status,0);assert.equal(manifest(dir).artifactId,first.artifactId);
 writeFileSync(join(dir,'out/index.html'),'changed synthetic home');assert.equal(run(dir).status,0);assert.notEqual(manifest(dir).artifactId,first.artifactId);
}));
test('release inventory refuses accidentally exported private routes and environment files',()=>{
 for(const path of ['workspace','beta','.env.local'])fixture(dir=>{writeFileSync(join(dir,'out',path),'synthetic forbidden entry');const result=run(dir);assert.notEqual(result.status,0);assert.match(result.stderr,/Private path/);});
});
