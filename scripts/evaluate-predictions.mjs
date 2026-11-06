import {readFileSync,realpathSync,statSync,openSync,writeFileSync,fsyncSync,closeSync} from 'node:fs';
import {resolve,relative,isAbsolute,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {curateDataset,evaluateBaseline,registryEntry} from '../lib/beta/prediction-evaluation.ts';
const [input,directory,actor]=process.argv.slice(2);
if(!input||!directory||!actor)throw Error('Usage: node --experimental-strip-types scripts/evaluate-predictions.mjs INPUT_JSON EXISTING_PRIVATE_DIRECTORY ACTOR');
const repo=realpathSync(resolve(dirname(fileURLToPath(import.meta.url)),'..')),source=realpathSync(input),target=realpathSync(directory);
const within=p=>{const r=relative(repo,p);return r===''||(r!=='..'&&!r.startsWith('..'+sep)&&!isAbsolute(r));};
if(within(source)||within(target)||!statSync(target).isDirectory())throw Error('Input and output require preconfigured private storage outside the repository.');
if(statSync(source).size>8*1024*1024)throw Error('Curated input exceeds 8 MiB.');
const raw=JSON.parse(readFileSync(source,'utf8')),dataset=curateDataset(raw),evaluation=evaluateBaseline(raw),registry=registryEntry(evaluation,evaluation.state,actor,'Offline candidate evaluation; serving unavailable.');
const artifact=JSON.stringify({format:'tavrik-offline-evaluation',version:1,dataset,evaluation,registry},null,2),hash=createHash('sha256').update(artifact).digest('hex');
const fd=openSync(resolve(target,'evaluation-'+hash+'.json'),'wx',0o600);
try{writeFileSync(fd,artifact);fsyncSync(fd);}finally{closeSync(fd);}
console.log(JSON.stringify({artifact_sha256:hash,state:evaluation.state,available:false}));
