import {createHash} from 'node:crypto';
import {readdir,readFile,mkdir,writeFile,lstat} from 'node:fs/promises';
import {resolve,relative,sep} from 'node:path';

// A byte inventory of public output, never an assertion that release gates passed.
const root=resolve('out'), entries=[];
const forbidden=new Set(['local','workspace','api','beta','.cache','.git','docs','collector','supabase','node_modules']);
async function walk(dir){
  for(const entry of await readdir(dir,{withFileTypes:true})){
    if(entry.isSymbolicLink())throw Error('Refusing a symlink in public output.');
    const file=resolve(dir,entry.name),path=relative(root,file).split(sep).join('/');
    if(path.split('/').some(part=>forbidden.has(part)||part.startsWith('.env')))throw Error(`Private path in public output: ${path}`);
    if(entry.isDirectory())await walk(file);
    else if(entry.isFile()){
      const bytes=await readFile(file);entries.push({path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
    }else throw Error('Unsupported entry in public output.');
  }
}
if((await lstat(root)).isSymbolicLink())throw Error('Refusing a symlink as public output root.');
await walk(root);
if(!entries.some(e=>e.path==='index.html')||!entries.some(e=>e.path==='walkthrough/index.html'))throw Error('Build the complete public candidate first.');
entries.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
const digest=createHash('sha256').update(JSON.stringify(entries)).digest('hex');
const manifest={format:'unify-static-release',version:1,artifactId:`unify-static-${digest.slice(0,16)}`,sha256:digest,generatedAt:new Date().toISOString(),status:'candidate-not-publication-proof',files:entries};
await mkdir('.cache/release',{recursive:true});
await writeFile('.cache/release/static-manifest.json',JSON.stringify(manifest,null,2)+'\n');
console.log(`${manifest.artifactId}: ${entries.length} public files. Manifest: .cache/release/static-manifest.json. Live checks and release gates remain separate.`);
