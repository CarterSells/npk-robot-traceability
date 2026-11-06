import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { configure, root } from './local-supabase.mjs';
try {
  const local=configure();
  const child=spawn(process.execPath,[resolve(root,'node_modules/next/dist/bin/next'),'dev','beta','--hostname','127.0.0.1','--port','3002'],{cwd:root,env:{...process.env,...local},stdio:'inherit',windowsHide:true});
  child.on('error',()=>{console.error('Unable to start the local beta server.');process.exitCode=1;});
  child.on('exit',code=>{process.exitCode=code??1;});
} catch(error) { console.error(error.message);process.exitCode=1; }
