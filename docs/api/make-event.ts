// node --experimental-strip-types docs/api/make-event.ts <capture> <output> <identity> <event-id> <sequence> --reviewed
// Use private paths outside the repository. This example never sends network traffic.
import {readFile,writeFile} from 'node:fs/promises';
import {validateMachineEvent} from '../../lib/beta/machines.ts';
const [capturePath,output,identity,eventId,sequence,reviewed]=process.argv.slice(2);
if(!capturePath||!output||reviewed!=='--reviewed'||!/^\d+$/.test(sequence??''))throw Error('Provide capture, output, identity, stable event ID, sequence and --reviewed.');
const capture=JSON.parse(await readFile(capturePath,'utf8'));
const run=capture.records.runs[0];
const event=validateMachineEvent({event_id:eventId,schema_version:1,source_identity:identity,source_sequence:Number(sequence),run_id:run.id,observed_at:new Date(run.at).toISOString(),event_type:'run.recorded',payload:{capture}});
await writeFile(output,JSON.stringify(event),{flag:'wx',mode:0o600});
